import { logActivity } from "@/lib/activity";
import { resolveProvider } from "@/lib/providers";
import type { CompanyDataProvider } from "@/lib/providers/types";
import { getSyncFilter } from "@/lib/settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runSync, type SyncResult } from "./engine";
import { SupabaseSyncStore } from "./supabase-store";

export interface PerformSyncOptions {
  actorId: string | null;
  trigger: "manuell" | "cron";
  /** Explicit provider (t.ex. i seed-skriptet); annars enligt DATA_PROVIDER. */
  provider?: CompanyDataProvider;
}

export interface PerformSyncOutcome {
  ok: boolean;
  message: string;
  result?: SyncResult;
}

/** Vakt: anses en körning hänga om den varit "running" längre än så här. */
const STALE_RUN_MINUTES = 15;

/**
 * Tidsbudget per körning: stanna snyggt INNAN plattformen avbryter
 * funktionen, så att körningen aldrig lämnas kvar som zombie.
 */
const RUN_BUDGET_MS = 240_000;

/**
 * Hela synkflödet: provider → upsert → leads → import_run + audit log.
 * Anropas från servern (server action eller cron-route), aldrig klienten.
 */
export async function performSync(
  options: PerformSyncOptions,
): Promise<PerformSyncOutcome> {
  const admin = createSupabaseAdminClient();
  const provider = options.provider ?? (await resolveProvider(admin));
  if (!provider) {
    return {
      ok: false,
      message:
        "Ingen dataleverantör är konfigurerad. Importera bolag via CSV i Import & synk, eller aktivera Bolagsverket/tic.io.",
    };
  }

  // Zombiestädning: körningar utan livstecken (progress_at stämplas av
  // CSV-batcharna) markeras som fel, annars blockerar de det unika
  // indexet för pågående körningar för alltid.
  const staleCutoff = new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString();
  await admin
    .from("import_runs")
    .update({
      status: "fel",
      finished_at: new Date().toISOString(),
      errors: [
        { orgnr: null, message: "Körningen avbröts: inget svar (avbruten av servern)." },
      ],
    })
    .eq("status", "running")
    .lt("progress_at", staleCutoff);

  const settings = await getSyncFilter(admin);

  // Atomisk vakt mot parallella körningar: partiellt unikt index tillåter
  // max en rad med status 'running' – en kapplöpning ger 23505 här.
  const { data: run, error: runError } = await admin
    .from("import_runs")
    .insert({
      started_by: options.actorId,
      status: "running",
      source: provider.name,
      trigger: options.trigger,
    })
    .select("id")
    .single();
  if (runError || !run) {
    if (runError?.code === "23505") {
      return { ok: false, message: "En synk pågår redan – vänta tills den är klar." };
    }
    return { ok: false, message: `Kunde inte starta körningen: ${runError?.message}` };
  }

  let result: SyncResult;
  try {
    result = await runSync(provider, new SupabaseSyncStore(admin, options.actorId), settings, {
      deadlineMs: Date.now() + RUN_BUDGET_MS,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin
      .from("import_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "fel",
        errors: [{ orgnr: null, message }],
      })
      .eq("id", run.id);
    return { ok: false, message: `Synken misslyckades: ${message}` };
  }

  await admin
    .from("import_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: result.errors.length > 0 ? "fel" : "ok",
      fetched: result.fetched,
      created: result.created,
      updated: result.updated,
      errors: result.errors,
    })
    .eq("id", run.id);

  await logActivity({
    actorId: options.actorId,
    entityType: "synk",
    entityId: run.id,
    action: "synk",
    payload: {
      source: provider.name,
      trigger: options.trigger,
      hamtade: result.fetched,
      nya: result.created,
      uppdaterade: result.updated,
      leads: result.leadsCreated,
      fel: result.errors.length,
      avbruten_i_tid: result.stoppedEarly,
    },
  });

  const suffix = result.stoppedEarly
    ? " (tidsbudgeten nåddes – resten tas i nästa körning)"
    : "";
  const message =
    result.errors.length > 0
      ? `Synk klar med ${result.errors.length} fel – ${result.created} nya, ${result.updated} uppdaterade${suffix}`
      : `Synk slutförd – ${result.created} nya bolag, ${result.updated} uppdaterade${suffix}`;
  return { ok: result.errors.length === 0, message, result };
}
