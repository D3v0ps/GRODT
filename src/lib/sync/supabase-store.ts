import type { SupabaseClient } from "@supabase/supabase-js";
import type { YearFinancials } from "@/lib/providers/types";
import type { CompanyUpsert, LeadMeta, SyncStore } from "./store";

/**
 * SyncStore mot Supabase. Körs alltid med service role-klienten eftersom
 * companies/financials endast skrivs server-side. Idempotensen bärs av
 * databasens constraints: companies.orgnr PK, UNIQUE(orgnr, year) och
 * leads.orgnr UNIQUE.
 */
export class SupabaseSyncStore implements SyncStore {
  constructor(
    private readonly supabase: SupabaseClient,
    /** Vem som startade körningen – används i audit-loggen (null = automatik). */
    private readonly actorId: string | null = null,
  ) {}

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
      .update({ status: "forlorad", follow_up_at: null, follow_up_note: null, follow_up_user: null })
      .eq("id", lead.id);
    if (error) throw new Error(error.message);

    await this.supabase.from("activities").insert({
      actor_id: this.actorId,
      entity_type: "lead",
      entity_id: orgnr,
      action: "status_andrad",
      payload: { orgnr, namn, fran: lead.status, till: "forlorad", orsak },
    });
    return true;
  }

  async upsertFinancials(orgnr: string, rows: YearFinancials[]): Promise<void> {
    const sane = sanitizeFinancials(rows);
    if (sane.length === 0) return;

    // Trelägesmerge per nyckeltal: en källa som inte känner till ett värde
    // (null) får aldrig skriva över ett befintligt (t.ex. CSV med enbart
    // omsättning ovanpå bokslutsdata från Bolagsverket).
    const { data: existing, error: selectError } = await this.supabase
      .from("company_financials")
      .select("year, revenue_sek, profit_sek, employees, soliditet")
      .eq("orgnr", orgnr)
      .in("year", sane.map((r) => r.year));
    if (selectError) throw new Error(selectError.message);
    const prev = new Map((existing ?? []).map((r) => [r.year as number, r]));

    const { error } = await this.supabase.from("company_financials").upsert(
      sane.map((row) => {
        const old = prev.get(row.year);
        return {
          orgnr,
          year: row.year,
          revenue_sek: row.revenueSek ?? old?.revenue_sek ?? null,
          profit_sek: row.profitSek ?? old?.profit_sek ?? null,
          employees: row.employees ?? old?.employees ?? null,
          soliditet: row.soliditetPct ?? old?.soliditet ?? null,
        };
      }),
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

  async createLead(orgnr: string, meta?: LeadMeta): Promise<void> {
    const { data, error } = await this.supabase
      .from("leads")
      .upsert(
        { orgnr, status: "ny" },
        { onConflict: "orgnr", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw new Error(error.message);
    // ignoreDuplicates ⇒ raden kommer bara tillbaka när den faktiskt
    // skapades, så loggen får inga dubbletter vid kapplöpning.
    if ((data ?? []).length > 0) {
      await this.supabase.from("activities").insert({
        actor_id: this.actorId,
        entity_type: "lead",
        entity_id: orgnr,
        action: "lead_skapad",
        payload: { orgnr, namn: meta?.namn ?? null, kalla: meta?.kalla ?? null },
      });
    }
  }

  async touchCompany(orgnr: string): Promise<void> {
    // Best effort: flyttar bolaget sist i äldst-först-rotationen så att en
    // rad som kraschar berikningen inte blockerar kön för alltid.
    await this.supabase
      .from("companies")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("orgnr", orgnr);
  }
}

/** Tar bort orimliga värden så att databasens constraints aldrig fäller en hel batch. */
export function sanitizeFinancials(rows: YearFinancials[]): YearFinancials[] {
  return rows
    .filter((row) => Number.isInteger(row.year) && row.year >= 1900 && row.year <= 2100)
    .map((row) => ({
      ...row,
      // Negativ nettoomsättning/anställda är artefakter (t.ex. teckenfel i
      // iXBRL) – resultat får däremot vara negativt.
      revenueSek: row.revenueSek !== null && row.revenueSek < 0 ? null : row.revenueSek,
      employees: row.employees !== null && row.employees < 0 ? null : row.employees,
    }));
}
