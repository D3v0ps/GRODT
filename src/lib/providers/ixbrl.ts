import { inflateRawSync } from "node:zlib";
import type { YearFinancials } from "./types";

/**
 * Tolkning av digitalt inlämnade årsredovisningar (iXBRL) från
 * Bolagsverkets Värdefulla datamängder.
 *
 * Dokumenten levereras som ZIP med en XHTML-fil där beloppen är taggade
 * enligt den svenska XBRL-taxonomin (se-gen-base). Vi plockar ut:
 *   - Nettoomsattning        → revenueSek
 *   - AretsResultat          → profitSek
 *   - MedelantaletAnstallda  → employees
 *
 * Varje årsredovisning innehåller normalt både räkenskapsåret och
 * jämförelseåret, så en nedladdning ger två års siffror. Belopp
 * normaliseras till SEK som heltal: värdet multipliceras med
 * 10^scale (scale="3" betyder tkr) och tecknet styrs av sign-attributet.
 */

/* ------------------------------------------------------------------ */
/* Minimal ZIP-läsare (utan beroenden)                                  */
/* ------------------------------------------------------------------ */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** Tak per uppackad fil – skyddar mot zip-bomber i nedladdade dokument. */
const MAX_ENTRY_BYTES = 50 * 1024 * 1024;

interface ZipEntry {
  name: string;
  data: Buffer;
}

/** Läser ut alla filer ur en ZIP-buffer (stored eller deflate). */
export function extractZipEntries(buffer: Buffer): ZipEntry[] {
  // Hitta End of Central Directory (sista 64 kB kan innehålla kommentar).
  let eocd = -1;
  const start = Math.max(0, buffer.length - 65_557);
  for (let i = buffer.length - 22; i >= start; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("Ogiltig ZIP-fil (hittar inte katalogslutet).");

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  if (entryCount === 0xffff || offset === 0xffff_ffff) {
    throw new Error("ZIP64-arkiv stöds inte.");
  }

  const entries: ZipEntry[] = [];
  for (let i = 0; i < entryCount; i++) {
    if (offset + 46 > buffer.length) break;
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    if (compressedSize === 0xffff_ffff || localOffset === 0xffff_ffff) {
      throw new Error("ZIP64-arkiv stöds inte.");
    }
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    if (
      localOffset + 30 <= buffer.length &&
      buffer.readUInt32LE(localOffset) === LOCAL_SIGNATURE
    ) {
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      if (dataStart + compressedSize <= buffer.length) {
        const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
        try {
          const data =
            method === 8
              ? inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_BYTES })
              : Buffer.from(compressed);
          entries.push({ name, data });
        } catch {
          // Hoppa över filer som inte går att packa upp (eller är för stora).
        }
      }
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/* ------------------------------------------------------------------ */
/* iXBRL-extraktion                                                     */
/* ------------------------------------------------------------------ */

const TAGS: {
  kind: "revenue" | "profit" | "employees" | "solidity";
  names: string[];
}[] = [
  { kind: "revenue", names: ["se-gen-base:Nettoomsattning"] },
  { kind: "profit", names: ["se-gen-base:AretsResultat"] },
  { kind: "employees", names: ["se-gen-base:MedelantaletAnstallda"] },
  { kind: "solidity", names: ["se-gen-base:Soliditet"] },
];

/** contextRef → räkenskapsårets slutår, ur xbrli:context-elementen. */
function parseContextYears(xml: string): Map<string, number> {
  const out = new Map<string, number>();
  const contextPattern = /<(?:\w+:)?context[^>]*\bid="([^"]+)"[\s\S]*?<\/(?:\w+:)?context>/g;
  for (const match of xml.matchAll(contextPattern)) {
    const id = match[1];
    const body = match[0];
    const end =
      body.match(/<(?:\w+:)?endDate>\s*(\d{4})-\d{2}-\d{2}\s*<\/(?:\w+:)?endDate>/) ??
      body.match(/<(?:\w+:)?instant>\s*(\d{4})-\d{2}-\d{2}\s*<\/(?:\w+:)?instant>/);
    if (end) out.set(id, Number(end[1]));
  }
  return out;
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? match[1] : null;
}

