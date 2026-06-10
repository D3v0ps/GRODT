import { formatSniCode } from "@/lib/constants";
import { normalizeOrgnr } from "@/lib/format";
import type { CompanyDetails, YearFinancials } from "@/lib/providers/types";

/**
 * CSV-import av bolagslistor.
 *
 * Tål filer från svensk Excel och olika exporter:
 *  - avgränsare ; , eller tab (autodetekteras), citerade fält, CRLF/LF, BOM
 *  - UTF-8 eller Windows-1252/Latin-1 (autodetekteras i decodeCsvBuffer)
 *  - svenska och engelska kolumnrubriker (se HEADER_SYNONYMS)
 *  - belopp som "5 000 000", "5.000.000", "5 200 tkr", "5,2 mkr", "4900000"
 *
 * Två format stöds:
 *  - Brett: en rad per bolag, årskolumner som "Omsättning 2023",
 *    "Resultat 2024 (tkr)", "Anställda 2023".
 *  - Långt: en rad per bolag och år, med en "År"-kolumn plus
 *    "Omsättning"/"Resultat"/"Anställda" utan årtal.
 *
 * Belopp normaliseras ALLTID till SEK som heltal. Kolumnrubriker eller
 * cellvärden med tkr/ksek tolkas som tusental kronor och multipliceras
 * med 1000 (se även lib/providers/units.ts).
 */

export interface CsvRowError {
  /** 1-baserat radnummer i filen, inklusive rubrikraden. */
  row: number;
  message: string;
}

export interface CsvCompanyRow {
  details: CompanyDetails;
  financials: YearFinancials[];
}

export type CsvFormat = "brett" | "langt" | "endast-bolag";

export interface CsvParseOptions {
  /**
   * Behåll endast rader vars SNI-kod matchar någon av dessa koder
   * (t.ex. inställningarnas ["78.100"]). Tillämhär bara när filen har en
   * SNI-kolumn – saknas kolumnen behålls alla rader och sniColumnFound
   * blir false. Filtreringen sker under tolkningen, vilket gör att även
   * mycket stora filer (hundratusentals rader) kan bantas till det
   * relevanta urvalet utan att allt materialiseras.
   */
  sniFilter?: string[];
}

export interface CsvParseOutcome {
  rows: CsvCompanyRow[];
  errors: CsvRowError[];
  ignoredColumns: string[];
  /** Vilka räkenskapsår som förekommer i filen. */
  yearsFound: number[];
  hasRevenueData: boolean;
  /** Om filen hade en SNI-kolumn (krävs för SNI-filtrering). */
  sniColumnFound: boolean;
  /** Antal rader som filtrerades bort av sniFilter. */
  rowsFilteredBySni: number;
  format: CsvFormat;
  delimiter: string;
}

/** Tolkning sker klient-side, så taket är satt efter webbläsarminne. */
export const CSV_MAX_ROWS = 1_000_000;

/* ------------------------------------------------------------------ */
/* Teckenkodning                                                        */
/* ------------------------------------------------------------------ */

/** UTF-8 i första hand; vid ersättningstecken antas Windows-1252 (svensk Excel). */
export function decodeCsvBuffer(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!utf8.includes("�")) return stripBom(utf8);
  try {
    return stripBom(new TextDecoder("windows-1252").decode(bytes));
  } catch {
    return stripBom(utf8);
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/* ------------------------------------------------------------------ */
/* Rå CSV-parsning                                                      */
/* ------------------------------------------------------------------ */

export function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const counts: [string, number][] = [";", ",", "\t"].map((d) => [
    d,
    countOutsideQuotes(firstLine, d),
  ]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ";";
}

function countOutsideQuotes(line: string, char: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === char && !inQuotes) count++;
  }
  return count;
}

