import { formatSniCode } from "@/lib/constants";
import { normalizeOrgnr } from "@/lib/format";
import { sekToTkr, tkrToSek } from "./units";
import type {
  CompanyDataProvider,
  CompanyDetails,
  CompanySearchResult,
  SearchCompaniesParams,
  YearFinancials,
} from "./types";
import { ProviderError } from "./types";

/**
 * TicProvider – tic.io:s LENS-API (https://docs.tic.io).
 *
 * Fältmappning verifierad mot docs.tic.io 2026-06:
 *  - Autentisering: header `x-api-key`.
 *  - Sök: GET /search-public/companies (Typesense-proxy) med `filter_by`,
 *    `page`, `per_page` (max 50). Dokumentfält: companyId,
 *    registrationNumber, names, mostRecentRegisteredAddress, rs_NetSalesK.
 *  - Detaljer: GET /companies/{companyId} → mostRecentName,
 *    registrationNumber, registeredAddress/visitingAddress (street,
 *    postalCode, city), phoneNumber.e164PhoneNumber, homepage.hyperlink,
 *    industryCodes[], financialSummary[].
 *  - financialSummary[]: periodStart/periodEnd, rs_NetSalesK,
 *    rs_OperatingProfitOrLossK, fn_NumberOfEmployees.
 *
 * OBS enheter: alla fält med K-suffix är i tkr (KSEK) – konverteras till
 * SEK-heltal via tkrToSek(). Se lib/providers/units.ts.
 *
 * OBS förfilter: rs_NetSalesK i söket avser senaste bokslut. Den exakta
 * ELLER-logiken över de konfigurerade räkenskapsåren appliceras alltid i
 * synkmotorn på alla hämtade årssiffror. För att inte missa bolag vars
 * senaste år ligger under tröskeln men ett tidigare konfigurerat år låg
 * över, sätts förfiltret till halva tröskeln (grov gallring, exakt
 * kvalificering sker lokalt).
 */

const DEFAULT_BASE_URL = "https://lens-api.tic.io";
const PER_PAGE = 50;

interface TicSearchHit {
  document: {
    companyId?: number;
    registrationNumber?: string;
    mostRecentName?: string;
    names?: unknown;
    mostRecentRegisteredAddress?: { city?: string | null } | null;
  };
}

interface TicSearchResponse {
  found?: number;
  page?: number;
  hits?: TicSearchHit[];
}

interface TicFinancialSummaryEntry {
  periodStart?: string | null;
  periodEnd?: string | null;
  rs_NetSalesK?: number | null;
  rs_OperatingProfitOrLossK?: number | null;
  fn_NumberOfEmployees?: number | null;
}

interface TicCompanyResponse {
  companyId?: number;
  mostRecentName?: string;
  registrationNumber?: string;
  registeredAddress?: { street?: string | null; postalCode?: string | null; city?: string | null } | null;
  visitingAddress?: { street?: string | null; postalCode?: string | null; city?: string | null } | null;
  phoneNumber?: { e164PhoneNumber?: string | null; phoneNumberFormatted?: string | null } | null;
  homepage?: { hyperlink?: string | null } | null;
  industryCodes?: { industryCode?: string | null }[] | null;
  financialSummary?: TicFinancialSummaryEntry[] | null;
}

/** "78.100" → "78100" (tic.io använder SNI 2007 utan punkt). */
export function toTicSniCode(code: string): string {
  return code.replace(/\D/g, "");
}

function extractName(doc: TicSearchHit["document"]): string {
  if (doc.mostRecentName) return doc.mostRecentName;
  const names = doc.names;
  if (Array.isArray(names) && names.length > 0) {
    const first = names[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      const obj = first as Record<string, unknown>;
      if (typeof obj.name === "string") return obj.name;
      if (typeof obj.companyName === "string") return obj.companyName;
    }
  }
  return "Okänt bolagsnamn";
}

export function mapTicCompanyDetails(data: TicCompanyResponse): CompanyDetails {
  const orgnr = normalizeOrgnr(data.registrationNumber ?? "");
  if (!orgnr) {
    throw new ProviderError(
      `Ogiltigt organisationsnummer från tic.io: "${data.registrationNumber}"`,
      "tic",
    );
  }
  const addr = data.visitingAddress ?? data.registeredAddress ?? null;
  const street = addr?.street?.trim() || null;
  const employees =
    latestFinancialSummary(data.financialSummary)?.fn_NumberOfEmployees ?? null;
  return {
    orgnr,
    namn: data.mostRecentName?.trim() || "Okänt bolagsnamn",
    ort: addr?.city?.trim() || null,
    sniKod: formatSniCode(data.industryCodes?.[0]?.industryCode ?? null),
    adress: street,
    antalAnstallda: employees,
    hemsida: data.homepage?.hyperlink?.trim() || null,
    telefon:
      data.phoneNumber?.phoneNumberFormatted?.trim() ||
      data.phoneNumber?.e164PhoneNumber?.trim() ||
      null,
  };
}

function latestFinancialSummary(
  entries: TicFinancialSummaryEntry[] | null | undefined,
): TicFinancialSummaryEntry | null {
  if (!entries || entries.length === 0) return null;
  return [...entries].sort((a, b) =>
    (a.periodEnd ?? "").localeCompare(b.periodEnd ?? ""),
  )[entries.length - 1];
}

