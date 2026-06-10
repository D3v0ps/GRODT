import { describe, expect, it } from "vitest";
import { sekToTkr, tkrToSek } from "./units";

describe("enhetskonvertering tkr → kr", () => {
  it("konverterar tkr till SEK-heltal", () => {
    expect(tkrToSek(5000)).toBe(5_000_000);
    expect(tkrToSek(4900)).toBe(4_900_000);
    expect(tkrToSek(0)).toBe(0);
    expect(tkrToSek(1)).toBe(1000);
  });

  it("avrundar decimala tkr-värden till heltal kr", () => {
    expect(tkrToSek(4999.6)).toBe(4_999_600);
    expect(tkrToSek(123.456)).toBe(123_456);
  });

  it("hanterar negativa belopp (förlustår)", () => {
    expect(tkrToSek(-250)).toBe(-250_000);
  });

  it("bevarar null/undefined/ogiltiga som null", () => {
    expect(tkrToSek(null)).toBeNull();
    expect(tkrToSek(undefined)).toBeNull();
    expect(tkrToSek(Number.NaN)).toBeNull();
    expect(tkrToSek(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("sekToTkr är inversen för förfilter", () => {
    expect(sekToTkr(5_000_000)).toBe(5000);
    expect(sekToTkr(2_500_500)).toBe(2501);
  });
});
