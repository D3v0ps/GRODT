import { describe, expect, it } from "vitest";
import {
  MockProvider,
  STILLASTAENDE_ORGNR,
  TALANGBRON_ORGNR,
  KOMPETENSBRON_ORGNR,
} from "@/lib/providers/mock";
import type {
  CompanyDataProvider,
  CompanyDetails,
  YearFinancials,
} from "@/lib/providers/types";
import { importCompany, runSync } from "./engine";
import { InMemorySyncStore } from "./store";

const settings = {
  sniCodes: ["78.100"],
  revenueMinSek: 5_000_000,
  revenueYears: [2021, 2022],
};

describe("synkmotorn", () => {
  it("skapar bolag, financials och leads från MockProvider", async () => {
    const store = new InMemorySyncStore();
    const result = await runSync(new MockProvider(), store, settings);

    expect(result.errors).toEqual([]);
    expect(result.fetched).toBeGreaterThan(0);
    expect(result.created).toBe(result.fetched);
    expect(result.leadsCreated).toBe(result.fetched);
    expect(store.companies.size).toBe(result.fetched);
    expect(store.leads.size).toBe(result.fetched);

    // Obligatoriskt testfall: 3,0/8,0 mkr blir lead, 4,9/4,9 blir det inte.
    expect(store.leads.has(TALANGBRON_ORGNR)).toBe(true);
    expect(store.leads.has(STILLASTAENDE_ORGNR)).toBe(false);

    // Alla års siffror sparas, även år under tröskeln.
    const talangbron = store.financialsFor(TALANGBRON_ORGNR);
    expect(talangbron.map((f) => f.year)).toEqual([2021, 2022, 2023, 2024]);
    expect(talangbron[0].revenueSek).toBe(3_000_000);
  });

  it("är idempotent – två körningar i rad ger inga dubbletter", async () => {
    const store = new InMemorySyncStore();
    const first = await runSync(new MockProvider(), store, settings);
    const second = await runSync(new MockProvider(), store, settings);

    expect(second.fetched).toBe(first.fetched);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(first.fetched);
    expect(second.leadsCreated).toBe(0);
    expect(store.companies.size).toBe(first.fetched);
    expect(store.leads.size).toBe(first.fetched);
  });

  it("ändrade räkenskapsår i inställningarna påverkar nästa synk", async () => {
    const store = new InMemorySyncStore();
    await runSync(new MockProvider(), store, settings);
    expect(store.leads.has(KOMPETENSBRON_ORGNR)).toBe(false);

    const result = await runSync(new MockProvider(), store, {
      ...settings,
      revenueYears: [2023, 2024],
    });
    expect(store.leads.has(KOMPETENSBRON_ORGNR)).toBe(true);
    expect(result.leadsCreated).toBeGreaterThan(0);
  });

  it("kvalificerar i motorn även om providern släpper igenom okvalificerade bolag", async () => {
    // Simulerar t.ex. tic.io vars sökförfilter är grövre än ELLER-regeln.
    const sloppy: CompanyDataProvider = {
      name: "sloppy",
      label: "Sloppy",
      async searchCompanies() {
        return {
          companies: [
            { orgnr: "555555-5555", namn: "Under Tröskeln AB", ort: "Visby" },
          ],
          page: 1,
          totalPages: 1,
          total: 1,
        };
      },
      async getCompany(orgnr): Promise<CompanyDetails> {
        return { orgnr, namn: "Under Tröskeln AB", ort: "Visby", sniKod: "78.100", adress: null, antalAnstallda: 3, hemsida: null, telefon: null };
      },
      async getFinancials(): Promise<YearFinancials[]> {
        return [
          { year: 2021, revenueSek: 4_900_000, profitSek: 100_000, employees: 3 },
          { year: 2022, revenueSek: 4_900_000, profitSek: 100_000, employees: 3 },
        ];
      },
    };

    const store = new InMemorySyncStore();
    const result = await runSync(sloppy, store, settings);
    // Bolaget och alla års siffror sparas …
    expect(store.companies.has("555555-5555")).toBe(true);
    expect(store.financialsFor("555555-5555")).toHaveLength(2);
    // … men inget lead skapas.
    expect(store.leads.size).toBe(0);
    expect(result.leadsCreated).toBe(0);
  });

  it("samlar fel per bolag utan att stoppa körningen", async () => {
    const flaky: CompanyDataProvider = {
      name: "flaky",
      label: "Flaky",
      async searchCompanies() {
        return {
          companies: [
            { orgnr: "111111-1111", namn: "Trasig AB", ort: null },
            { orgnr: "556712-4830", namn: "Hel AB", ort: null },
          ],
          page: 1,
          totalPages: 1,
          total: 2,
        };
      },
      async getCompany(orgnr): Promise<CompanyDetails> {
        if (orgnr === "111111-1111") throw new Error("API-timeout");
        return { orgnr, namn: "Hel AB", ort: "Stockholm", sniKod: "78.100", adress: null, antalAnstallda: 10, hemsida: null, telefon: null };
      },
      async getFinancials(): Promise<YearFinancials[]> {
        return [{ year: 2021, revenueSek: 9_000_000, profitSek: null, employees: 10 }];
      },
    };

    const store = new InMemorySyncStore();
    const result = await runSync(flaky, store, settings);
    expect(result.fetched).toBe(1);
    expect(result.errors).toEqual([
      { orgnr: "111111-1111", message: "API-timeout" },
    ]);
    expect(store.leads.has("556712-4830")).toBe(true);
  });

  it("avregistrerade bolag markeras Förlorad och får aldrig nytt lead", async () => {
    const avregistrerad: CompanyDataProvider = {
      name: "bolagsverket",
      label: "BV",
      async searchCompanies() {
        return {
          companies: [{ orgnr: "556712-4830", namn: "Nedlagt AB", ort: null }],
          page: 1,
          totalPages: 1,
          total: 1,
        };
      },
      async getCompany(orgnr): Promise<CompanyDetails> {
        return {
          orgnr,
          namn: "Nedlagt AB",
          ort: "Visby",
          sniKod: "78.100",
          adress: null,
          antalAnstallda: null,
          hemsida: null,
          telefon: null,
          avregistreradDatum: "2024-02-01",
        };
      },
      async getFinancials(): Promise<YearFinancials[]> {
        return [{ year: 2023, revenueSek: 9_000_000, profitSek: null, employees: null }];
      },
    };

    // Befintligt lead → flyttas till Förlorad.
    const store = new InMemorySyncStore();
    store.leads.add("556712-4830");
    await runSync(avregistrerad, store, { ...settings, revenueYears: [2023] });
    expect(store.lostLeads.has("556712-4830")).toBe(true);

    // Utan befintligt lead → inget lead skapas trots kvalificerande omsättning.
    const freshStore = new InMemorySyncStore();
    const result = await runSync(avregistrerad, freshStore, { ...settings, revenueYears: [2023] });
    expect(result.leadsCreated).toBe(0);
    expect(freshStore.leads.size).toBe(0);
    // Bolaget och siffrorna sparas ändå.
    expect(freshStore.companies.has("556712-4830")).toBe(true);
  });

  it("dedupar orgnr inom samma körning", async () => {
    const repeating: CompanyDataProvider = {
      name: "repeat",
      label: "Repeat",
      async searchCompanies() {
        return {
          companies: [
            { orgnr: "222222-2222", namn: "Dubblett AB", ort: null },
            { orgnr: "222222-2222", namn: "Dubblett AB", ort: null },
          ],
          page: 1,
          totalPages: 1,
          total: 2,
        };
      },
      async getCompany(orgnr): Promise<CompanyDetails> {
        return { orgnr, namn: "Dubblett AB", ort: null, sniKod: "78.100", adress: null, antalAnstallda: null, hemsida: null, telefon: null };
      },
      async getFinancials(): Promise<YearFinancials[]> {
        return [{ year: 2022, revenueSek: 6_000_000, profitSek: null, employees: null }];
      },
    };

    const store = new InMemorySyncStore();
    const result = await runSync(repeating, store, settings);
    expect(result.fetched).toBe(1);
    expect(store.companies.size).toBe(1);
    expect(store.leads.size).toBe(1);
  });
});

