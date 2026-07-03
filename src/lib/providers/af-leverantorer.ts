import { normalizeOrgnr } from "@/lib/format";
import { ProviderError } from "./types";

/**
 * Arbetsförmedlingens leverantörsregister för valfrihetstjänster
 * (Rusta och matcha, tjänstekod A015). Publikt REST-API bakom AF:s
 * "Sök leverantör"-sida – ingen nyckel krävs.
 *
 *   GET {BASE}/v2/leverantorer?sida=N&tjanstekoder=A015  → enhetslista
 *   GET {BASE}/leverantorer/{id}?tjanstekod=A015         → detalj med
 *       orgnr, kontaktperson (namn/telefon/e-post), hemsida och betyg
 *
 * Varje leverantör här ÄR målgruppen (omställning/matchning), så
 * importen skapar leads oavsett omsättningsfilter och klassar bolagen
 * som 'omstallning'.
 */

const BASE_URL =
  "https://arbetsformedlingen.se/rest/rusta-och-matcha-2/sokleverantor";
export const AF_TJANSTEKOD = "A015"; // Rusta och matcha
const PAGE_SIZE = 20;
const MAX_PAGES = 80; // skyddsräcke mot oändlig paginering
/** Snäll takt mot AF – publikt API utan kvotavtal. */
const REQUEST_INTERVAL_MS = 120;
/**
 * Registret har ~800 enheter med varsin detalj. Tre parallella arbetare
 * med egen paus håller totalen under tidsbudgeten utan att hamra AF
 * (~7 anrop/s som mest).
 */
const DETAIL_CONCURRENCY = 3;

interface AfListItem {
  id?: number;
  namn?: string;
}

interface AfListResponse {
  total_count?: number | string;
  leverantorer?: AfListItem[];
}

interface AfAdress {
  adressrad?: string | null;
  postort?: string | null;
}

export interface AfDetaljJson {
  id?: number;
  namn?: string | null;
  orgnr?: string | null;
  kontaktperson_namn?: string | null;
  kontaktperson_telefon?: string | null;
  kontaktperson_epost?: string | null;
  hemsida?: string | null;
  rating?: string | null;
  adresser?: AfAdress[] | null;
}

export interface AfLeverantor {
  orgnr: string;
  namn: string;
  ort: string | null;
  adress: string | null;
  hemsida: string | null;
  telefon: string | null;
  epost: string | null;
  kontaktNamn: string | null;
  /** AF:s stjärnbetyg 1–5, när det finns. */
  rating: number | null;
}

/** "www.exempel.se" → "https://www.exempel.se" (länkarna i UI:t kräver protokoll). */
function normalizeHemsida(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function cleanText(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed;
}

/** Detaljsvar → våra fält. Returnerar null när orgnr eller namn saknas. */
export function mapAfLeverantor(json: AfDetaljJson): AfLeverantor | null {
  const orgnr = normalizeOrgnr(json.orgnr ?? "");
  const namn = cleanText(json.namn);
  if (!orgnr || !namn) return null;
  const adress = json.adresser?.[0];
  const rating = Number.parseInt(json.rating ?? "", 10);
  return {
    orgnr,
    namn,
    ort: cleanText(adress?.postort),
    adress: cleanText(adress?.adressrad),
    hemsida: normalizeHemsida(json.hemsida),
    telefon: cleanText(json.kontaktperson_telefon),
    epost: cleanText(json.kontaktperson_epost),
    kontaktNamn: cleanText(json.kontaktperson_namn),
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
  };
}

export interface AfFetchResult {
  leverantorer: AfLeverantor[];
  /** Antal enheter (adresser) i registret – flera per leverantör. */
  enheter: number;
  fel: { orgnr: string | null; message: string }[];
  /** Sant om tidsbudgeten nåddes innan alla detaljer hämtats. */
  stoppedEarly: boolean;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        accept: "application/json",
        "af-trackingid": crypto.randomUUID(),
        "calling-system": "rusta-och-matcha-2",
        "user-agent": "Mozilla/5.0 (compatible; GRODT-leadradar)",
      },
      cache: "no-store",
    });
  } catch (e) {
    throw new ProviderError(
      `Kunde inte nå Arbetsförmedlingen: ${e instanceof Error ? e.message : e}`,
      "arbetsformedlingen",
    );
  }
  if (!res.ok) {
    throw new ProviderError(
      `Arbetsförmedlingen svarade ${res.status}`,
      "arbetsformedlingen",
    );
  }
  return (await res.json()) as T;
}

/**
 * Hämtar hela leverantörsregistret för en tjänstekod: bläddrar igenom
 * enhetslistan, dedupar på leverantörs-id och hämtar detaljer (orgnr,
 * kontaktperson, hemsida, betyg) per leverantör. Fel på enskilda
 * leverantörer samlas utan att stoppa körningen.
 */
export async function fetchAfLeverantorer(options: {
  tjanstekod?: string;
  deadlineMs?: number;
} = {}): Promise<AfFetchResult> {
  const tjanstekod = options.tjanstekod ?? AF_TJANSTEKOD;
  const pastDeadline = () =>
    options.deadlineMs !== undefined && Date.now() >= options.deadlineMs;

  // 1) Enhetslistan → unika leverantörs-id.
  const ids = new Set<number>();
  let enheter = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await getJson<AfListResponse>(
      `${BASE_URL}/v2/leverantorer?sida=${page}&tjanstekoder=${encodeURIComponent(tjanstekod)}&sortBy=RATING_DISTANCE`,
    );
    enheter = Number(data.total_count ?? 0);
    const items = data.leverantorer ?? [];
    if (items.length === 0) break;
    for (const item of items) {
      if (typeof item.id === "number") ids.add(item.id);
    }
    if (page * PAGE_SIZE >= enheter) break;
    if (pastDeadline()) break;
    await sleep(REQUEST_INTERVAL_MS);
  }

  // 2) Detaljer per leverantör – liten arbetarpool, varje arbetare pausar
  //    mellan sina anrop. Deadline stoppar snyggt; körningen är idempotent
  //    så resten tas vid nästa knapptryck.
  const queue = [...ids].sort((a, b) => a - b);
  const leverantorer: AfLeverantor[] = [];
  const fel: AfFetchResult["fel"] = [];
  let stoppedEarly = false;
  let next = 0;

  const worker = async () => {
    for (;;) {
      if (pastDeadline()) {
        stoppedEarly = true;
        return;
      }
      const index = next++;
      if (index >= queue.length) return;
      const id = queue[index];
      try {
        const detalj = await getJson<AfDetaljJson>(
          `${BASE_URL}/leverantorer/${id}?tjanstekod=${encodeURIComponent(tjanstekod)}`,
        );
        const mapped = mapAfLeverantor(detalj);
        if (mapped) leverantorer.push(mapped);
        else fel.push({ orgnr: null, message: `Leverantör ${id} saknar orgnr/namn` });
      } catch (e) {
        fel.push({
          orgnr: null,
          message: `Leverantör ${id}: ${e instanceof Error ? e.message : e}`,
        });
      }
      await sleep(REQUEST_INTERVAL_MS);
    }
  };
  await Promise.all(
    Array.from({ length: DETAIL_CONCURRENCY }, () => worker()),
  );

  return { leverantorer, enheter, fel, stoppedEarly };
}
