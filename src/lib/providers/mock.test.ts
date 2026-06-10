import { describe, expect, it } from "vitest";
import {
  KOMPETENSBRON_ORGNR,
  MOCK_PAGE_SIZE,
  MockProvider,
  STILLASTAENDE_ORGNR,
  TALANGBRON_ORGNR,
  buildMockDataset,
} from "./mock";

const defaultParams = {
  sniCodes: ["78.100"],
  revenueMinSek: 5_000_000,
  years: [2021, 2022],
};

async function allOrgnr(provider: MockProvider, params = defaultParams) {
  const out: string[] = [];
  let page = 1;
  for (;;) {
    const res = await provider.searchCompanies({ ...params, page });
    out.push(...res.companies.map((c) => c.orgnr));
    if (page >= res.totalPages) break;
    page++;
  }
  return out;
}

describe("MockProvider", () => {
  it("är deterministisk – två instanser ger identiskt dataset", () => {
    const a = buildMockDataset();
    const b = buildMockDataset();
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(45);
    expect(new Set(a.map((c) => c.orgnr)).size).toBe(a.length);
  });

  it("tillämpar ELLER-logiken i sökningen", async () => {
    const provider = new MockProvider();
    const orgnrs = await allOrgnr(provider);
    // 3,0 / 8,0 mkr → kvalificerar via år 2
    expect(orgnrs).toContain(TALANGBRON_ORGNR);
    // 4,9 / 4,9 mkr → under tröskeln båda åren
    expect(orgnrs).not.toContain(STILLASTAENDE_ORGNR);
    // Kompetensbron kvalificerar först 2024
    expect(orgnrs).not.toContain(KOMPETENSBRON_ORGNR);
  });

  it("ändrade räkenskapsår ger ett annat urval", async () => {
    const provider = new MockProvider();
    const early = await allOrgnr(provider, { ...defaultParams, years: [2021, 2022] });
    const late = await allOrgnr(provider, { ...defaultParams, years: [2023, 2024] });
    expect(late).toContain(KOMPETENSBRON_ORGNR);
    expect(early).not.toContain(KOMPETENSBRON_ORGNR);
    expect(new Set(late)).not.toEqual(new Set(early));
  });

  it("paginerar med korrekt totalsiffra", async () => {
    const provider = new MockProvider();
    const first = await provider.searchCompanies(defaultParams);
    expect(first.page).toBe(1);
    expect(first.companies.length).toBeLessThanOrEqual(MOCK_PAGE_SIZE);
    expect(first.totalPages).toBe(Math.ceil(first.total / MOCK_PAGE_SIZE));
    const all = await allOrgnr(provider);
    expect(all.length).toBe(first.total);
    expect(new Set(all).size).toBe(all.length);
  });

  it("okänd SNI-kod ger tomt resultat", async () => {
    const provider = new MockProvider();
    const res = await provider.searchCompanies({ ...defaultParams, sniCodes: ["62.010"] });
    expect(res.total).toBe(0);
  });

  it("getCompany/getFinancials returnerar konsistent data i SEK", async () => {
    const provider = new MockProvider();
    const company = await provider.getCompany(TALANGBRON_ORGNR);
    expect(company.namn).toBe("Talangbron Tillväxt AB");
    const financials = await provider.getFinancials(TALANGBRON_ORGNR);
    expect(financials.find((f) => f.year === 2021)?.revenueSek).toBe(3_000_000);
    expect(financials.find((f) => f.year === 2022)?.revenueSek).toBe(8_000_000);
  });

  it("kastar ProviderError för okänt orgnr", async () => {
    const provider = new MockProvider();
    await expect(provider.getCompany("000000-0000")).rejects.toThrowError(/mockdata/);
  });
});
