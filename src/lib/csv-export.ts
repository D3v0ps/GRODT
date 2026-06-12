/**
 * CSV-export: semikolonseparerad (svensk Excel-standard) med BOM så att
 * å/ä/ö visas korrekt när filen dubbelklickas i Excel.
 */

const BOM = "﻿";

export function csvEscape(value: string): string {
  // Formelinjektion: text som inleds med =, +, -, @ eller tab/CR tolkas som
  // formel när filen öppnas i Excel. Rena tal (t.ex. negativ tillväxt) är
  // ofarliga och lämnas orörda, övriga prefixas med apostrof.
  const looksLikeNumber = /^-?\d+(?:[.,]\d+)?$/.test(value);
  const guarded =
    /^[=+\-@\t\r]/.test(value) && !looksLikeNumber ? `'${value}` : value;
  if (/[";\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

export function toCsv(rows: (string | number | null)[][]): string {
  const body = rows
    .map((row) =>
      row
        .map((cell) => csvEscape(cell === null ? "" : String(cell)))
        .join(";"),
    )
    .join("\r\n");
  return BOM + body + "\r\n";
}
