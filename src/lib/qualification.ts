/**
 * Kärnregeln för omsättningsfiltret.
 *
 * Ett bolag kvalificerar om nettoomsättningen är >= revenueMinSek för
 * MINST ETT av åren i revenueYears (ELLER-logik). Snabbväxare som låg
 * under tröskeln ena året men över det andra ska alltså med.
 *
 * Alla belopp är SEK som heltal – aldrig tkr (se lib/providers/units.ts).
 */

export interface YearRevenue {
  year: number;
  revenueSek: number | null;
}

export interface QualificationParams {
  revenueMinSek: number;
  revenueYears: number[];
}

export function qualifies(
  financials: YearRevenue[],
  params: QualificationParams,
): boolean {
  return qualifyingYears(financials, params).length > 0;
}

/** Vilka av de konfigurerade åren som når tröskeln (för röd kvalificeringspunkt i UI). */
export function qualifyingYears(
  financials: YearRevenue[],
  params: QualificationParams,
): number[] {
  return params.revenueYears.filter((year) =>
    financials.some(
      (f) =>
        f.year === year &&
        f.revenueSek !== null &&
        f.revenueSek >= params.revenueMinSek,
    ),
  );
}