describe("importCompany (delas av synk och CSV-import)", () => {
  const details: CompanyDetails = {
    orgnr: "559301-2347",
    namn: "Talangbron Tillväxt AB",
    ort: "Eskilstuna",
    sniKod: "78.100",
    adress: null,
    antalAnstallda: 12,
    hemsida: null,
    telefon: null,
  };

  it("leadMode 'always' skapar lead även under tröskeln", async () => {
    const store = new InMemorySyncStore();
    const outcome = await importCompany(store, settings, {
      details,
      financials: [{ year: 2021, revenueSek: 1_000_000, profitSek: null, employees: null }],
      kalla: "csv",
      leadMode: "always",
    });
    expect(outcome.leadCreated).toBe(true);
  });

  it("leadMode 'qualified' följer filtret och skapar aldrig dubblett-lead", async () => {
    const store = new InMemorySyncStore();
    const financials = [{ year: 2022, revenueSek: 8_000_000, profitSek: null, employees: null }];
    const first = await importCompany(store, settings, { details, financials, kalla: "csv" });
    const second = await importCompany(store, settings, { details, financials, kalla: "csv" });
    expect(first).toEqual({ company: "created", leadCreated: true });
    expect(second).toEqual({ company: "updated", leadCreated: false });
    expect(store.leads.size).toBe(1);
  });
});
