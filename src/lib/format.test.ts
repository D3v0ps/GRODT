import { describe, expect, it } from "vitest";
import {
  NBSP,
  avatarClass,
  daysSince,
  fmtDate,
  fmtDateTime,
  fmtKr,
  fmtMkr,
  fmtNumber,
  initials,
  normalizeOrgnr,
  parseSekInput,
} from "./format";

describe("svenska format", () => {
  it("belopp med hårt mellanslag: 5 000 000 kr", () => {
    expect(fmtKr(5_000_000)).toBe(`5${NBSP}000${NBSP}000${NBSP}kr`);
    expect(fmtNumber(1247)).toBe(`1${NBSP}247`);
    expect(fmtNumber(38)).toBe("38");
  });

  it("mkr med decimalkomma: 8,1 mkr", () => {
    expect(fmtMkr(8_110_000)).toBe(`8,1${NBSP}mkr`);
    expect(fmtMkr(5_000_000)).toBe(`5,0${NBSP}mkr`);
    expect(fmtMkr(31_400_000)).toBe(`31,4${NBSP}mkr`);
  });

  it("datum YYYY-MM-DD i svensk tid", () => {
    expect(fmtDate("2026-06-10T06:15:00Z")).toBe("2026-06-10");
    // 23:30 UTC på vintern är nästa dag i Stockholm
    expect(fmtDate("2026-01-15T23:30:00Z")).toBe("2026-01-16");
    expect(fmtDateTime("2026-06-10T06:15:00Z")).toBe("2026-06-10 08:15");
  });

  it("daysSince räknar hela dagar", () => {
    const now = new Date("2026-06-10T12:00:00Z");
    expect(daysSince("2026-06-06T10:00:00Z", now)).toBe(4);
    expect(daysSince("2026-06-10T11:00:00Z", now)).toBe(0);
  });

  it("parseSekInput tål mellanslag och kr-suffix", () => {
    expect(parseSekInput("5 000 000")).toBe(5_000_000);
    expect(parseSekInput("5000000")).toBe(5_000_000);
    expect(parseSekInput("5 000 000 kr")).toBe(5_000_000);
    expect(parseSekInput("abc")).toBeNull();
  });

  it("initialer och avatarklass", () => {
    expect(initials("Anna Lindqvist")).toBe("AL");
    expect(initials("Johan Berg")).toBe("JB");
    expect(initials("Cher")).toBe("CH");
    const cls = avatarClass("some-uuid");
    expect(["", "a2", "a3", "a4"]).toContain(cls);
    expect(avatarClass("some-uuid")).toBe(cls); // stabil
  });

  it("normaliserar orgnr", () => {
    expect(normalizeOrgnr("5567124830")).toBe("556712-4830");
    expect(normalizeOrgnr("556712-4830")).toBe("556712-4830");
    expect(normalizeOrgnr("165567124830")).toBe("556712-4830");
    expect(normalizeOrgnr("123")).toBeNull();
  });
});
