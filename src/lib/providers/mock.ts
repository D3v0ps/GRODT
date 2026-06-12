import { qualifies } from "@/lib/qualification";
import type {
  CompanyDataProvider,
  CompanyDetails,
  CompanySearchResult,
  CompanySummary,
  SearchCompaniesParams,
  YearFinancials,
} from "./types";
import { ProviderError } from "./types";

/**
 * MockProvider – deterministisk testdata för utveckling, seed och tester.
 *
 * Datasetet är ~50 fiktiva bolag inom SNI 78.100 med bokslut 2021–2024 och
 * omsättningar varierade runt tröskelvärdet 5 MSEK:
 *  - bolag över tröskeln alla år
 *  - snabbväxare som korsar tröskeln först 2023/2024 (kvalificerar alltså
 *    inte med räkenskapsåren 2021/2022 men väl efter byte i Inställningar)
 *  - avtagande bolag som bara når tröskeln de tidiga åren
 *  - "spikar" som bara når tröskeln ett enda år (ELLER-logiken)
 *  - småbolag under tröskeln alla år (ska aldrig bli leads)
 *
 * Två bolag speglar de obligatoriska testfallen:
 *  - Talangbron Tillväxt AB: 3 000 000 kr (år 1) / 8 000 000 kr (år 2) → SKA in
 *  - Stillastående Bemanning AB: 4 900 000 kr båda åren → ska INTE in
 */

export const MOCK_PAGE_SIZE = 20;

export const TALANGBRON_ORGNR = "559301-2347"; // 3,0 / 8,0 mkr (2021/2022)
export const STILLASTAENDE_ORGNR = "559402-5681"; // 4,9 mkr alla år
export const KOMPETENSBRON_ORGNR = "559034-6612"; // kvalificerar först 2024

interface MockCompany extends CompanyDetails {
  financials: YearFinancials[];
}

/** Deterministisk PRNG (mulberry32) så att datasetet blir identiskt varje gång. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const YEARS = [2021, 2022, 2023, 2024];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ ab$/i, "")
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/é/g, "e")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

function buildFinancials(
  revenues: (number | null)[],
  latestEmployees: number,
  marginTenths: number,
): YearFinancials[] {
  const latestRevenue = revenues[revenues.length - 1] ?? 1;
  return YEARS.map((year, i) => {
    const revenue = revenues[i];
    if (revenue === null) {
      return { year, revenueSek: null, profitSek: null, employees: null };
    }
    const employees = Math.max(
      2,
      Math.round((latestEmployees * revenue) / Math.max(1, latestRevenue)),
    );
    // Resultat som andel av omsättningen (marginTenths = tiondels procent,
    // 30 ⇒ 3,0 %), avrundat till hela hundratal kronor.
    const profit = Math.round((revenue * marginTenths) / 1000 / 100) * 100;
    return { year, revenueSek: revenue, profitSek: profit, employees };
  });
}

function company(
  orgnr: string,
  namn: string,
  ort: string,
  revenues: (number | null)[],
  anst: number,
  marginTenths: number,
  street: string,
): MockCompany {
  return {
    orgnr,
    namn,
    ort,
    sniKod: "78.100",
    adress: street,
    antalAnstallda: anst,
    hemsida: `https://www.${slugify(namn)}.se`,
    telefon: `08-${orgnr.slice(2, 5)} ${orgnr.slice(7, 9)} ${orgnr.slice(9)}`,
    financials: buildFinancials(revenues, anst, marginTenths),
  };
}

/** De 18 bolagen ur designmockupen (design/grodt-data.js) med trend 2021–2024. */
function designCompanies(): MockCompany[] {
  return [
    company("556712-4830", "Nordisk Bemanning AB", "Stockholm", [14100000, 16300000, 18400000, 21250000], 42, 78, "Vasagatan 11"),
    company("556903-1177", "Talangpartner Sverige AB", "Göteborg", [7200000, 8400000, 9650000, 11020000], 23, 64, "Kungsportsavenyen 21"),
    company("556488-2901", "Rekryteringsgruppen i Malmö AB", "Malmö", [6900000, 6500000, 6230000, 5870000], 14, 41, "Stortorget 8"),
    company("559034-6612", "Kompetensbron Norden AB", "Uppsala", [1800000, 2600000, 3240000, 8110000], 19, 52, "Dragarbrunnsgatan 35"),
    company("556830-0945", "Stafetten Vårdbemanning AB", "Linköping", [21000000, 24500000, 27800000, 31400000], 88, 71, "Storgatan 24"),
    company("556651-7388", "Mälardalens Rekrytering AB", "Västerås", [4400000, 4900000, 5480000, 6090000], 11, 47, "Stora Gatan 14"),
    company("559187-2204", "Headfirst Executive AB", "Stockholm", [9800000, 11200000, 12900000, 14750000], 16, 96, "Birger Jarlsgatan 6"),
    company("556574-9012", "Bemannia Syd AB", "Lund", [8800000, 8600000, 8320000, 7940000], 27, 38, "Bangatan 10"),
    company("556922-3456", "Proffspoolen Skandinavien AB", "Örebro", [13000000, 14200000, 15600000, 17880000], 51, 59, "Drottninggatan 29"),
    company("556799-8821", "Industrikraft Bemanning AB", "Jönköping", [18400000, 20900000, 22150000, 19980000], 64, 55, "Barnarpsgatan 39"),
    company("559245-0098", "Vinna Rekrytering AB", "Helsingborg", [2900000, 3500000, 4120000, 5340000], 9, 49, "Järnvägsgatan 13"),
    company("556610-4477", "Akademikerpoolen Sverige AB", "Umeå", [6100000, 7000000, 7780000, 8430000], 21, 62, "Rådhusesplanaden 17"),
    company("556843-2210", "Logistikbemanning Väst AB", "Borås", [9700000, 10500000, 11340000, 12010000], 38, 51, "Allégatan 43"),
    company("559076-5543", "Nyckelpersoner i Norr AB", "Luleå", [5400000, 6100000, 6890000, 7220000], 17, 58, "Storgatan 9"),
    company("556734-9087", "Selektiv Searchgruppen AB", "Stockholm", [7600000, 8300000, 9210000, 10650000], 13, 88, "Norrlandsgatan 18"),
    company("556967-1123", "Teknikkompetens Öst AB", "Norrköping", [10900000, 12100000, 13470000, 15090000], 45, 66, "Drottninggatan 50"),
    company("559118-7765", "Omsorgspersonal Direkt AB", "Gävle", [4800000, 5300000, 5910000, 6480000], 24, 36, "Nygatan 31"),
    company("556688-3349", "Byggbemanning Mitt AB", "Sundsvall", [15100000, 17800000, 16720000, 14380000], 57, 44, "Esplanaden 16"),
  ];
}

