/**
 * Svenska format enligt DESIGN_SPEC §1.3:
 * belopp "5 000 000 kr" med hårt mellanslag, datum YYYY-MM-DD,
 * mkr med decimalkomma ("8,1 mkr").
 *
 * Egna implementationer i stället för toLocaleString eftersom
 * grupperingstecknet för sv-SE skiljer sig mellan V8-versioner
 * (U+00A0 vs U+202F) – det skulle ge hydreringsfel mellan server
 * och klient. Här används alltid hårt mellanslag (U+00A0).
 */

export const NBSP = " ";
const MINUS = "−";

export function fmtNumber(value: number): string {
  const negative = value < 0;
  const digits = String(Math.trunc(Math.abs(value)));
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    out += digits[i];
    const remaining = digits.length - 1 - i;
    if (remaining > 0 && remaining % 3 === 0) out += NBSP;
  }
  return (negative ? MINUS : "") + out;
}

export function fmtKr(value: number): string {
  return `${fmtNumber(value)}${NBSP}kr`;
}

/** "8,1 mkr" – en decimal med decimalkomma. */
export function fmtMkr(value: number): string {
  const tenths = Math.round((value / 1_000_000) * 10);
  const negative = tenths < 0;
  const abs = Math.abs(tenths);
  const whole = Math.floor(abs / 10);
  const decimal = abs % 10;
  return `${negative ? MINUS : ""}${fmtNumber(whole)},${decimal}${NBSP}mkr`;
}

const STOCKHOLM = "Europe/Stockholm";

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STOCKHOLM,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STOCKHOLM,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** YYYY-MM-DD i svensk tid. */
export function fmtDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "–";
  return dateFormatter.format(d);
}

/** YYYY-MM-DD HH:mm i svensk tid. */
export function fmtDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "–";
  return dateTimeFormatter.format(d);
}

/** Antal hela dagar sedan en tidpunkt (för "4 d" på kanban-kort). */
export function daysSince(value: string | Date, now: Date = new Date()): number {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86_400_000));
}

/** Tolkar inmatade belopp som "5 000 000" eller "5000000" till heltal kr. */
export function parseSekInput(input: string): number | null {
  const cleaned = input.replace(/[\s  ]/g, "").replace(/kr$/i, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isSafeInteger(n) ? n : null;
}

/** "Anna Lindqvist" → "AL" (initialer till avatarer). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stabil avatarfärgklass per användar-id ("", "a2", "a3", "a4"). */
export function avatarClass(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const variants = ["", "a2", "a3", "a4"];
  return variants[hash % variants.length];
}

/**
 * Procent med decimalkomma: "24,3 %", med tecken: "+24,3 %" / "−8,1 %".
 */
export function fmtPercent(value: number, opts: { sign?: boolean } = {}): string {
  const tenths = Math.round(value * 10);
  const negative = tenths < 0;
  const abs = Math.abs(tenths);
  const whole = Math.floor(abs / 10);
  const decimal = abs % 10;
  const prefix = negative ? MINUS : opts.sign && tenths > 0 ? "+" : "";
  return `${prefix}${fmtNumber(whole)},${decimal}${NBSP}%`;
}

/** Normaliserar orgnr till "XXXXXX-XXXX". Returnerar null om ogiltigt. */
export function normalizeOrgnr(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  // 12 siffror (sekelprefix 16) förekommer hos vissa leverantörer.
  const ten = digits.length === 12 && digits.startsWith("16") ? digits.slice(2) : digits;
  if (ten.length !== 10) return null;
  return `${ten.slice(0, 6)}-${ten.slice(6)}`;
}
