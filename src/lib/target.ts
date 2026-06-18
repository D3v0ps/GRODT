/**
 * Målbildsfiltret: avgör om ett bolag ligger inom säljbar målgrupp
 * (arbetsförmedling/rekrytering, SNI 78.100) eller utanför (t.ex.
 * personaluthyrning 78.200).
 *
 * Bygger på den STRUKTURERADE SNI-koden, inte fritextbeskrivningen –
 * beskrivningen är för otillförlitlig för att filtrera på. Exempel ur
 * Bolagsverkets data: "Nordisk Bemanning AB" har SNI 78.100
 * (arbetsförmedling) men beskriver sig som "rekrytering och uthyrning av
 * personal" – ordet "arbetsförmedling" finns inte ens i texten. Ett
 * textfilter hade kastat bort ett korrekt klassat målbolag.
 */

export type TargetState = "target" | "off" | "unknown";

/** Endast siffrorna ur en SNI-kod ("78.100" → "78100"). */
function sniDigits(code: string | null | undefined): string {
  return (code ?? "").replace(/\D/g, "");
}

/**
 * Klassar ett bolags SNI mot målbildens koder:
 *  - "unknown": SNI saknas (bolaget är inte berikat ännu) → göm aldrig,
 *    vi vet helt enkelt inte vad det är.
 *  - "target":  matchar någon av målkoderna.
 *  - "off":     en känd kod som inte matchar → utanför målbilden.
 */
export function sniTargetState(
  sniKod: string | null | undefined,
  targetCodes: string[],
): TargetState {
  const digits = sniDigits(sniKod);
  if (digits === "") return "unknown";
  const targets = targetCodes.map(sniDigits).filter((c) => c !== "");
  if (targets.length === 0) return "unknown";
  return targets.includes(digits) ? "target" : "off";
}

/** True endast när SNI är KÄNT och utanför målbilden. */
export function isOffTarget(
  sniKod: string | null | undefined,
  targetCodes: string[],
): boolean {
  return sniTargetState(sniKod, targetCodes) === "off";
}

/**
 * Heuristik: ser bolaget ut att vara personaluthyrning/bemanning snarare
 * än ren arbetsförmedling? Detta är en ren VARNING – den flaggar aldrig
 * bort något själv, utan hjälper teamet att ögna gränsfall (t.ex. ett
 * bemanningsbolag som råkat registrera sig som SNI 78.100). Matchar på
 * namn och, om tillgänglig, verksamhetsbeskrivningen.
 */
const STAFFING_HINTS = [
  "bemanning",
  "personaluthyrning",
  "uthyrning av personal",
  "personaluthyr",
  "uthyrning av arbetskraft",
  "staffing",
  "vikarie",
  "vikariat",
  "interimskonsult",
  "resurskonsult",
];

export function likelyStaffing(
  namn: string | null | undefined,
  beskrivning?: string | null,
): boolean {
  const haystack = `${namn ?? ""} ${beskrivning ?? ""}`.toLowerCase();
  return STAFFING_HINTS.some((hint) => haystack.includes(hint));
}
