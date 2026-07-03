"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  AF_TJANSTEKOD,
  fetchAfLeverantorer,
  type AfLeverantor,
} from "@/lib/providers/af-leverantorer";
import { getSyncFilter } from "@/lib/settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { importCompany } from "@/lib/sync/engine";
import { SupabaseSyncStore } from "@/lib/sync/supabase-store";
import type { ActionResult } from "./types";

/** Stanna snyggt innan plattformens tidsgräns (300 s) – som övriga körningar. */
const RUN_BUDGET_MS = 240_000;
/** Hämtningen får max så här mycket av budgeten; resten går till databasen. */
const FETCH_BUDGET_MS = 150_000;

export interface AfImportResult extends ActionResult {
  leverantorer?: number;
  nya?: number;
  leads?: number;
  kontakter?: number;
}

/**
 * Importerar Arbetsförmedlingens leverantörsregister för Rusta och
 * matcha. Varje leverantör är per definition målgruppen, därför:
 *  - lead skapas oavsett omsättningsfilter (leadMode 'always')
 *  - bolaget klassas 'omstallning' (om det inte redan är målgruppsklassat)
 *  - leadet skyddas från SNI-utflyttning (target_kept) och återställs
 *    om det låg utflyttat
 *  - kontaktpersonen (namn/telefon/e-post) sparas källmärkt
 * Körningen loggas i import-historiken och audit-loggen som vanligt.
 */
