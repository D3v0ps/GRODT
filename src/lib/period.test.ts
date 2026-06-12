import { describe, expect, it } from "vitest";
import { addDays, parsePeriod, periodRange, stockholmMidnight } from "./period";

describe("parsePeriod", () => {
  it("ger manad som default och vid skräp", () => {
    expect(parsePeriod(undefined)).toBe("manad");
    expect(parsePeriod("")).toBe("manad");
    expect(parsePeriod("kvartal")).toBe("manad");
  });

  it("accepterar giltiga nycklar, även som array", () => {
    expect(parsePeriod("vecka")).toBe("vecka");
    expect(parsePeriod(["ar", "vecka"])).toBe("ar");
    expect(parsePeriod("allt")).toBe("allt");
  });
});

describe("stockholmMidnight", () => {
  it("är 23:00 UTC föregående dag på vintern", () => {
    expect(stockholmMidnight("2026-01-15").toISOString()).toBe(
      "2026-01-14T23:00:00.000Z",
    );
  });

  it("är 22:00 UTC föregående dag på sommaren", () => {
    expect(stockholmMidnight("2026-06-15").toISOString()).toBe(
      "2026-06-14T22:00:00.000Z",
    );
  });
});

describe("addDays", () => {
  it("kliver över månads- och årsgränser", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("periodRange", () => {
  // Onsdag 10 juni 2026, 14:30 svensk sommartid.
  const sommar = new Date("2026-06-10T12:30:00Z");

  it("vecka börjar måndag 00:00 svensk tid", () => {
    const { from, to } = periodRange("vecka", sommar);
    // Måndag 8 juni 00:00+02:00.
    expect(from.toISOString()).toBe("2026-06-07T22:00:00.000Z");
    expect(to).toBe(sommar);
  });

  it("manad börjar den 1:a 00:00 svensk tid", () => {
    const { from } = periodRange("manad", sommar);
    expect(from.toISOString()).toBe("2026-05-31T22:00:00.000Z");
  });

  it("ar börjar 1 januari 00:00 svensk vintertid", () => {
    const { from } = periodRange("ar", sommar);
    expect(from.toISOString()).toBe("2025-12-31T23:00:00.000Z");
  });

  it("allt börjar vid epoken", () => {
    const { from } = periodRange("allt", sommar);
    expect(from.getTime()).toBe(0);
  });

  it("vecka på en söndag räknar tillbaka till måndagen", () => {
    // Söndag 29 mars 2026 (sommartidsomställningen) kl. 17 svensk tid.
    const sondag = new Date("2026-03-29T15:00:00Z");
    const { from } = periodRange("vecka", sondag);
    // Måndag 23 mars 00:00+01:00 (vintertid före omställningen).
    expect(from.toISOString()).toBe("2026-03-22T23:00:00.000Z");
  });

  it("vecka i januari kan börja föregående år", () => {
    // Fredag 1 januari 2027 kl. 09 svensk tid.
    const nyar = new Date("2027-01-01T08:00:00Z");
    const { from } = periodRange("vecka", nyar);
    // Måndag 28 december 2026 00:00+01:00.
    expect(from.toISOString()).toBe("2026-12-27T23:00:00.000Z");
  });

  it("manad vid midnatt strax efter månadsskiftet hör till nya månaden", () => {
    // 1 juni 00:30 svensk tid = 31 maj 22:30 UTC.
    const skifte = new Date("2026-05-31T22:30:00Z");
    const { from } = periodRange("manad", skifte);
    expect(from.toISOString()).toBe("2026-05-31T22:00:00.000Z");
  });
});
