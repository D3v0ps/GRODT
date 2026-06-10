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
      .select("orgnr")
      .eq("orgnr", company.orgnr)
      .maybeSingle();
    if (selectError) throw new Error(selectError.message);

    const { error } = await this.supabase.from("companies").upsert(
      {
        orgnr: company.orgnr,
        namn: company.namn,
        sni_kod: company.sniKod,
        ort: company.ort,
        adress: company.adress,
        antal_anstallda: company.antalAnstallda,
        hemsida: company.hemsida,
        telefon: company.telefon,
        kalla: company.kalla,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "orgnr" },
    );
    if (error) throw new Error(error.message);
    return existing ? "updated" : "created";
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