/** RFC 4180-aktig parser: citerade fält, dubblerade citattecken, CRLF/LF. */
export function parseCsvRaw(text: string, delimiter?: string): string[][] {
  const delim = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    // Hoppa över helt tomma rader
    if (row.some((f) => f.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else if (c === "\r") {
      if (text[i + 1] === "\n") i++;
      pushRow();
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) pushRow();
  return rows;
}

/* ------------------------------------------------------------------ */
/* Beloppstolkning                                                      */
/* ------------------------------------------------------------------ */

const UNIT_FACTORS: [RegExp, number][] = [
  [/(mkr|msek|miljoner(\s*kr)?)\s*$/i, 1_000_000],
  [/(tkr|ksek|kkr|tsek|tusental(\s*kr)?)\s*$/i, 1_000],
  [/(kr|sek|:-)\s*$/i, 1],
];

/**
 * Tolkar svenska och engelska beloppsformat till heltal.
 * defaultFactor används när cellen saknar egen enhet (t.ex. tkr-kolumn).
 */
export function parseAmount(raw: string, defaultFactor = 1): number | null {
  let s = raw.trim();
  if (s === "" || s === "-" || s === "–") return null;

  let factor = defaultFactor;
  for (const [pattern, f] of UNIT_FACTORS) {
    if (pattern.test(s)) {
      factor = f;
      s = s.replace(pattern, "").trim();
      break;
    }
  }

  const negative = /^[-−(]/.test(s);
  s = s.replace(/[()−]/g, "").replace(/^-/, "");
  s = s.replace(/[\s  ']/g, "");

  if (s === "") return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Den sista av , och . är decimaltecken, den andra tusentalsavskiljare.
    const decimalSep = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const groupSep = decimalSep === "," ? "." : ",";
    s = s.split(groupSep).join("").replace(decimalSep, ".");
  } else if (hasComma) {
    const parts = s.split(",");
    // Flera kommatecken = engelsk tusentalsavskiljare, annars decimalkomma.
    s = parts.length > 2 ? parts.join("") : parts.join(".");
  } else if (hasDot) {
    const parts = s.split(".");
    const groupsOfThree = parts.slice(1).every((p) => p.length === 3);
    // "5.000" / "5.000.000" = tusental; "5.2" = decimal.
    if (parts.length > 2 || (groupsOfThree && s.length >= 5)) s = parts.join("");
  }

  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const value = Number(s) * factor;
  if (!Number.isFinite(value)) return null;
  return Math.round(negative ? -value : value);
}

export function parseIntCell(raw: string): number | null {
  const n = parseAmount(raw, 1);
  return n === null ? null : Math.round(n);
}

/* ------------------------------------------------------------------ */
/* Kolumnmappning                                                       */
/* ------------------------------------------------------------------ */

type CompanyField =
  | "orgnr"
  | "namn"
  | "ort"
  | "adress"
  | "anstallda"
  | "hemsida"
  | "telefon"
  | "sni";

const HEADER_SYNONYMS: Record<CompanyField, string[]> = {
  orgnr: ["orgnr", "org nr", "organisationsnummer", "orgnummer", "organisationsnr", "orgnr.", "org no", "registration number", "registrationnumber"],
  namn: ["namn", "bolagsnamn", "företagsnamn", "foretagsnamn", "bolag", "företag", "foretag", "company", "company name", "name", "firma"],
  ort: ["ort", "stad", "city", "säte", "sate", "postort"],
  adress: ["adress", "address", "gatuadress", "postadress", "besöksadress", "besoksadress", "street"],
  anstallda: ["anställda", "anstallda", "antal anställda", "antal anstallda", "employees", "antal medarbetare", "medarbetare", "anst"],
  hemsida: ["hemsida", "webb", "webbplats", "website", "webbsida", "url", "www", "homepage"],
  telefon: ["telefon", "tel", "telefonnummer", "phone", "tfn"],
  sni: ["sni", "sni kod", "snikod", "bransch", "branschkod", "sni 2007", "näringsgren", "naringsgren"],
};

const REVENUE_KEYWORDS = ["omsättning", "omsattning", "nettoomsättning", "nettoomsattning", "oms", "revenue", "net sales", "netsales", "försäljning", "forsaljning", "turnover"];
const PROFIT_KEYWORDS = ["resultat", "vinst", "profit", "rörelseresultat", "rorelseresultat", "ebit", "årets resultat", "arets resultat"];
const EMPLOYEE_KEYWORDS = ["anställda", "anstallda", "employees", "medarbetare"];
const YEAR_COLUMN_NAMES = ["år", "ar", "year", "räkenskapsår", "rakenskapsar", "bokslutsår", "bokslutsar", "fiscal year"];
const TKR_HINTS = ["tkr", "ksek", "k sek", "tsek", "tusental", "(k)"];

function normalizeHeader(raw: string): string {
  return raw
    .replace(/^﻿/, "")
    .toLowerCase()
    .replace(/[._/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface YearColumn {
  index: number;
  kind: "revenue" | "profit" | "employees";
  year: number;
  factor: number; // 1 eller 1000 (tkr-kolumn)
}

interface LongColumns {
  yearIndex: number;
  revenueIndex: number | null;
  revenueFactor: number;
  profitIndex: number | null;
  profitFactor: number;
  employeesIndex: number | null;
}

interface HeaderMapping {
  company: Partial<Record<CompanyField, number>>;
  yearColumns: YearColumn[];
  long: LongColumns | null;
  ignored: string[];
}

function headerFactor(header: string): number {
  return TKR_HINTS.some((h) => header.includes(h)) ? 1000 : 1;
}

function matchKeyword(header: string, keywords: string[]): boolean {
  return keywords.some((k) => header.includes(k));
}

export function mapHeaders(headers: string[]): HeaderMapping {
  const company: Partial<Record<CompanyField, number>> = {};
  const yearColumns: YearColumn[] = [];
  const ignored: string[] = [];
  let yearIndex: number | null = null;
  let longRevenue: { index: number; factor: number } | null = null;
  let longProfit: { index: number; factor: number } | null = null;
  let longEmployees: number | null = null;

  header_loop: for (let index = 0; index < headers.length; index++) {
    const raw = headers[index];
    const header = normalizeHeader(raw);
    if (header === "") continue;

    const yearMatch = header.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      const year = Number(yearMatch[0]);
      const factor = headerFactor(header);
      if (matchKeyword(header, REVENUE_KEYWORDS)) {
        yearColumns.push({ index, kind: "revenue", year, factor });
        continue;
      }
      if (matchKeyword(header, PROFIT_KEYWORDS)) {
        yearColumns.push({ index, kind: "profit", year, factor });
        continue;
      }
      if (matchKeyword(header, EMPLOYEE_KEYWORDS)) {
        yearColumns.push({ index, kind: "employees", year, factor: 1 });
        continue;
      }
    }

    if (YEAR_COLUMN_NAMES.includes(header)) {
      yearIndex = index;
      continue;
    }

    // Kolumner utan årtal: bolagsfält eller långt format.
    for (const field of Object.keys(HEADER_SYNONYMS) as CompanyField[]) {
      if (HEADER_SYNONYMS[field].includes(header)) {
        if (!(field in company)) company[field] = index;
        continue header_loop;
      }
    }
    if (matchKeyword(header, REVENUE_KEYWORDS)) {
      longRevenue ??= { index, factor: headerFactor(header) };
      continue;
    }
    if (matchKeyword(header, PROFIT_KEYWORDS)) {
      longProfit ??= { index, factor: headerFactor(header) };
      continue;
    }
    ignored.push(raw.trim());
  }

  let long: LongColumns | null = null;
  if (yearIndex !== null && (longRevenue || longProfit)) {
    // "Anställda" utan årtal hör till boksluten i långt format.
    if ("anstallda" in company) {
      longEmployees = company.anstallda ?? null;
      delete company.anstallda;
    }
    long = {
      yearIndex,
      revenueIndex: longRevenue?.index ?? null,
      revenueFactor: longRevenue?.factor ?? 1,
      profitIndex: longProfit?.index ?? null,
      profitFactor: longProfit?.factor ?? 1,
      employeesIndex: longEmployees,
    };
  }

  return { company, yearColumns, long, ignored };
}

/* ------------------------------------------------------------------ */
/* Radtolkning                                                          */
/* ------------------------------------------------------------------ */

function cell(row: string[], index: number | undefined | null): string {
  if (index === undefined || index === null) return "";
  return (row[index] ?? "").trim();
}

export function parseCompanyCsv(
  text: string,
  options: CsvParseOptions = {},
): CsvParseOutcome {
  const delimiter = detectDelimiter(text);
  const raw = parseCsvRaw(text, delimiter);
  const errors: CsvRowError[] = [];

  const failed = (message: string, mapping?: HeaderMapping): CsvParseOutcome => ({
    rows: [],
    errors: [{ row: 1, message }],
    ignoredColumns: mapping?.ignored ?? [],
    yearsFound: [],
    hasRevenueData: false,
    sniColumnFound: mapping?.company.sni !== undefined,
    rowsFilteredBySni: 0,
    format: "endast-bolag",
    delimiter,
  });

  if (raw.length === 0) {
    return failed("Filen är tom.");
  }
  if (raw.length - 1 > CSV_MAX_ROWS) {
    return failed(`Filen har fler än ${CSV_MAX_ROWS} rader – dela upp den.`);
  }

  const mapping = mapHeaders(raw[0]);
  if (mapping.company.orgnr === undefined) {
    return failed('Hittar ingen orgnr-kolumn. Döp kolumnen till t.ex. "Orgnr" eller "Organisationsnummer".', mapping);
  }
  if (mapping.company.namn === undefined) {
    return failed('Hittar ingen namnkolumn. Döp kolumnen till t.ex. "Bolagsnamn" eller "Namn".', mapping);
  }
  if (mapping.long && mapping.yearColumns.length > 0) {
    return failed('Filen blandar årskolumner (t.ex. "Omsättning 2023") med en separat År-kolumn. Använd det ena formatet.', mapping);
  }

  const format: CsvFormat = mapping.long
    ? "langt"
    : mapping.yearColumns.some((c) => c.kind === "revenue")
      ? "brett"
      : "endast-bolag";

  const sniColumnFound = mapping.company.sni !== undefined;
  const sniFilterSet =
    sniColumnFound && options.sniFilter && options.sniFilter.length > 0
      ? new Set(options.sniFilter.map((c) => c.replace(/\D/g, "")))
      : null;
  let rowsFilteredBySni = 0;

  // orgnr → ackumulerad rad (dubbletter i filen slås ihop).
  const byOrgnr = new Map<string, CsvCompanyRow>();

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    const lineNo = i + 1;

    if (sniFilterSet) {
      const sniDigits = cell(row, mapping.company.sni).replace(/\D/g, "");
      if (!sniFilterSet.has(sniDigits)) {
        rowsFilteredBySni++;
        continue;
      }
    }

    const orgnr = normalizeOrgnr(cell(row, mapping.company.orgnr));
    if (!orgnr) {
      errors.push({ row: lineNo, message: `Ogiltigt organisationsnummer: "${cell(row, mapping.company.orgnr)}"` });
      continue;
    }
    const namn = cell(row, mapping.company.namn);
    const existing = byOrgnr.get(orgnr);
    if (!existing && namn === "") {
      errors.push({ row: lineNo, message: `Bolagsnamn saknas för ${orgnr}` });
      continue;
    }

    const anstallda = parseIntCell(cell(row, mapping.company.anstallda));
    const details: CompanyDetails = existing?.details ?? {
      orgnr,
      namn,
      ort: cell(row, mapping.company.ort) || null,
      sniKod: formatSniCode(cell(row, mapping.company.sni)) ?? null,
      adress: cell(row, mapping.company.adress) || null,
      antalAnstallda: anstallda,
      hemsida: cell(row, mapping.company.hemsida) || null,
      telefon: cell(row, mapping.company.telefon) || null,
    };

    const entry: CsvCompanyRow = existing ?? { details, financials: [] };

    if (mapping.long) {
      const year = parseIntCell(cell(row, mapping.long.yearIndex));
      if (year === null || year < 1900 || year > 2100) {
        errors.push({ row: lineNo, message: `Ogiltigt år: "${cell(row, mapping.long.yearIndex)}"` });
      } else {
        upsertYear(entry.financials, {
          year,
          revenueSek: mapping.long.revenueIndex === null ? null : parseAmount(cell(row, mapping.long.revenueIndex), mapping.long.revenueFactor),
          profitSek: mapping.long.profitIndex === null ? null : parseAmount(cell(row, mapping.long.profitIndex), mapping.long.profitFactor),
          employees: mapping.long.employeesIndex === null ? null : parseIntCell(cell(row, mapping.long.employeesIndex)),
        });
      }
    } else {
      for (const col of mapping.yearColumns) {
        const value = cell(row, col.index);
        if (value === "") continue;
        const yearRow = ensureYear(entry.financials, col.year);
        if (col.kind === "revenue") yearRow.revenueSek = parseAmount(value, col.factor);
        else if (col.kind === "profit") yearRow.profitSek = parseAmount(value, col.factor);
        else yearRow.employees = parseIntCell(value);
      }
    }

    byOrgnr.set(orgnr, entry);
  }

  const rows = [...byOrgnr.values()].map((r) => ({
    ...r,
    financials: r.financials.sort((a, b) => a.year - b.year),
  }));
  const yearsFound = [...new Set(rows.flatMap((r) => r.financials.map((f) => f.year)))].sort();
  const hasRevenueData = rows.some((r) => r.financials.some((f) => f.revenueSek !== null));

  return {
    rows,
    errors,
    ignoredColumns: mapping.ignored,
    yearsFound,
    hasRevenueData,
    sniColumnFound,
    rowsFilteredBySni,
    format,
    delimiter,
  };
}

function ensureYear(financials: YearFinancials[], year: number): YearFinancials {
  let row = financials.find((f) => f.year === year);
  if (!row) {
    row = { year, revenueSek: null, profitSek: null, employees: null };
    financials.push(row);
  }
  return row;
}

function upsertYear(financials: YearFinancials[], next: YearFinancials): void {
  const row = ensureYear(financials, next.year);
  if (next.revenueSek !== null) row.revenueSek = next.revenueSek;
  if (next.profitSek !== null) row.profitSek = next.profitSek;
  if (next.employees !== null) row.employees = next.employees;
}
