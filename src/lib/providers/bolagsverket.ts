import { formatSniCode } from "@/lib/constants";
import { normalizeOrgnr } from "@/lib/format";
import { parseAnnualReport } from "./ixbrl";
import type {
  CompanyDataProvider,
  CompanyDetails,
  CompanySearchResult,
  SearchCompaniesParams,
  YearFinancials,
} from "./types";
import { ProviderError } from "./types";

/**
 * BolagsverketProvider – Värdefulla datamängder (öppna data, gratis).
 *
 * Verifierat mot Bolagsverkets publicerade OpenAPI-spec (devportalen):
 *   Bas-URL:  https://gw.api.bolagsverket.se/vardefulla-datamangder/v1
 *   Token:    https://portal.api.bolagsverket.se/oauth2/token
 *             (OAuth2 Client Credentials, Basic-auth med client id/secret)
 *   POST /organisationer   { identitetsbeteckning } → organisationer[]
 *   POST /dokumentlista    { identitetsbeteckning } → dokument[] (årsredovisningar)
 *   GET  /dokument/{id}    → årsredovisning (ZIP med iXBRL)
 *
 * Viktigt: API:et är ett UPPSLAG per orgnr – det finns ingen sök-/
 * prospekteringsfråga. Providern arbetar därför i BERIKNINGSLÄGE:
 * searchCompanies returnerar bolag som redan finns i databasen (äldst
 * synkade först, max BOLAGSVERKET_SYNC_LIMIT per körning) och varje
 * bolag berikas med aktuell myndighetsdata + bokslutssiffror ur de
 * digitalt inlämnade årsredovisningarna. Saknade bokslut gör att
 * tidigare okvalificerade bolag kan bli leads när siffrorna kommer in.
 * Nya bolag tillkommer via CSV-import eller tic.io.
 */

const DEFAULT_BASE_URL = "https://gw.api.bolagsverket.se/vardefulla-datamangder/v1";
const DEFAULT_TOKEN_URL = "https://portal.api.bolagsverket.se/oauth2/token";
/** Max antal årsredovisningar som laddas ner per bolag (2 år per dokument). */
const MAX_REPORTS_PER_COMPANY = 3;
/**
 * Upp till ~5 API-anrop per bolag gör att körningen måste rymmas i
 * Vercels tidsgräns (300 s) – 100 bolag per svep är säkert. Höj via
 * BOLAGSVERKET_SYNC_LIMIT om körningarna går snabbt.
 */
export const DEFAULT_SYNC_LIMIT = 100;
export const ENRICHMENT_PAGE_SIZE = 50;

/** Källa för vilka orgnr som ska berikas (injiceras; DB i drift, stub i test). */
export type OrgnrSource = (
  page: number,
  pageSize: number,
) => Promise<{ orgnrs: string[]; total: number }>;

interface KodKlartext {
  kod?: string | null;
  klartext?: string | null;
}

interface BvOrganisation {
  organisationsidentitet?: { identitetsbeteckning?: string };
  namnskyddslopnummer?: number;
  organisationsnamn?: {
    organisationsnamnLista?: { namn?: string; organisationsnamntyp?: KodKlartext }[];
  };
  postadressOrganisation?: {
    postadress?: {
      utdelningsadress?: string | null;
      postnummer?: string | null;
      postort?: string | null;
      coAdress?: string | null;
    };
  };
  naringsgrenOrganisation?: { sni?: KodKlartext[] };
  verksamOrganisation?: { kod?: string };
  avregistreradOrganisation?: { avregistreringsdatum?: string | null };
}

interface BvDokument {
  dokumentId?: string;
  filformat?: string;
  rapporteringsperiodTom?: string;
  registreringstidpunkt?: string;
}

