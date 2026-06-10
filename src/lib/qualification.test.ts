import { describe, expect, it } from "vitest";
import { qualifies, qualifyingYears } from "./qualification";

const params = { revenueMinSek: 5_000_000, revenueYears: [2021, 2022] };

describe("omsättningsfiltret (ELLER-logik)", () => {
  it("OBLIGATORISKT: 3 MSEK år 1 och 8 MSEK år 2 SKA inkluderas", () => {
    const financials = [
      { year: 2021, revenueSek: 3_000_000 },
      { year: 2022, revenueSek: 8_000_000 },
    ];
    expect(qualifies(financials, params)).toBe(true);
    expect(qualifyingYears(financials, params)).toEqual([2022]);
  });

  it("OBLIGATORISKT: 4,9 MSEK båda åren ska exkluderas", () => {
    const financials = [
      { year: 2021, revenueSek: 4_900_000 },
      { year: 2022, revenueSek: 4_900_000 },
    ];
    expect(qualifies(financials, params)).toBe(false);
    expect(qualifyingYears(financials, params)).toEqual([]);
  });

  it("exakt på tröskeln (≥) kvalificerar", () => {
    expect(qualifies([{ year: 2021, revenueSek: 5_000_000 }], params)).toBe(true);
    expect(qualifies([{ year: 2021, revenueSek: 4_999_999 }], params)).toBe(false);
  });

  it("båda åren över tröskeln kvalificerar via båda åren", () => {
    const financials = [
      { year: 2021, revenueSek: 6_000_000 },
      { year: 2022, revenueSek: 7_000_000 },
    ];
    expect(qualifyingYears(financials, params)).toEqual([2021, 2022]);
  });

  it("år utanför de konfigurerade åren räknas inte", () => {
    const financials = [
      { year: 2019, revenueSek: 50_000_000 },
      { year: 2024, revenueSek: 50_000_000 },
    ];
    expect(qualifies(financials, params)).toBe(false);
  });

  it("saknade år och null-omsättning kvalificerar inte", () => {
    expect(qualifies([], params)).toBe(false);
    expect(qualifies([{ year: 2021, revenueSek: null }], params)).toBe(false);
  });

  it("ändrade räkenskapsår ändrar utfallet (Inställningar → nästa synk)", () => {
    const fastGrower = [
      { year: 2021, revenueSek: 1_800_000 },
      { year: 2022, revenueSek: 2_600_000 },
      { year: 2023, revenueSek: 3_240_000 },
      { year: 2024, revenueSek: 8_110_000 },
    ];
    expect(qualifies(fastGrower, { revenueMinSek: 5_000_000, revenueYears: [2021, 2022] })).toBe(false);
    expect(qualifies(fastGrower, { revenueMinSek: 5_000_000, revenueYears: [2023, 2024] })).toBe(true);
  });

  it("ändrad tröskel ändrar utfallet", () => {
    const financials = [{ year: 2021, revenueSek: 7_000_000 }];
    expect(qualifies(financials, { revenueMinSek: 5_000_000, revenueYears: [2021] })).toBe(true);
    expect(qualifies(financials, { revenueMinSek: 10_000_000, revenueYears: [2021] })).toBe(false);
  });
});
