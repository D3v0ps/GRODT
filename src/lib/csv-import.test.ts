import { describe, expect, it } from "vitest";
import {
  decodeCsvBuffer,
  detectDelimiter,
  parseAmount,
  parseCompanyCsv,
  parseCsvRaw,
} from "./csv-import";
import { importCompany } from "./sync/engine";
import { InMemorySyncStore } from "./sync/store";

const settings = {
  sniCodes: ["78.100"],
  revenueMinSek: 5_000_000,
  revenueYears: [2021, 2022],
};

describe("parseAmount – svenska beloppsformat", () => {
  it("tolkar mellanslag som tusentalsavskiljare", () => {
    expect(parseAmount("5 000 000")).toBe(5_000_000);
    expect(parseAmount("5 000 000")).toBe(5_000_000); // hårt mellanslag
    expect(parseAmount("5 000 000 kr")).toBe(5_000_000);
  });

  it("tolkar punkt-grupperade tal", () => {
    expect(parseAmount("5.000.000")).toBe(5_000_000);
    expect(parseAmount("5.000")).toBe(5_000);
  });

  it("tolkar decimalkomma", () => {
    expect(parseAmount("5,2 mkr")).toBe(5_200_000);
    expect(parseAmount("4,9")).toBe(5); // avrundas till heltal
  });

  it("tolkar tkr/ksek-enheter i cellen", () => {
    expect(parseAmount("5 200 tkr")).toBe(5_200_000);
    expect(parseAmount("4900 ksek")).toBe(4_900_000);
  });

  it("använder kolumnens enhetsfaktor när cellen saknar enhet", () => {
    expect(parseAmount("5200", 1000)).toBe(5_200_000);
  });

  it("engelska format med komma-gruppering", () => {
    expect(parseAmount("5,000,000")).toBe(5_000_000);
    expect(parseAmount("5,000,000.50")).toBe(5_000_001);
  });

  it("negativa belopp (förlust)", () => {
    expect(parseAmount("-120 000")).toBe(-120_000);
    expect(parseAmount("(120 000)")).toBe(-120_000);
  });

  it("tomt och skräp blir null", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("-")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("rå CSV-parsning", () => {
  it("detekterar avgränsare", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
  });

  it("hanterar citerade fält med avgränsare och citattecken", () => {
    const rows = parseCsvRaw('namn;ort\n"Bemanning; Syd AB";Malmö\n"Säger ""hej"" AB";Lund');
    expect(rows).toEqual([
      ["namn", "ort"],
      ["Bemanning; Syd AB", "Malmö"],
      ['Säger "hej" AB', "Lund"],
    ]);
  });

  it("hanterar CRLF och hoppar över tomma rader", () => {
    const rows = parseCsvRaw("a;b\r\n1;2\r\n\r\n3;4\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("decodeCsvBuffer hanterar UTF-8 med BOM och Windows-1252", () => {
    const utf8 = new TextEncoder().encode("﻿namn;ort\nÅkers Bemanning AB;Strängnäs");
    expect(decodeCsvBuffer(utf8)).toBe("namn;ort\nÅkers Bemanning AB;Strängnäs");

    // "Örebro" i Windows-1252 (Ö = 0xD6)
    const win1252 = new Uint8Array([0x6f, 0x72, 0x74, 0x0a, 0xd6, 0x72, 0x65, 0x62, 0x72, 0x6f]);
    expect(decodeCsvBuffer(win1252)).toBe("ort\nÖrebro");
  });
});

describe("parseCompanyCsv – brett format", () => {
  const csv = [
    "Bolagsnamn;Orgnr;Ort;Anställda;Omsättning 2021;Omsättning 2022;Resultat 2022 (tkr)",
    "Talangbron Tillväxt AB;559301-2347;Eskilstuna;12;3 000 000;8 000 000;560",
    "Stillastående Bemanning AB;5594025681;Karlstad;8;4 900 000;4 900 000;160",
    "Trasig Rad AB;ogiltigt;Ystad;3;1;2;3",
  ].join("\n");

  it("mappar rubriker, normaliserar orgnr och konverterar tkr-kolumner", () => {
    const outcome = parseCompanyCsv(csv);
    expect(outcome.format).toBe("brett");
    expect(outcome.hasRevenueData).toBe(true);
    expect(outcome.yearsFound).toEqual([2021, 2022]);
    expect(outcome.rows).toHaveLength(2);
    expect(outcome.errors).toEqual([
      { row: 4, message: 'Ogiltigt organisationsnummer: "ogiltigt"' },
    ]);

    const talangbron = outcome.rows[0];
    expect(talangbron.details).toMatchObject({
      orgnr: "559301-2347",
      namn: "Talangbron Tillväxt AB",
      ort: "Eskilstuna",
      antalAnstallda: 12,
    });
    expect(talangbron.financials).toEqual([
      { year: 2021, revenueSek: 3_000_000, profitSek: null, employees: null },
      { year: 2022, revenueSek: 8_000_000, profitSek: 560_000, employees: null },
    ]);

    // orgnr utan bindestreck normaliseras
    expect(outcome.rows[1].details.orgnr).toBe("559402-5681");
  });

  it("slår ihop dubblettrader på samma orgnr", () => {
    const dup = [
      "Orgnr;Namn;Omsättning 2021;Omsättning 2022",
      "559301-2347;Talangbron Tillväxt AB;3 000 000;",
      "559301-2347;Talangbron Tillväxt AB;;8 000 000",
    ].join("\n");
    const outcome = parseCompanyCsv(dup);
    expect(outcome.rows).toHaveLength(1);
    expect(outcome.rows[0].financials).toEqual([
      { year: 2021, revenueSek: 3_000_000, profitSek: null, employees: null },
      { year: 2022, revenueSek: 8_000_000, profitSek: null, employees: null },
    ]);
  });

  it("kräver orgnr- och namnkolumn", () => {
    expect(parseCompanyCsv("Ort;Omsättning 2021\nLund;1").errors[0].message).toMatch(/orgnr-kolumn/i);
    expect(parseCompanyCsv("Orgnr;Ort\n556712-4830;Lund").errors[0].message).toMatch(/namnkolumn/i);
  });
});

describe("parseCompanyCsv – långt format", () => {
  it("grupperar rader per bolag med en rad per år", () => {
    const csv = [
      "orgnr,company,year,revenue (ksek),profit (ksek)",
      "5593012347,Talangbron Tillväxt AB,2021,3000,200",
      "5593012347,Talangbron Tillväxt AB,2022,8000,560",
    ].join("\n");
    const outcome = parseCompanyCsv(csv);
    expect(outcome.format).toBe("langt");
    expect(outcome.rows).toHaveLength(1);
    expect(outcome.rows[0].financials).toEqual([
      { year: 2021, revenueSek: 3_000_000, profitSek: 200_000, employees: null },
      { year: 2022, revenueSek: 8_000_000, profitSek: 560_000, employees: null },
    ]);
  });

  it("rapporterar ogiltiga år per rad", () => {
    const csv = ["Orgnr;Namn;År;Omsättning", "556712-4830;AB;tjugo;5 000 000"].join("\n");
    const outcome = parseCompanyCsv(csv);
    expect(outcome.errors).toEqual([{ row: 2, message: 'Ogiltigt år: "tjugo"' }]);
  });
});

describe("parseCompanyCsv – SNI-filter (stora filer)", () => {
  const csv = [
    "Orgnr;Bolagsnamn;SNI;Omsättning 2022",
    "556712-4830;Nordisk Bemanning AB;78.100;9 000 000",
    "556903-1177;Talangpartner Sverige AB;78100;8 000 000",
    "556488-2901;IT-Konsulterna AB;62.010;50 000 000",
  ].join("\n");

  it("behåller endast rader med matchande SNI-kod (med eller utan punkt)", () => {
    const outcome = parseCompanyCsv(csv, { sniFilter: ["78.100"] });
    expect(outcome.sniColumnFound).toBe(true);
    expect(outcome.rows.map((r) => r.details.orgnr)).toEqual([
      "556712-4830",
      "556903-1177",
    ]);
    expect(outcome.rowsFilteredBySni).toBe(1);
  });

  it("utan filter behålls alla rader", () => {
    const outcome = parseCompanyCsv(csv);
    expect(outcome.rows).toHaveLength(3);
    expect(outcome.rowsFilteredBySni).toBe(0);
  });

  it("saknas SNI-kolumn ignoreras filtret och sniColumnFound blir false", () => {
    const noSni = ["Orgnr;Bolagsnamn", "556712-4830;Nordisk Bemanning AB"].join("\n");
    const outcome = parseCompanyCsv(noSni, { sniFilter: ["78.100"] });
    expect(outcome.sniColumnFound).toBe(false);
    expect(outcome.rows).toHaveLength(1);
    expect(outcome.rowsFilteredBySni).toBe(0);
  });
});

describe("parseCompanyCsv – endast bolagslista (utan siffror)", () => {
  it("identifierar att omsättningsdata saknas", () => {
    const csv = ["Orgnr;Bolagsnamn;Ort", "556712-4830;Nordisk Bemanning AB;Stockholm"].join("\n");
    const outcome = parseCompanyCsv(csv);
    expect(outcome.format).toBe("endast-bolag");
    expect(outcome.hasRevenueData).toBe(false);
    expect(outcome.rows).toHaveLength(1);
  });
});

describe("CSV-import genom importpipen", () => {
  it("OBLIGATORISKT: 3/8 mkr blir lead, 4,9/4,9 blir bolag utan lead – idempotent", async () => {
    const csv = [
      "Bolagsnamn;Orgnr;Omsättning 2021;Omsättning 2022",
      "Talangbron Tillväxt AB;559301-2347;3 000 000;8 000 000",
      "Stillastående Bemanning AB;559402-5681;4 900 000;4 900 000",
    ].join("\n");
    const outcome = parseCompanyCsv(csv);
    const store = new InMemorySyncStore();

    for (const row of outcome.rows) {
      await importCompany(store, settings, { details: row.details, financials: row.financials, kalla: "csv" });
    }
    expect(store.companies.size).toBe(2);
    expect(store.leads.has("559301-2347")).toBe(true);
    expect(store.leads.has("559402-5681")).toBe(false);

    // Andra importen av samma fil ger inga dubbletter.
    for (const row of outcome.rows) {
      await importCompany(store, settings, { details: row.details, financials: row.financials, kalla: "csv" });
    }
    expect(store.companies.size).toBe(2);
    expect(store.leads.size).toBe(1);
    expect(store.financialsFor("559301-2347")).toHaveLength(2);
  });
});