/** Organisation → våra bolagsfält. Kontakt/anställda finns inte i API:et → null. */
export function mapBolagsverketOrganisation(org: BvOrganisation): CompanyDetails {
  const orgnr = normalizeOrgnr(org.organisationsidentitet?.identitetsbeteckning ?? "");
  if (!orgnr) {
    throw new ProviderError(
      `Ogiltigt organisationsnummer från Bolagsverket: "${org.organisationsidentitet?.identitetsbeteckning}"`,
      "bolagsverket",
    );
  }
  const namn = org.organisationsnamn?.organisationsnamnLista?.find((n) => n.namn)?.namn;
  const adress = org.postadressOrganisation?.postadress;
  const sni = (org.naringsgrenOrganisation?.sni ?? []).find((s) => s.kod);
  return {
    orgnr,
    namn: namn?.trim() || "Okänt bolagsnamn",
    ort: adress?.postort?.trim() || null,
    sniKod: formatSniCode(sni?.kod ?? null),
    adress: adress?.utdelningsadress?.trim() || null,
    antalAnstallda: null,
    hemsida: null,
    telefon: null,
  };
}

export class BolagsverketProvider implements CompanyDataProvider {
  readonly name = "bolagsverket";
  readonly label = "Bolagsverket – Värdefulla datamängder";
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;
  private readonly tokenUrl: string;
  private readonly syncLimit: number;
  private readonly orgnrSource: OrgnrSource | null;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(opts: {
    clientId: string;
    clientSecret: string;
    baseUrl?: string;
    tokenUrl?: string;
    syncLimit?: number;
    orgnrSource?: OrgnrSource;
  }) {
    if (!opts.clientId || !opts.clientSecret) {
      throw new ProviderError(
        "BOLAGSVERKET_CLIENT_ID och BOLAGSVERKET_CLIENT_SECRET saknas",
        "bolagsverket",
      );
    }
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.tokenUrl = opts.tokenUrl ?? DEFAULT_TOKEN_URL;
    this.syncLimit = opts.syncLimit ?? DEFAULT_SYNC_LIMIT;
    this.orgnrSource = opts.orgnrSource ?? null;
  }

