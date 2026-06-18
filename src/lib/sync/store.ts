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

/** Metadata för audit-loggen när ett lead skapas av synk/import. */
export interface LeadMeta {
  namn: string;
  kalla: string;
}

export interface SyncStore {
  /** Upsert på orgnr. Returnerar om bolaget var nytt eller uppdaterades. */
  upsertCompany(company: CompanyUpsert): Promise<"created" | "updated">;
  /** Upsert per (orgnr, year). Alla tillgängliga år sparas, oavsett filter. */
  upsertFinancials(orgnr: string, rows: YearFinancials[]): Promise<void>;
  hasLead(orgnr: string): Promise<boolean>;
  /** Skapar lead med status 'ny'. Måste vara no-op om lead redan finns. */
  createLead(orgnr: string, meta?: LeadMeta): Promise<void>;
  /**
   * Datahygien: bolaget är avregistrerat hos källan – markera ett
   * eventuellt lead som Förlorad. Returnerar true om ett lead ändrades.
   */
  markLeadLost(orgnr: string, namn: string, orsak: string): Promise<boolean>;
  /**
   * Målbild: bolagets SNI ligger utanför målgruppen (t.ex.
   * personaluthyrning). Flyttar ut ett eventuellt aktivt lead ur
   * målbilden så att det döljs ur listor/pipeline. Rör aldrig leads där
   * användaren gjort ett manuellt val (target_kept). Returnerar true om
   * ett lead ändrades.
   */
  markOffTarget(orgnr: string, namn: string, sniKod: string | null): Promise<boolean>;
  /**
   * Bolagets SNI matchar nu målbilden igen – återställ ett auto-utflyttat
   * lead. Rör aldrig manuellt valda leads (target_kept). Returnerar true
   * om ett lead ändrades.
   */
  clearOffTarget(orgnr: string, namn: string): Promise<boolean>;
  /**
   * Stämplar last_synced_at utan annan skrivning – används när berikningen
   * av ett bolag misslyckas, så att äldst-först-rotationen går vidare.
   */
  touchCompany(orgnr: string): Promise<void>;
}

/** Minneslagring för tester och torrkörningar. */
export class InMemorySyncStore implements SyncStore {
  readonly companies = new Map<string, CompanyUpsert>();
  readonly financials = new Map<string, YearFinancials>(); // key: orgnr:year
  readonly leads = new Set<string>();
  readonly lostLeads = new Set<string>();
  readonly offTarget = new Set<string>();
  readonly touched: string[] = [];

  async upsertCompany(company: CompanyUpsert): Promise<"created" | "updated"> {
    const existing = this.companies.get(company.orgnr);
    if (!existing) {
      this.companies.set(company.orgnr, { ...company });
      return "created";
    }
    // Samma berikningsmerge som SupabaseSyncStore: null skriver aldrig
    // över befintliga värden, och namn-platshållare behåller riktigt namn.
    // Berikningsfälten har undefined = "rör ej", null/värde = skriv.
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
      verksamhetsbeskrivning:
        company.verksamhetsbeskrivning === undefined
          ? existing.verksamhetsbeskrivning
          : company.verksamhetsbeskrivning,
      registreringsdatum:
        company.registreringsdatum === undefined
          ? existing.registreringsdatum
          : company.registreringsdatum,
      bolagsform:
        company.bolagsform === undefined ? existing.bolagsform : company.bolagsform,
      avregistreradDatum:
        company.avregistreradDatum === undefined
          ? existing.avregistreradDatum
          : company.avregistreradDatum,
      reklamsparr:
        company.reklamsparr === undefined ? existing.reklamsparr : company.reklamsparr,
    });
    return "updated";
  }

  async markLeadLost(orgnr: string, _namn: string, _orsak: string): Promise<boolean> {
    if (!this.leads.has(orgnr) || this.lostLeads.has(orgnr)) return false;
    this.lostLeads.add(orgnr);
    return true;
  }

  async markOffTarget(orgnr: string, _namn: string, _sniKod: string | null): Promise<boolean> {
    if (!this.leads.has(orgnr) || this.offTarget.has(orgnr)) return false;
    this.offTarget.add(orgnr);
    return true;
  }

  async clearOffTarget(orgnr: string, _namn: string): Promise<boolean> {
    if (!this.offTarget.has(orgnr)) return false;
    this.offTarget.delete(orgnr);
    return true;
  }

  async upsertFinancials(orgnr: string, rows: YearFinancials[]): Promise<void> {
    // Samma trelägesmerge som SupabaseSyncStore: null skriver inte över.
    for (const row of rows) {
      const key = `${orgnr}:${row.year}`;
      const old = this.financials.get(key);
      this.financials.set(key, {
        ...row,
        revenueSek: row.revenueSek ?? old?.revenueSek ?? null,
        profitSek: row.profitSek ?? old?.profitSek ?? null,
        employees: row.employees ?? old?.employees ?? null,
        soliditetPct: row.soliditetPct ?? old?.soliditetPct ?? null,
      });
    }
  }

  async hasLead(orgnr: string): Promise<boolean> {
    return this.leads.has(orgnr);
  }

  async createLead(orgnr: string, _meta?: LeadMeta): Promise<void> {
    this.leads.add(orgnr);
  }

  async touchCompany(orgnr: string): Promise<void> {
    this.touched.push(orgnr);
  }

  financialsFor(orgnr: string): YearFinancials[] {
    return [...this.financials.entries()]
      .filter(([key]) => key.startsWith(`${orgnr}:`))
      .map(([, value]) => value)
      .sort((a, b) => a.year - b.year);
  }
}