/**
 * Tolkar taggat siffervärde med hänsyn till ix-formatattributet.
 * Svenska årsredovisningar använder oftast komma som decimaltecken
 * ("1.234,5" eller "5 200 000"), men taxonomin tillåter även
 * dot-decimal ("1,234.5") – utan formatkännedom blir sådana värden
 * fel med en faktor 10.
 */
export function parseTaggedNumber(raw: string, format?: string | null): number | null {
  let text = raw
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;|[\s  ]/g, "")
    .replace(/[−–—]/g, "-")
    .trim();
  if (text === "" || text === "-") return null;

  const fmt = (format ?? "").toLowerCase();
  if (fmt.includes("empty") || fmt.includes("nocontent")) return null;
  if (fmt.includes("zero")) return 0; // ixt:fixed-zero
  if (fmt.includes("dotdecimal") || fmt.includes("dot-decimal")) {
    // Decimaltecken är punkt; komma är tusentalsavskiljare.
    text = text.replace(/,/g, "");
  } else {
    // comma-decimal eller okänt/inget format: svensk praxis –
    // punkt som tusental, komma som decimaltecken.
    text = text.replace(/\./g, "").replace(",", ".");
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * Extraherar årssiffror ur ett iXBRL-dokument (XHTML-text).
 * Returnerar ett år per kontext med slutdatum, sorterat stigande.
 */
export function parseIxbrlFinancials(xml: string): YearFinancials[] {
  const contextYears = parseContextYears(xml);
  if (contextYears.size === 0) return [];

  const byYear = new Map<number, YearFinancials>();
  const ensure = (year: number): YearFinancials => {
    let row = byYear.get(year);
    if (!row) {
      row = { year, revenueSek: null, profitSek: null, employees: null, soliditetPct: null };
      byYear.set(year, row);
    }
    return row;
  };

  const nonFractionPattern =
    /<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi;
  for (const match of xml.matchAll(nonFractionPattern)) {
    const attrs = match[1];
    const name = attribute(`<x ${attrs}>`, "name");
    const tag = TAGS.find((t) => t.names.includes(name ?? ""));
    if (!tag) continue;

    const contextRef = attribute(`<x ${attrs}>`, "contextRef");
    const year = contextRef ? contextYears.get(contextRef) : undefined;
    if (!year) continue;

    const format = attribute(`<x ${attrs}>`, "format");
    const parsed = parseTaggedNumber(match[2], format);
    if (parsed === null) continue;

    const scale = Number(attribute(`<x ${attrs}>`, "scale") ?? "0");
    const sign = attribute(`<x ${attrs}>`, "sign") === "-" ? -1 : 1;
    const scaled = parsed * 10 ** (Number.isFinite(scale) ? scale : 0) * sign;

    const row = ensure(year);
    if (tag.kind === "revenue") row.revenueSek = Math.round(scaled);
    else if (tag.kind === "profit") row.profitSek = Math.round(scaled);
    else if (tag.kind === "employees") row.employees = Math.abs(Math.round(scaled));
    // Soliditet är procent, inte kronor – behåll en decimal.
    else row.soliditetPct = Math.round(scaled * 10) / 10;
  }

  return [...byYear.values()]
    .filter(
      (r) =>
        r.revenueSek !== null ||
        r.profitSek !== null ||
        r.employees !== null ||
        (r.soliditetPct ?? null) !== null,
    )
    .sort((a, b) => a.year - b.year);
}

/** ZIP eller rå XHTML → årssiffror. */
export function parseAnnualReport(buffer: Buffer): YearFinancials[] {
  const isZip = buffer.length > 4 && buffer.readUInt32LE(0) === LOCAL_SIGNATURE;
  if (!isZip) {
    return parseIxbrlFinancials(buffer.toString("utf8"));
  }
  const entries = extractZipEntries(buffer);
  // Ta den fil som faktiskt innehåller iXBRL-taggar.
  for (const entry of entries) {
    if (!/\.(xhtml|html|xml)$/i.test(entry.name)) continue;
    const text = entry.data.toString("utf8");
    if (text.includes("ix:nonFraction")) {
      return parseIxbrlFinancials(text);
    }
  }
  return [];
}