/** Obligatoriska testfall ur kravspecen. */
function testCaseCompanies(): MockCompany[] {
  return [
    // 3 MSEK år 1 / 8 MSEK år 2 → kvalificerar via ELLER-logiken (år 2).
    company(TALANGBRON_ORGNR, "Talangbron Tillväxt AB", "Eskilstuna", [3000000, 8000000, 8500000, 9100000], 12, 57, "Kungsgatan 5"),
    // 4,9 MSEK alla år → under tröskeln, ska aldrig bli lead.
    company(STILLASTAENDE_ORGNR, "Stillastående Bemanning AB", "Karlstad", [4900000, 4900000, 4900000, 4900000], 8, 33, "Tingvallagatan 19"),
  ];
}

const NAME_PARTS_A = [
  "Bemanningshuset", "Rekryteringspartner", "Talangfabriken", "Personalkraft",
  "Kompetenslaget", "Stjärnrekrytering", "Matchningsbyrån", "Vikariepoolen",
  "Specialistpoolen", "Arbetslivsgruppen", "Karriärporten", "Teambyggarna",
  "Personalbron", "Rekryteringskompaniet", "Talangjakten",
];
const NAME_PARTS_B = [
  "Sverige", "Norden", "Mälardalen", "Skåne", "Väst", "Öst", "Nord", "Syd",
  "City", "Regionen", "Partner", "Gruppen",
];
const CITIES = [
  "Stockholm", "Göteborg", "Malmö", "Uppsala", "Västerås", "Örebro",
  "Linköping", "Helsingborg", "Jönköping", "Norrköping", "Lund", "Umeå",
  "Gävle", "Borås", "Södertälje", "Eskilstuna", "Halmstad", "Växjö",
  "Karlstad", "Sundsvall", "Trollhättan", "Östersund", "Falun", "Kalmar",
];
const STREETS = [
  "Storgatan", "Kungsgatan", "Drottninggatan", "Järnvägsgatan", "Nygatan",
  "Skolgatan", "Hamngatan", "Östra Långgatan", "Industrivägen", "Strandvägen",
];

/**
 * Omsättningsprofiler för genererade bolag. Basbeloppet b ligger runt
 * tröskeln 5 MSEK så att kohorterna hamnar på rätt sida om gränsen.
 */
