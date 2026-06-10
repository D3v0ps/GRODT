import { logActivity } from "@/lib/activity";
import { getConfiguredProvider } from "@/lib/providers";
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
 * Hela synkflödet: provider → upsert → leads → import_run + audit log.
 * Anropas från servern (server action eller cron-route), aldrig klienten.
 */
export async function performSync(
  options: PerformSyncOptions,
): Promise<PerformSyncOutcome> {
  const provider = options.provider ?? getConfiguredProvider();
  if (!provider) {
    return {
      ok: false,
      message:
        "Ingen dataleverantör är konfigurerad (DATA_PROVIDER). Importera bolag via CSV i Import & synk, eller konfigurera tic.io.",
    };
  }

  const admin = createSupabaseAdminClient();

  // Databasvakt mot parallella körningar.
  const staleCutoff = new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString();
  const { data: running } = await admin
    .from("import_runs")
    .select("id")
    .eq("status", "running")
    .gte("started_at", staleCutoff)
    .limit(1);
  if (running && running.length > 0) {
    return { ok: false, message: "En synk pågår redan – vänta tills den är klar." };
  }

  const settings = await getSyncFilter(admin);

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
    return { ok: false, message: `Kunde inte starta körningen: ${runError?.message}` };
  }

  let result: SyncResult;
  try {
    result = await runSync(provider, new SupabaseSyncStore(admin), settings);
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
    },
  });

  const message =
    result.errors.length > 0
      ? `Synk klar med ${result.errors.length} fel – ${result.created} nya, ${result.updated} uppdaterade`
      : `Synk slutförd – ${result.created} nya bolag, ${result.updated} uppdaterade`;
  return { ok: result.errors.length === 0, message, result };
}