  /** OAuth2 Client Credentials med marginal innan utgång. */
  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) {
      return this.token.value;
    }
    let res: Response;
    try {
      res = await fetch(this.tokenUrl, {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        cache: "no-store",
      });
    } catch (e) {
      throw new ProviderError(
        `Kunde inte nå Bolagsverkets token-endpoint: ${e instanceof Error ? e.message : e}`,
        this.name,
      );
    }
    if (!res.ok) {
      throw new ProviderError(
        `Bolagsverkets token-endpoint svarade ${res.status} – kontrollera client id/secret`,
        this.name,
      );
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      throw new ProviderError("Token saknas i svaret från Bolagsverket", this.name);
    }
    this.token = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return this.token.value;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const token = await this.getToken();
    let res: Response;
    try {
      res = await fetch(this.baseUrl + path, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "*/*",
          ...(init?.body ? { "content-type": "application/json" } : {}),
          ...init?.headers,
        },
        cache: "no-store",
      });
    } catch (e) {
      throw new ProviderError(
        `Kunde inte nå Bolagsverket (${path}): ${e instanceof Error ? e.message : e}`,
        this.name,
      );
    }
    if (res.status === 429) {
      throw new ProviderError(
        "Bolagsverket svarar 429 (för många anrop) – sänk BOLAGSVERKET_SYNC_LIMIT eller vänta",
        this.name,
      );
    }
    return res;
  }

  /**
   * Berikningsläge: går igenom befintliga bolag i databasen (äldst
   * synkade först), begränsat per körning. Kräver injicerad orgnr-källa.
   */
  async searchCompanies(params: SearchCompaniesParams): Promise<CompanySearchResult> {
    if (!this.orgnrSource) {
      throw new ProviderError(
        "Bolagsverket-providern saknar orgnr-källa. API:et stödjer inte prospektering – nya bolag importeras via CSV eller tic.io, Bolagsverket berikar beståndet.",
        this.name,
      );
    }
    const page = Math.max(1, params.page ?? 1);
    const { orgnrs, total } = await this.orgnrSource(page, ENRICHMENT_PAGE_SIZE);
    const cappedTotal = Math.min(total, this.syncLimit);
    return {
      companies: orgnrs.map((orgnr) => ({ orgnr, namn: orgnr, ort: null })),
      page,
      totalPages: Math.max(1, Math.ceil(cappedTotal / ENRICHMENT_PAGE_SIZE)),
      total: cappedTotal,
    };
  }

  /**
   * Självtest för Inställningar: verifierar token, uppslag och
   * dokumentlista mot ett känt bolag. Returnerar läsbara rader.
   */
  async selfTest(testOrgnr = "556016-0680"): Promise<string[]> {
    const lines: string[] = [];
    await this.getToken();
    lines.push("Token: OK (client credentials godkända)");

    const alive = await this.request("/isalive");
    lines.push(`isalive: HTTP ${alive.status}`);

    const company = await this.getCompany(testOrgnr);
    lines.push(
      `Uppslag ${testOrgnr}: ${company.namn} · ${company.ort ?? "okänd ort"} · SNI ${company.sniKod ?? "saknas"}`,
    );

    const digits = testOrgnr.replace(/\D/g, "");
    const docRes = await this.request("/dokumentlista", {
      method: "POST",
      body: JSON.stringify({ identitetsbeteckning: digits }),
    });
    if (docRes.ok) {
      const data = (await docRes.json()) as { dokument?: BvDokument[] };
      const count = data.dokument?.length ?? 0;
      const latest = data.dokument?.[0]?.rapporteringsperiodTom;
      lines.push(
        `Årsredovisningar: ${count} st${latest ? ` (senaste period t.o.m. ${latest})` : ""}`,
      );
    } else {
      lines.push(`Årsredovisningar: HTTP ${docRes.status}`);
    }
    return lines;
  }

  async getCompany(orgnr: string): Promise<CompanyDetails> {
    const digits = orgnr.replace(/\D/g, "");
    const res = await this.request("/organisationer", {
      method: "POST",
      body: JSON.stringify({ identitetsbeteckning: digits }),
    });
    if (res.status === 404) {
      throw new ProviderError(`${orgnr} finns inte hos Bolagsverket`, this.name, orgnr);
    }
    if (!res.ok) {
      throw new ProviderError(
        `Bolagsverket svarade ${res.status} för ${orgnr}`,
        this.name,
        orgnr,
      );
    }
    const data = (await res.json()) as { organisationer?: BvOrganisation[] };
    const org = data.organisationer?.[0];
    if (!org) {
      throw new ProviderError(`Tomt svar från Bolagsverket för ${orgnr}`, this.name, orgnr);
    }
    return mapBolagsverketOrganisation(org);
  }

  /** Bokslutssiffror ur de senaste digitalt inlämnade årsredovisningarna. */
  async getFinancials(orgnr: string): Promise<YearFinancials[]> {
    const digits = orgnr.replace(/\D/g, "");
    const res = await this.request("/dokumentlista", {
      method: "POST",
      body: JSON.stringify({ identitetsbeteckning: digits }),
    });
    if (res.status === 404) return [];
    if (!res.ok) {
      throw new ProviderError(
        `Bolagsverket (dokumentlista) svarade ${res.status} för ${orgnr}`,
        this.name,
        orgnr,
      );
    }
    const data = (await res.json()) as { dokument?: BvDokument[] };
    const dokument = (data.dokument ?? [])
      .filter((d) => d.dokumentId)
      .sort((a, b) =>
        (b.rapporteringsperiodTom ?? "").localeCompare(a.rapporteringsperiodTom ?? ""),
      )
      .slice(0, MAX_REPORTS_PER_COMPANY);

    // Äldst först så att nyare årsredovisningar vinner vid överlapp
    // (jämförelseåret i en ny rapport skrivs över av samma års huvudsiffror).
    dokument.reverse();

    const byYear = new Map<number, YearFinancials>();
    for (const dok of dokument) {
      const docRes = await this.request(`/dokument/${encodeURIComponent(dok.dokumentId!)}`);
      if (!docRes.ok) continue;
      const buffer = Buffer.from(await docRes.arrayBuffer());
      for (const row of parseAnnualReport(buffer)) {
        byYear.set(row.year, row);
      }
    }
    return [...byYear.values()].sort((a, b) => a.year - b.year);
  }
}
