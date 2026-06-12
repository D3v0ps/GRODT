import type { SupabaseClient } from "@supabase/supabase-js";
import type { YearFinancials } from "@/lib/providers/types";
import type { CompanyUpsert, SyncStore } from "./store";

/**
 * SyncStore mot Supabase. Körs alltid med service role-klienten eftersom
 * companies/financials endast skrivs server-side. Idempotensen bärs av
 * databasens constraints: companies.orgnr PK, UNIQUE(orgnr, year) och
 * leads.orgnr UNIQUE.
 */
export class SupabaseSyncStore implements SyncStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async upsertCompany(company: CompanyUpsert): Promise<"created" | "updated"> {
    const { data: existing, error: selectError } = await this.supabase
      .from("companies")
      .select(
        "orgnr, namn, sni_kod, ort, adress, antal_anstallda, hemsida, telefon, verksamhetsbeskrivning, registreringsdatum, bolagsform, avregistrerad_datum, reklamsparr",
      )
      .eq("orgnr", company.orgnr)
      .maybeSingle();
    if (selectError) throw new Error(selectError.message);

    // Berikningsvänlig merge: källor som saknar ett fält (t.ex. Bolagsverket
    // har inte hemsida/telefon/anställda) skriver aldrig över befintliga
    // värden med null. Berikningsfälten har trelägeslogik:
    // undefined = källan vet inte (rör ej), null/värde = auktoritativt svar.
    const namn =
      company.namn && company.namn !== "Okänt bolagsnamn"
        ? company.namn
        : (existing?.namn ?? company.namn);
    const { error } = await this.supabase.from("companies").upsert(
      {
        orgnr: company.orgnr,
        namn,
        sni_kod: company.sniKod ?? existing?.sni_kod ?? null,
        ort: company.ort ?? existing?.ort ?? null,
        adress: company.adress ?? existing?.adress ?? null,
        antal_anstallda: company.antalAnstallda ?? existing?.antal_anstallda ?? null,
        hemsida: company.hemsida ?? existing?.hemsida ?? null,
        telefon: company.telefon ?? existing?.telefon ?? null,
        verksamhetsbeskrivning:
          company.verksamhetsbeskrivning === undefined
            ? (existing?.verksamhetsbeskrivning ?? null)
            : company.verksamhetsbeskrivning,
        registreringsdatum:
          company.registreringsdatum === undefined
            ? (existing?.registreringsdatum ?? null)
            : company.registreringsdatum,
        bolagsform:
          company.bolagsform === undefined
            ? (existing?.bolagsform ?? null)
            : company.bolagsform,
        avregistrerad_datum:
          company.avregistreradDatum === undefined
            ? (existing?.avregistrerad_datum ?? null)
            : company.avregistreradDatum,
        reklamsparr:
          company.reklamsparr === undefined
            ? (existing?.reklamsparr ?? false)
            : company.reklamsparr,
        kalla: company.kalla,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "orgnr" },
    );
    if (error) throw new Error(error.message);
    return existing ? "updated" : "created";
  }

  /**
   * Avregistrerat bolag: flytta eventuellt lead till Förlorad och logga
   * i audit-loggen (systemhändelse, actor null).
   */
  async markLeadLost(orgnr: string, namn: string, orsak: string): Promise<boolean> {
    const { data: lead, error: selectError } = await this.supabase
      .from("leads")
      .select("id, status")
      .eq("orgnr", orgnr)
      .maybeSingle();
    if (selectError) throw new Error(selectError.message);
    if (!lead || lead.status === "forlorad") return false;

    const { error } = await this.supabase
      .from("leads")
      .update({ status: "forlorad" })
      .eq("id", lead.id);
    if (error) throw new Error(error.message);

    await this.supabase.from("activities").insert({
      actor_id: null,
      entity_type: "lead",
      entity_id: orgnr,
      action: "status_andrad",
      payload: { orgnr, namn, fran: lead.status, till: "forlorad", orsak },
    });
    return true;
  }

  async upsertFinancials(orgnr: string, rows: YearFinancials[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.supabase.from("company_financials").upsert(
      rows.map((row) => ({
        orgnr,
        year: row.year,
        revenue_sek: row.revenueSek,
        profit_sek: row.profitSek,
        employees: row.employees,
        soliditet: row.soliditetPct ?? null,
      })),
      { onConflict: "orgnr,year" },
    );
    if (error) throw new Error(error.message);
  }

  async hasLead(orgnr: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("orgnr", orgnr);
    if (error) throw new Error(error.message);
    return (count ?? 0) > 0;
  }

  async createLead(orgnr: string): Promise<void> {
    const { error } = await this.supabase
      .from("leads")
      .upsert(
        { orgnr, status: "ny" },
        { onConflict: "orgnr", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
  }
}
