import { z } from "zod";
import { KUND_STATUS_KEYS } from "@/lib/constants";

/** Frågeparametrar för kundlistan – delas av sidan och ev. export. */

export const KUNDER_PAGE_SIZE = 25;

export const KUND_SORT_KEYS = ["namn", "intjanat", "overlamnad"] as const;
export type KundSortKey = (typeof KUND_SORT_KEYS)[number];

const kundParamsSchema = z.object({
  sok: z.string().trim().max(120).optional().default(""),
  status: z.enum(KUND_STATUS_KEYS).optional(),
  controller: z.uuid().optional(),
  sort: z.enum(KUND_SORT_KEYS).optional().default("namn"),
  dir: z.enum(["asc", "desc"]).optional().default("asc"),
  sida: z.coerce.number().int().min(1).optional().default(1),
});

export type KundListParams = z.infer<typeof kundParamsSchema>;

type RawSearchParams = Record<string, string | string[] | undefined>;

export function parseKundParams(raw: RawSearchParams): KundListParams {
  const single: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined && v !== "") single[key] = v;
  }
  const parsed = kundParamsSchema.safeParse(single);
  if (parsed.success) return parsed.data;
  // En ogiltig parameter ska inte nollställa övriga filter.
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string") delete single[key];
  }
  const retry = kundParamsSchema.safeParse(single);
  return retry.success ? retry.data : kundParamsSchema.parse({});
}

export function kundParamsToQuery(params: Partial<KundListParams>): URLSearchParams {
  const q = new URLSearchParams();
  if (params.sok) q.set("sok", params.sok);
  if (params.status) q.set("status", params.status);
  if (params.controller) q.set("controller", params.controller);
  if (params.sort && params.sort !== "namn") q.set("sort", params.sort);
  if (params.dir && params.dir !== "asc") q.set("dir", params.dir);
  if (params.sida && params.sida > 1) q.set("sida", String(params.sida));
  return q;
}

export interface CustomerListRow {
  customer_id: string;
  orgnr: string;
  namn: string;
  ort: string | null;
  status: string;
  saljare_id: string | null;
  saljare_namn: string | null;
  controller_id: string | null;
  controller_namn: string | null;
  intjanat: number;
  overlamnad_at: string;
  updated_at: string;
  total_count: number;
}