type Profile = (b: number) => (number | null)[];
const PROFILES: { kind: string; count: number; make: Profile }[] = [
  // Stabila bolag över tröskeln alla år.
  { kind: "stabil", count: 10, make: (b) => [b, b * 1.08, b * 1.15, b * 1.22].map(Math.round) },
  // Snabbväxare: under 2021/2022, korsar tröskeln 2023.
  { kind: "vaxare", count: 6, make: (b) => [b * 0.45, b * 0.7, b * 1.05, b * 1.4].map(Math.round) },
  // Avtagande: över tröskeln 2021/2022, under 2023/2024.
  { kind: "avtagande", count: 5, make: (b) => [b * 1.3, b * 1.1, b * 0.85, b * 0.7].map(Math.round) },
  // Spik: enbart 2022 över tröskeln.
  { kind: "spik", count: 5, make: (b) => [b * 0.8, b * 1.25, b * 0.9, b * 0.82].map(Math.round) },
  // Småbolag under tröskeln alla år.
  { kind: "under", count: 4, make: (b) => [b * 0.5, b * 0.55, b * 0.62, b * 0.7].map(Math.round) },
];

function generatedCompanies(): MockCompany[] {
  const rand = mulberry32(0x6720d7); // fast seed → identiskt dataset varje gång
  const out: MockCompany[] = [];
  const usedOrgnr = new Set<string>();
  const usedNames = new Set<string>();
  let nameIdx = 0;

  for (const profile of PROFILES) {
    for (let i = 0; i < profile.count; i++) {
      let orgnr = "";
      do {
        const block1 = `55${6 + Math.floor(rand() * 4)}${String(Math.floor(rand() * 1000)).padStart(3, "0")}`;
        const block2 = String(Math.floor(rand() * 10000)).padStart(4, "0");
        orgnr = `${block1}-${block2}`;
      } while (usedOrgnr.has(orgnr));
      usedOrgnr.add(orgnr);

      let namn = "";
      do {
        const a = NAME_PARTS_A[nameIdx % NAME_PARTS_A.length];
        const b = NAME_PARTS_B[Math.floor(rand() * NAME_PARTS_B.length)];
        namn = `${a} ${b} AB`;
        nameIdx++;
      } while (usedNames.has(namn));
      usedNames.add(namn);

      const ort = CITIES[Math.floor(rand() * CITIES.length)];
      const street = `${STREETS[Math.floor(rand() * STREETS.length)]} ${1 + Math.floor(rand() * 60)}`;
      // Basomsättning kring tröskeln: 5–9 MSEK för kvalificerande kohorter.
      const base = 5_000_000 + Math.floor(rand() * 4_000_000);
      const revenues = profile.make(base);
      const latest = revenues[revenues.length - 1] ?? base;
      const anst = Math.max(3, Math.round((latest ?? base) / 750_000));
      const margin = 30 + Math.floor(rand() * 70); // 3,0–9,9 % marginal
      out.push(company(orgnr, namn, ort, revenues, anst, margin, street));
    }
  }
  return out;
}

export function buildMockDataset(): MockCompany[] {
  return [...designCompanies(), ...testCaseCompanies(), ...generatedCompanies()];
}

function normalizeSni(code: string): string {
  return code.replace(/\D/g, "");
}

function toSummary(c: MockCompany): CompanySummary {
  return { orgnr: c.orgnr, namn: c.namn, ort: c.ort };
}

export class MockProvider implements CompanyDataProvider {
  readonly name = "mock";
  readonly label = "MockProvider (deterministisk testdata)";
  private readonly dataset = buildMockDataset();

  async searchCompanies(params: SearchCompaniesParams): Promise<CompanySearchResult> {
    const page = Math.max(1, params.page ?? 1);
    const wantedSni = params.sniCodes.map(normalizeSni);
    const matches = this.dataset.filter(
      (c) =>
        wantedSni.includes(normalizeSni(c.sniKod ?? "")) &&
        qualifies(c.financials, {
          revenueMinSek: params.revenueMinSek,
          revenueYears: params.years,
        }),
    );
    const total = matches.length;
    const totalPages = Math.max(1, Math.ceil(total / MOCK_PAGE_SIZE));
    const start = (page - 1) * MOCK_PAGE_SIZE;
    return {
      companies: matches.slice(start, start + MOCK_PAGE_SIZE).map(toSummary),
      page,
      totalPages,
      total,
    };
  }

  async getCompany(orgnr: string): Promise<CompanyDetails> {
    const found = this.dataset.find((c) => c.orgnr === orgnr);
    if (!found) {
      throw new ProviderError(`Bolag ${orgnr} finns inte i mockdata`, this.name, orgnr);
    }
    const { financials: _financials, ...details } = found;
    return { ...details };
  }

  async getFinancials(orgnr: string): Promise<YearFinancials[]> {
    const found = this.dataset.find((c) => c.orgnr === orgnr);
    if (!found) {
      throw new ProviderError(`Bolag ${orgnr} finns inte i mockdata`, this.name, orgnr);
    }
    return found.financials.map((f) => ({ ...f }));
  }
}
