import type { CompanyDetails, YearFinancials } from "@/lib/providers/types";

/**
 * Lagringsgränssnitt för synk-/importmotorn. Gör motorn testbar utan
 * databas (InMemorySyncStore) och håller all idempotens på ett ställe:
 * companies upsertas på orgnr (PK), financials på (orgnr, year) och
 * leads skapas endast när orgnr saknar lead (orgnr UNIQUE).
 */

export interface CompanyUpsert extends CompanyDetails {
  /** Datakälla, t.ex. "tic", "mock" eller "csv". Sparas i companies.kalla. */
  kalla: string;
}

export interface SyncStore {
  /** Upsert på orgnr. Returnerar om bolaget var nytt eller uppdaterades. */
  upsertCompany(company: CompanyUpsert): Promise<"created" | "updated">;
  /** Upsert per (orgnr, year). Alla tillgängliga år sparas, oavsett filter. */
  upsertFinancials(orgnr: string, rows: YearFinancials[]): Promise<void>;
  hasLead(orgnr: string): Promise<boolean>;
  /** Skapar lead med status 'ny'. Måste vara no-op om lead redan finns. */
  createLead(orgnr: string): Promise<void>;
}

/** Minneslagring för tester och torrkörningar. */
export class InMemorySyncStore implements SyncStore {
  readonly companies = new Map<string, CompanyUpsert>();
  readonly financials = new Map<string, YearFinancials>(); // key: orgnr:year
  readonly leads = new Set<string>();

  async upsertCompany(company: CompanyUpsert): Promise<"created" | "updated"> {
    const existing = this.companies.get(company.orgnr);
    if (!existing) {
      this.companies.set(company.orgnr, { ...company });
      return "created";
    }
    // Samma berikningsmerge som SupabaseSyncStore: null skriver aldrig
    // över befintliga värden, och namn-platshållare behåller riktigt namn.
    this.companies.set(company.orgnr, {
      ...company,
      namn:
        company.namn && company.namn !== "Okänt bolagsnamn"
          ? company.namn
          : existing.namn,
      sniKod: company.sniKod ?? existing.sniKod,
      ort: company.ort ?? existing.ort,
      adress: company.adress ?? existing.adress,
      antalAnstallda: company.antalAnstallda ?? existing.antalAnstallda,
      hemsida: company.hemsida ?? existing.hemsida,
      telefon: company.telefon ?? existing.telefon,
    });
    return "updated";
  }

  async upsertFinancials(orgnr: string, rows: YearFinancials[]): Promise<void> {
    for (const row of rows) {
      this.financials.set(`${orgnr}:${row.year}`, { ...row });
    }
  }

  async hasLead(orgnr: string): Promise<boolean> {
    return this.leads.has(orgnr);
  }

  async createLead(orgnr: string): Promise<void> {
    this.leads.add(orgnr);
  }

  financialsFor(orgnr: string): YearFinancials[] {
    return [...this.financials.entries()]
      .filter(([key]) => key.startsWith(`${orgnr}:`))
      .map(([, value]) => value)
      .sort((a, b) => a.year - b.year);
  }
}