/**
 * financialSummary → YearFinancials[]. Räkenskapsår = året för periodEnd.
 * Vid brutet räkenskapsår med flera perioder som slutar samma år behålls
 * den senaste perioden. Belopp konverteras tkr → kr.
 */
export function mapTicFinancials(
  entries: TicFinancialSummaryEntry[] | null | undefined,
): YearFinancials[] {
  const byYear = new Map<number, { periodEnd: string; row: YearFinancials }>();
  for (const entry of entries ?? []) {
    const periodEnd = entry.periodEnd ?? "";
    const year = Number(periodEnd.slice(0, 4));
    if (!Number.isInteger(year) || year < 1900) continue;
    const row: YearFinancials = {
      year,
      revenueSek: tkrToSek(entry.rs_NetSalesK),
      profitSek: tkrToSek(entry.rs_OperatingProfitOrLossK),
      employees: entry.fn_NumberOfEmployees ?? null,
    };
    const existing = byYear.get(year);
    if (!existing || periodEnd > existing.periodEnd) {
      byYear.set(year, { periodEnd, row });
    }
  }
  return [...byYear.values()]
    .map((v) => v.row)
    .sort((a, b) => a.year - b.year);
}

export class TicProvider implements CompanyDataProvider {
  readonly name = "tic";
  readonly label = "tic.io LENS API";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  /** orgnr → companyId, fylls på av sökningen för att slippa extra anrop. */
  private readonly idCache = new Map<string, number>();
  /** orgnr → detaljsvar, så att getCompany + getFinancials blir ett anrop. */
  private readonly detailsCache = new Map<string, TicCompanyResponse>();

  constructor(opts: { apiKey: string; baseUrl?: string }) {
    if (!opts.apiKey) {
      throw new ProviderError("TIC_API_KEY saknas", "tic");
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  private async fetchJson<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params ?? {})) {
      url.searchParams.set(k, v);
    }
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "x-api-key": this.apiKey, accept: "application/json" },
        cache: "no-store",
      });
    } catch (e) {
      throw new ProviderError(
        `Kunde inte nå tic.io: ${e instanceof Error ? e.message : String(e)}`,
        this.name,
      );
    }
    if (!res.ok) {
      throw new ProviderError(
        `tic.io svarade ${res.status} ${res.statusText} på ${path}`,
        this.name,
      );
    }
    return (await res.json()) as T;
  }

  async searchCompanies(params: SearchCompaniesParams): Promise<CompanySearchResult> {
    const page = Math.max(1, params.page ?? 1);
    const sniFilter =
      params.sniCodes.length === 1
        ? `sni_2007Code:=${toTicSniCode(params.sniCodes[0])}`
        : `sni_2007Code:=[${params.sniCodes.map(toTicSniCode).join(",")}]`;
    // Grovt förfilter på halva tröskeln i tkr – exakt ELLER-logik körs lokalt.
    const revenueFloorTkr = Math.floor(sekToTkr(params.revenueMinSek) / 2);
    const filterBy = [sniFilter, "isCeased:=false", `rs_NetSalesK:>=${revenueFloorTkr}`].join(" && ");

    const data = await this.fetchJson<TicSearchResponse>("/search-public/companies", {
      q: "*",
      filter_by: filterBy,
      page: String(page),
      per_page: String(PER_PAGE),
    });

    const companies = (data.hits ?? []).flatMap((hit) => {
      const orgnr = normalizeOrgnr(hit.document.registrationNumber ?? "");
      if (!orgnr) return [];
      if (typeof hit.document.companyId === "number") {
        this.idCache.set(orgnr, hit.document.companyId);
      }
      return [
        {
          orgnr,
          namn: extractName(hit.document),
          ort: hit.document.mostRecentRegisteredAddress?.city ?? null,
        },
      ];
    });

    const total = data.found ?? companies.length;
    return {
      companies,
      page,
      totalPages: Math.max(1, Math.ceil(total / PER_PAGE)),
      total,
    };
  }

  private async resolveCompanyId(orgnr: string): Promise<number> {
    const cached = this.idCache.get(orgnr);
    if (cached !== undefined) return cached;
    const digits = orgnr.replace(/\D/g, "");
    const data = await this.fetchJson<TicSearchResponse>("/search-public/companies", {
      q: "*",
      filter_by: `registrationNumber:=${digits}`,
      per_page: "1",
    });
    const id = data.hits?.[0]?.document.companyId;
    if (typeof id !== "number") {
      throw new ProviderError(`Hittade inget tic.io-id för ${orgnr}`, this.name, orgnr);
    }
    this.idCache.set(orgnr, id);
    return id;
  }

  private async fetchDetails(orgnr: string): Promise<TicCompanyResponse> {
    const cached = this.detailsCache.get(orgnr);
    if (cached) return cached;
    const id = await this.resolveCompanyId(orgnr);
    const data = await this.fetchJson<TicCompanyResponse>(`/companies/${id}`);
    this.detailsCache.set(orgnr, data);
    return data;
  }

  async getCompany(orgnr: string): Promise<CompanyDetails> {
    return mapTicCompanyDetails(await this.fetchDetails(orgnr));
  }

  async getFinancials(orgnr: string): Promise<YearFinancials[]> {
    const details = await this.fetchDetails(orgnr);
    return mapTicFinancials(details.financialSummary);
  }
}
