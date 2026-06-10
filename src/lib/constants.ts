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
