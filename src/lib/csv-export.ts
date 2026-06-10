/**
 * CSV-export: semikolonseparerad (svensk Excel-standard) med BOM så att
 * å/ä/ö visas korrekt när filen dubbelklickas i Excel.
 */

const BOM = "﻿";

export function csvEscape(value: string): string {
  if (/[";\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
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
