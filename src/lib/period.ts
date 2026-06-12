import { todayStockholm } from "./format";

/**
 * Statistikperioder i svensk kalendertid (Europe/Stockholm): veckan
 * börjar på måndag, månaden den 1:a, året 1 januari – alltid vid
 * svensk midnatt, oavsett sommar-/vintertid.
 */

export const PERIODS = [
  { key: "vecka", label: "Denna vecka" },
  { key: "manad", label: "Denna månad" },
  { key: "ar", label: "I år" },
  { key: "allt", label: "Hela tiden" },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];

export function parsePeriod(raw: string | string[] | undefined): PeriodKey {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return PERIODS.some((p) => p.key === value) ? (value as PeriodKey) : "manad";
}

export function periodLabel(key: PeriodKey): string {
  return PERIODS.find((p) => p.key === key)?.label ?? key;
}

/** UTC-offset (±HH:MM) för svensk tid det aktuella dygnet – hanterar sommartid. */
export function stockholmOffset(date: string): string {
  const probe = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(probe.getTime())) return "+01:00";
  const part = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    timeZoneName: "longOffset",
  })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value;
  const match = part?.match(/GMT([+-]\d{2}:\d{2})/);
  return match ? match[1] : "+01:00";
}

/** Förskjuter ett YYYY-MM-DD med ett antal dagar (ren kalenderaritmetik). */
export function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Svensk midnatt för ett datum, som UTC-tidpunkt. */
export function stockholmMidnight(date: string): Date {
  return new Date(`${date}T00:00:00${stockholmOffset(date)}`);
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Veckodag i svensk tid, måndag = 0 … söndag = 6. */
function stockholmWeekdayIndex(now: Date): number {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Stockholm",
    weekday: "short",
  }).format(now);
  const index = WEEKDAYS.indexOf(short);
  return index === -1 ? 0 : index;
}

export interface PeriodRange {
  /** Inklusiv start. */
  from: Date;
  /** Exklusivt slut (nu). */
  to: Date;
}

export function periodRange(period: PeriodKey, now: Date = new Date()): PeriodRange {
  const today = todayStockholm(now);
  switch (period) {
    case "vecka":
      return {
        from: stockholmMidnight(addDays(today, -stockholmWeekdayIndex(now))),
        to: now,
      };
    case "manad":
      return { from: stockholmMidnight(`${today.slice(0, 7)}-01`), to: now };
    case "ar":
      return { from: stockholmMidnight(`${today.slice(0, 4)}-01-01`), to: now };
    case "allt":
      return { from: new Date(0), to: now };
  }
}