export async function importAfLeverantorerAction(): Promise<AfImportResult> {
  try {
    const session = await requireUser();
    const userLimit = checkRateLimit(`af-import:${session.userId}`, 2, 600_000);
    if (!userLimit.ok) {
      return {
        ok: false,
        message: `Nyss körd – vänta ${userLimit.retryAfterSeconds} s innan nästa hämtning.`,
      };
    }

    const admin = createSupabaseAdminClient();

    // Samma atomiska vakt som synken: max en pågående körning.
    const { data: run, error: runError } = await admin
      .from("import_runs")
      .insert({
        started_by: session.userId,
        status: "running",
        source: "arbetsformedlingen",
        trigger: "manuell",
      })
      .select("id")
      .single();
    if (runError || !run) {
      if (runError?.code === "23505") {
        return { ok: false, message: "En körning pågår redan – vänta tills den är klar." };
      }
      return { ok: false, message: `Kunde inte starta körningen: ${runError?.message}` };
    }

    const finishRun = async (
      status: "ok" | "fel",
      counts: { fetched: number; created: number; updated: number },
      errors: { orgnr: string | null; message: string }[],
    ) => {
      await admin
        .from("import_runs")
        .update({
          finished_at: new Date().toISOString(),
          status,
          fetched: counts.fetched,
          created: counts.created,
          updated: counts.updated,
          errors,
        })
        .eq("id", run.id);
    };

    const deadlineMs = Date.now() + RUN_BUDGET_MS;
    let leverantorer: AfLeverantor[] = [];
    let stoppedEarly = false;
    let fel: { orgnr: string | null; message: string }[] = [];
    try {
      const fetched = await fetchAfLeverantorer({
        tjanstekod: AF_TJANSTEKOD,
        deadlineMs: Date.now() + FETCH_BUDGET_MS,
      });
      // Registret listar samma bolag flera gånger (en enhet per ort) –
      // importera varje orgnr en gång, första träffen vinner.
      const perOrgnr = new Map<string, AfLeverantor>();
      for (const lev of fetched.leverantorer) {
        if (!perOrgnr.has(lev.orgnr)) perOrgnr.set(lev.orgnr, lev);
      }
      leverantorer = [...perOrgnr.values()];
      stoppedEarly = fetched.stoppedEarly;
      fel = fetched.fel;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await finishRun("fel", { fetched: 0, created: 0, updated: 0 }, [
        { orgnr: null, message },
      ]);
      return { ok: false, message: `Hämtningen misslyckades: ${message}` };
    }

    const settings = await getSyncFilter(admin);
    const store = new SupabaseSyncStore(admin, session.userId);
    let created = 0;
    let updated = 0;
    let leads = 0;
    let kontakter = 0;

    let imported = 0;
    for (const lev of leverantorer) {
      if (Date.now() >= deadlineMs) {
        stoppedEarly = true;
        break;
      }
      imported++;
      try {
        const outcome = await importCompany(store, settings, {
          details: {
            orgnr: lev.orgnr,
            namn: lev.namn,
            ort: lev.ort,
            sniKod: null,
            adress: lev.adress,
            antalAnstallda: null,
            hemsida: lev.hemsida,
            telefon: lev.telefon,
          },
          financials: [],
          kalla: "arbetsformedlingen",
          leadMode: "always",
        });
        if (outcome.company === "created") created++;
        else updated++;
        if (outcome.leadCreated) leads++;

        // Aktiv leverantör hos AF = målgrupp: klassa som omställning om
        // bolaget inte redan är målgruppsklassat.
        await admin
          .from("companies")
          .update({
            bransch_klass: "omstallning",
            bransch_klass_kalla: "arbetsformedlingen",
            bransch_klass_at: new Date().toISOString(),
          })
          .eq("orgnr", lev.orgnr)
          .or("bransch_klass.is.null,bransch_klass.in.(annat,personaluthyrning)");

        // Återställ ev. utflyttat lead och skydda från automatiken.
        const { data: restored } = await admin
          .from("leads")
          .update({ off_target_at: null, off_target_sni: null, target_kept: true })
          .eq("orgnr", lev.orgnr)
          .not("off_target_at", "is", null)
          .select("id");
        if (restored && restored.length > 0) {
          await logActivity({
            actorId: session.userId,
            entityType: "lead",
            entityId: lev.orgnr,
            action: "ater_malbild",
            payload: { orgnr: lev.orgnr, namn: lev.namn, kalla: "arbetsformedlingen" },
          });
        }
        await admin
          .from("leads")
          .update({ target_kept: true })
          .eq("orgnr", lev.orgnr)
          .eq("target_kept", false);

        // Kontaktpersonen från registret – hoppa över om namnet redan finns.
        if (lev.kontaktNamn) {
          const { data: existing } = await admin
            .from("company_contacts")
            .select("id")
            .eq("orgnr", lev.orgnr)
            .ilike("namn", lev.kontaktNamn)
            .limit(1);
          if (!existing || existing.length === 0) {
            const { error: contactError } = await admin.from("company_contacts").insert({
              orgnr: lev.orgnr,
              namn: lev.kontaktNamn,
              telefon: lev.telefon,
              epost: lev.epost,
              kalla: "arbetsformedlingen",
              created_by: session.userId,
            });
            if (!contactError) kontakter++;
          }
        }
      } catch (e) {
        fel.push({
          orgnr: lev.orgnr,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    await finishRun(
      fel.length > 0 ? "fel" : "ok",
      { fetched: imported, created, updated },
      fel.slice(0, 50),
    );

    await logActivity({
      actorId: session.userId,
      entityType: "synk",
      entityId: run.id,
      action: "synk",
      payload: {
        source: "arbetsformedlingen",
        trigger: "manuell",
        hamtade: leverantorer.length,
        nya: created,
        uppdaterade: updated,
        leads,
        kontakter,
        fel: fel.length,
        avbruten_i_tid: stoppedEarly,
      },
    });

    revalidatePath("/synk");
    revalidatePath("/bolag");
    revalidatePath("/pipeline");
    revalidatePath("/dashboard");

    const suffix = stoppedEarly
      ? " (tidsbudgeten nåddes – kör igen för resten)"
      : "";
    return {
      ok: fel.length === 0,
      message:
        fel.length > 0
          ? `Import klar med ${fel.length} fel – ${leverantorer.length} leverantörer, ${created} nya bolag, ${leads} nya leads${suffix}`
          : `${leverantorer.length} leverantörer hämtade – ${created} nya bolag, ${leads} nya leads, ${kontakter} kontaktpersoner${suffix}`,
      leverantorer: leverantorer.length,
      nya: created,
      leads,
      kontakter,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}
