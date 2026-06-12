import { z } from "zod";
import { LEAD_STATUS_KEYS } from "@/lib/constants";

/**
 * Frågeparametrar för bolagslistan. Delas av sidan och CSV-exporten så
 * att exporten alltid respekterar exakt de aktiva filtren.
 */

export const PAGE_SIZE = 25;

export const SORT_KEYS = [
  "namn",
  "ort",
  "oms1",
  "oms2",
  "oms3",
  "oms4",
  "anst",
  "tillvaxt",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

const listParamsSchema = z.object({
  sok: z.string().trim().max(120).optional().default(""),
  status: z.enum(LEAD_STATUS_KEYS).optional(),
  ort: z.string().trim().max(80).optional(),
  ansvarig: z.uuid().optional(),
  /** Lägsta omsättning i mkr (5/10/20 i UI:t). */
  oms: z.coerce.number().int().min(1).max(100000).optional(),
  /** Lägsta omsättningstillväxt i procent mellan de två visade åren. */
  vaxt: z.coerce.number().min(-100).max(10000).optional(),
  sort: z.enum(SORT_KEYS).optional().default("namn"),
  dir: z.enum(["asc", "desc"]).optional().default("asc"),
  sida: z.coerce.number().int().min(1).optional().default(1),
});

export type ListParams = z.infer<typeof listParamsSchema>;

type RawSearchParams = Record<string, string | string[] | undefined>;

export function parseListParams(raw: RawSearchParams): ListParams {
  const single: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined && v !== "") single[key] = v;
  }
  const parsed = listParamsSchema.safeParse(single);
  if (parsed.success) return parsed.data;
  return listParamsSchema.parse({});
}

/** Bygger en querystring av parametrarna (utelämnar defaultvärden). */
export function listParamsToQuery(
  params: Partial<ListParams>,
): URLSearchParams {
  const q = new URLSearchParams();
  if (params.sok) q.set("sok", params.sok);
  if (params.status) q.set("status", params.status);
  if (params.ort) q.set("ort", params.ort);
  if (params.ansvarig) q.set("ansvarig", params.ansvarig);
  if (params.oms) q.set("oms", String(params.oms));
  if (params.vaxt !== undefined) q.set("vaxt", String(params.vaxt));
  if (params.sort && params.sort !== "namn") q.set("sort", params.sort);
  if (params.dir && params.dir !== "asc") q.set("dir", params.dir);
  if (params.sida && params.sida > 1) q.set("sida", String(params.sida));
  return q;
}

export interface LeadListRow {
  lead_id: string;
  orgnr: string;
  namn: string;
  ort: string | null;
  sni_kod: string | null;
  antal_anstallda: number | null;
  status: string;
  owner_id: string | null;
  owner_namn: string | null;
  oms1: number | null;
  oms2: number | null;
  oms3: number | null;
  oms4: number | null;
  /** Anställda för de två senaste åren (tillväxtparet). */
  anst1: number | null;
  anst2: number | null;
  oms_tillvaxt_pct: number | null;
  avregistrerad: boolean;
  reklamsparr: boolean;
  updated_at: string;
  total_count: number;
}

/** Argument till list_leads-RPC:n utifrån parsade parametrar. */
export function rpcArgs(
  params: ListParams,
  years: [number, number, number, number],
  limit: number,
  offset: number,
) {
  return {
    p_search: params.sok || null,
    p_status: params.status ?? null,
    p_ort: params.ort ?? null,
    p_owner: params.ansvarig ?? null,
    p_rev_min: params.oms ? params.oms * 1_000_000 : null,
    p_rev_max: null,
    p_year1: years[0],
    p_year2: years[1],
    p_year3: years[2],
    p_year4: years[3],
    p_tillvaxt_min: params.vaxt ?? null,
    p_sort: params.sort,
    p_dir: params.dir,
    p_limit: limit,
    p_offset: offset,
  };
}
