import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyDetails, YearFinancials } from "@/lib/providers/types";
import { qualifies } from "@/lib/qualification";
import type { SyncSettings } from "./engine";
import { sanitizeFinancials } from "./supabase-store";

/**
 * Bulkimport för stora CSV-filer: i stället för 3–4 frågor per bolag görs
 * 3–4 frågor per BATCH (upp till 500 bolag), vilket gör att hundratusentals
 * rader kan importeras inom rimlig tid. Idempotensen bärs av samma
 * constraints som alltid: companies.orgnr PK, UNIQUE(orgnr, year) och
 * leads.orgnr UNIQUE.
 */

export interface BulkRow {
  details: CompanyDetails;
  financials: YearFinancials[];
}

export interface BulkResult {
  created: number;
  updated: number;
  leadsCreated: number;
}

/** Hålls under PostgREST:s URL-gräns för `in`-filter. */
export const BULK_BATCH_SIZE = 500;

export async function importBatch(
  supabase: SupabaseClient,
  settings: SyncSettings,
  rows: BulkRow[],
  leadMode: "qualified" | "always",
  kalla = "csv",
  /** Vem som importerar – för audit-loggen när nya leads skapas. */
  actorId: string | null = null,
): Promise<BulkResult> {
  if (rows.length === 0) return { created: 0, updated: 0, leadsCreated: 0 };
  if (rows.length > BULK_BATCH_SIZE) {
    throw new Error(`Batchen är för stor (${rows.length} > ${BULK_BATCH_SIZE}).`);
  }

  const orgnrs = rows.map((r) => r.details.orgnr);

  const { data: existing, error: existingError } = await supabase
    .from("companies")
    .select("orgnr, namn, sni_kod, ort, adress, antal_anstallda, hemsida, telefon")
    .in("orgnr", orgnrs);
  if (existingError) throw new Error(existingError.message);
  const existingByOrgnr = new Map((existing ?? []).map((r) => [r.orgnr, r]));
  const existingSet = new Set(existingByOrgnr.keys());

  const now = new Date().toISOString();
  // Berikningsvänlig merge: tomma fält i filen skriver aldrig över
  // befintliga värden (t.ex. bokslutsdata/kontakt från andra källor).
  const { error: companyError } = await supabase.from("companies").upsert(
    rows.map(({ details }) => {
      const prev = existingByOrgnr.get(details.orgnr);
      return {
        orgnr: details.orgnr,
        namn:
          details.namn && details.namn !== "Okänt bolagsnamn"
            ? details.namn
            : (prev?.namn ?? details.namn),
        sni_kod: details.sniKod ?? prev?.sni_kod ?? null,
        ort: details.ort ?? prev?.ort ?? null,
        adress: details.adress ?? prev?.adress ?? null,
        antal_anstallda: details.antalAnstallda ?? prev?.antal_anstallda ?? null,
        hemsida: details.hemsida ?? prev?.hemsida ?? null,
        telefon: details.telefon ?? prev?.telefon ?? null,
        kalla,
        last_synced_at: now,
      };
    }),
    { onConflict: "orgnr" },
  );
  if (companyError) throw new Error(companyError.message);

  // Trelägesmerge för nyckeltalen: tomma kolumner i filen (null) får inte
  // nollställa t.ex. resultat/soliditet som hämtats från Bolagsverket.
  const sanitized = rows.map(({ details, financials }) => ({
    orgnr: details.orgnr,
    financials: sanitizeFinancials(financials),
  }));
  const financialKeys = sanitized.flatMap((r) =>
    r.financials.map((f) => ({ orgnr: r.orgnr, year: f.year })),
  );
  if (financialKeys.length > 0) {
    const years = [...new Set(financialKeys.map((k) => k.year))];
    const { data: prevRows, error: prevError } = await supabase
      .from("company_financials")
      .select("orgnr, year, revenue_sek, profit_sek, employees, soliditet")
      .in("orgnr", orgnrs)
      .in("year", years);
    if (prevError) throw new Error(prevError.message);
    const prevByKey = new Map(
      (prevRows ?? []).map((r) => [`${r.orgnr}:${r.year}`, r]),
    );

    const financialRows = sanitized.flatMap(({ orgnr, financials }) =>
      financials.map((f) => {
        const old = prevByKey.get(`${orgnr}:${f.year}`);
        return {
          orgnr,
          year: f.year,
          revenue_sek: f.revenueSek ?? old?.revenue_sek ?? null,
          profit_sek: f.profitSek ?? old?.profit_sek ?? null,
          employees: f.employees ?? old?.employees ?? null,
          soliditet: f.soliditetPct ?? old?.soliditet ?? null,
        };
      }),
    );
    const { error } = await supabase
      .from("company_financials")
      .upsert(financialRows, { onConflict: "orgnr,year" });
    if (error) throw new Error(error.message);
  }

  // Lead-beslut per rad enligt ELLER-regeln (eller "always" från UI:t).
  const wantedOrgnrs = rows
    .filter(
      (r) =>
        leadMode === "always" ||
        qualifies(
          r.financials.map((f) => ({ year: f.year, revenueSek: f.revenueSek })),
          settings,
        ),
    )
    .map((r) => r.details.orgnr);

  let leadsCreated = 0;
  if (wantedOrgnrs.length > 0) {
    const { data: existingLeads, error: leadSelectError } = await supabase
      .from("leads")
      .select("orgnr")
      .in("orgnr", wantedOrgnrs);
    if (leadSelectError) throw new Error(leadSelectError.message);
    const leadSet = new Set((existingLeads ?? []).map((r) => r.orgnr));
    const toInsert = wantedOrgnrs.filter((o) => !leadSet.has(o));
    if (toInsert.length > 0) {
      const { data: insertedLeads, error } = await supabase
        .from("leads")
        .upsert(
          toInsert.map((orgnr) => ({ orgnr, status: "ny" })),
          { onConflict: "orgnr", ignoreDuplicates: true },
        )
        .select("orgnr");
      if (error) throw new Error(error.message);
      const inserted = (insertedLeads ?? []).map((r) => r.orgnr as string);
      leadsCreated = inserted.length;

      // Audit-loggen ska visa alla nya leads, även import-skapade.
      if (inserted.length > 0) {
        const namnByOrgnr = new Map(rows.map((r) => [r.details.orgnr, r.details.namn]));
        const { error: logError } = await supabase.from("activities").insert(
          inserted.map((orgnr) => ({
            actor_id: actorId,
            entity_type: "lead",
            entity_id: orgnr,
            action: "lead_skapad",
            payload: { orgnr, namn: namnByOrgnr.get(orgnr) ?? null, kalla },
          })),
        );
        if (logError) console.error("Kunde inte logga nya leads:", logError.message);
      }
    }
  }

  const created = orgnrs.filter((o) => !existingSet.has(o)).length;
  return { created, updated: rows.length - created, leadsCreated };
}
