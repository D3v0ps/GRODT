/**
 * Utbytbart provider-lager för bolagsdata.
 *
 * Allabolag har inget självbetjänings-API (säljs via UC och kräver
 * kommersiellt avtal), därför är datakällan abstraherad bakom detta
 * gränssnitt så att den kan bytas utan att resten av appen påverkas.
 *
 * Kontrakt: ALLA belopp som lämnar en provider är SEK som heltal.
 * Leverantörer som rapporterar i tkr ska konvertera med tkrToSek().
 */

export interface CompanySummary {
  orgnr: string;
  namn: string;
  ort: string | null;
}

export interface CompanySearchResult {
  companies: CompanySummary[];
  page: number;
  totalPages: number;
  total: number;
}

export interface CompanyDetails extends CompanySummary {
  sniKod: string | null;
  adress: string | null;
  antalAnstallda: number | null;
  hemsida: string | null;
  telefon: string | null;
  /**
   * Berikningsfält. `undefined` = källan känner inte till fältet (rör
   * inte befintligt värde); `null` = källan säger att värdet saknas/
   * inte gäller (skrivs). Bolagsverket sätter dessa explicit.
   */
  verksamhetsbeskrivning?: string | null;
  registreringsdatum?: string | null;
  bolagsform?: string | null;
  /** Datum då bolaget avregistrerades hos Bolagsverket; null = aktivt. */
  avregistreradDatum?: string | null;
  reklamsparr?: boolean;
}

export interface YearFinancials {
  year: number;
  /** Nettoomsättning i SEK (heltal). */
  revenueSek: number | null;
  /** Resultat i SEK (heltal). */
  profitSek: number | null;
  employees: number | null;
  /** Soliditet i procent (t.ex. 42.5), från årsredovisningen. */
  soliditetPct?: number | null;
}

export interface SearchCompaniesParams {
  sniCodes: string[];
  revenueMinSek: number;
  years: number[];
  page?: number;
}

export interface CompanyDataProvider {
  /** Maskinnamn, sparas i companies.kalla och visas i Inställningar. */
  readonly name: string;
  /** Visningsnamn i UI:t. */
  readonly label: string;
  searchCompanies(params: SearchCompaniesParams): Promise<CompanySearchResult>;
  getCompany(orgnr: string): Promise<CompanyDetails>;
  getFinancials(orgnr: string): Promise<YearFinancials[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly orgnr?: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
