/**
 * Enhetskonvertering för bokslutsbelopp.
 *
 * Bokslutsdata levereras ofta i tkr ("KSEK") – t.ex. tic.io:s fält
 * rs_NetSalesK där 5000 betyder 5 000 000 kr. GRODT lagrar ALLTID
 * belopp i SEK som heltal, så konverteringen sker på exakt ett ställe
 * och är explicit testad (se units.test.ts).
 */

/** tkr → kr. 5000 tkr → 5 000 000 kr. Bevarar null/ogiltiga som null. */
export function tkrToSek(tkr: number | null | undefined): number | null {
  if (tkr === null || tkr === undefined || !Number.isFinite(tkr)) return null;
  return Math.round(tkr * 1000);
}

/** kr → tkr, för förfilter mot API:er som frågar i tkr. */
export function sekToTkr(sek: number): number {
  return Math.round(sek / 1000);
}
