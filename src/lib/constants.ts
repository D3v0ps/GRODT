export const LEAD_STATUSES = [
  { key: "ny", label: "Ny" },
  { key: "kontaktad", label: "Kontaktad" },
  { key: "dialog", label: "Dialog" },
  { key: "mote", label: "Möte" },
  { key: "kund", label: "Kund" },
  { key: "forlorad", label: "Förlorad" },
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number]["key"];

export const LEAD_STATUS_KEYS = LEAD_STATUSES.map((s) => s.key) as [
  LeadStatus,
  ...LeadStatus[],
];

export function statusLabel(key: string): string {
  return LEAD_STATUSES.find((s) => s.key === key)?.label ?? key;
}

/**
 * Kundens leveranskedja efter vunnen affär: överlämning → sållningar →
 * procentmilstolpar → klar leverans → fakturering → betalt. Ordningen
 * i listan ÄR processordningen (steppern på kundkortet bygger på den).
 */
export const KUND_STATUSES = [
  { key: "overlamnad", label: "Överlämnad" },
  { key: "sallning1", label: "Första sållningen" },
  { key: "sallning2", label: "Andra sållningen" },
  { key: "klar50", label: "50 % klar" },
  { key: "klar75", label: "75 % klar" },
  { key: "klar", label: "Leverans klar" },
  { key: "fakturerad", label: "Faktura skickad" },
  { key: "betald", label: "Faktura betald" },
] as const;

export type KundStatus = (typeof KUND_STATUSES)[number]["key"];

export const KUND_STATUS_KEYS = KUND_STATUSES.map((s) => s.key) as [
  KundStatus,
  ...KundStatus[],
];

export function kundStatusLabel(key: string): string {
  // Utgången status från tiden före leveranskedjan – äldre loggrader
  // ska fortfarande visas läsbart.
  if (key === "pagaende") return "Pågående";
  return KUND_STATUSES.find((s) => s.key === key)?.label ?? key;
}

export const ROLES = [
  { key: "saljare", label: "Säljare" },
  { key: "controller", label: "Controller" },
  { key: "admin", label: "Admin" },
] as const;

export type Roll = (typeof ROLES)[number]["key"];

export function rollLabel(roll: string): string {
  return ROLES.find((r) => r.key === roll)?.label ?? "Säljare";
}

/**
 * Sammanvägd branschklass (AI-omdöme eller manuellt) – används i listan
 * och på bolagskortet för att säljaren direkt ska se vad bolaget gör.
 */
export const BRANSCH_KLASS_LABELS: Record<string, string> = {
  arbetsformedling: "Arbetsförmedling & rekrytering",
  omstallning: "Omställning & matchning",
  personaluthyrning: "Personaluthyrning / bemanning",
  annat: "Annan bransch",
};

export function branschKlassLabel(klass: string | null | undefined): string | null {
  if (!klass) return null;
  return BRANSCH_KLASS_LABELS[klass] ?? null;
}

/**
 * Målgruppen = bolag ni säljer på: arbetsförmedling/rekrytering och
 * omställning/matchning. Dessa får lågan i UI:t och skyddas från
 * SNI-baserad utflyttning.
 */
export function isMalgrupp(klass: string | null | undefined): boolean {
  return klass === "arbetsformedling" || klass === "omstallning";
}

export const SNI_LABELS: Record<string, string> = {
  "78.100": "Arbetsförmedling och rekrytering",
  "78.200": "Personaluthyrning",
  "78.300": "Övrigt tillhandahållande av personalfunktioner",
};

export function sniLabel(code: string | null): string {
  if (!code) return "Okänd bransch";
  const label = SNI_LABELS[code];
  return label ? `${code} – ${label}` : code;
}

/** Normaliserar SNI-koder till kanonisk form med punkt: "78100" → "78.100". */
export function formatSniCode(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return trimmed;
}
