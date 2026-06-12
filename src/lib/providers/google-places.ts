import { getSecretWithEnvOverride } from "@/lib/secrets";

/**
 * Google Places (New, v1) – Text Search för att fylla telefon/hemsida
 * där de saknas. Viktigt att veta om datat:
 *
 *  - Numret är bolagets PUBLIKA företagsprofil, oftast en VÄXEL – det
 *    märks därför alltid med kalla='google' och visas så i UI:t.
 *  - Google fyller endast tomma fält; CSV-/manuell data rörs aldrig.
 *  - Fel bolag får aldrig sparas: träffen måste klara en
 *    namnlikhetsvakt (namesRoughlyMatch), annars hoppas bolaget över.
 *
 * API: POST https://places.googleapis.com/v1/places:searchText med
 * X-Goog-Api-Key + X-Goog-FieldMask. Nyckel via miljövariabeln
 * GOOGLE_PLACES_API_KEY eller valvet (google_places_api_key).
 */

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK =
  "places.displayName,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.formattedAddress";

export interface PlaceContact {
  matchedName: string;
  telefon: string | null;
  hemsida: string | null;
}

interface PlacesResponse {
  places?: {
    displayName?: { text?: string };
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    websiteUri?: string;
    formattedAddress?: string;
  }[];
}

/** Normaliserar bolagsnamn för jämförelse: gemener, utan bolagsform/skiljetecken. */
function normalizeName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\b(aktiebolag|ab|handelsbolag|hb|kommanditbolag|kb|filial)\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((token) => token.length > 1);
}

/**
 * Vakt mot felmatchning: alla betydande ord i det kortare namnet måste
 * återfinnas i det längre (ordningsoberoende). "AB Effektiv Göteborg" ↔
 * "Effektiv Göteborg" matchar; "A Hub AB" ↔ "Hubbster Group" gör det inte.
 */
export function namesRoughlyMatch(a: string, b: string): boolean {
  const tokensA = normalizeName(a);
  const tokensB = normalizeName(b);
  if (tokensA.length === 0 || tokensB.length === 0) return false;
  const [shorter, longer] =
    tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const longerSet = new Set(longer);
  const hits = shorter.filter((token) => longerSet.has(token)).length;
  return hits === shorter.length || (shorter.length >= 3 && hits >= shorter.length - 1);
}

/** Väljer bästa kandidaten ur svaret – eller null när ingen klarar vakten. */
export function pickPlaceMatch(
  response: PlacesResponse,
  companyName: string,
): PlaceContact | null {
  for (const place of response.places ?? []) {
    const matchedName = place.displayName?.text?.trim();
    if (!matchedName || !namesRoughlyMatch(companyName, matchedName)) continue;
    const telefon =
      place.nationalPhoneNumber?.trim() || place.internationalPhoneNumber?.trim() || null;
    const hemsida = place.websiteUri?.trim() || null;
    if (!telefon && !hemsida) continue;
    return { matchedName, telefon, hemsida };
  }
  return null;
}

export async function getGooglePlacesApiKey(): Promise<string | null> {
  return getSecretWithEnvOverride("GOOGLE_PLACES_API_KEY", "google_places_api_key");
}

/** Söker upp bolagets publika kontaktuppgifter. null = ingen säker träff. */
export async function searchPlaceContact(
  apiKey: string,
  companyName: string,
  ort: string | null,
): Promise<PlaceContact | null> {
  const textQuery = ort ? `${companyName} ${ort}` : companyName;
  let res: Response;
  try {
    res = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        "x-goog-fieldmask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery,
        regionCode: "SE",
        languageCode: "sv",
        pageSize: 3,
      }),
      cache: "no-store",
    });
  } catch (e) {
    throw new Error(
      `Kunde inte nå Google Places: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (res.status === 429) {
    throw new Error("Google Places-kvoten är nådd – försök igen senare.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Google Places svarade ${res.status}${body ? ` – ${body.slice(0, 160)}` : ""}`,
    );
  }
  const data = (await res.json()) as PlacesResponse;
  return pickPlaceMatch(data, companyName);
}
