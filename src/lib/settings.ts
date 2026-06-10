import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Appinställningar i app_settings (key → jsonb).
 * Filterparametrarna styr nästa synk/import – ändringar påverkar inte
 * befintliga bolag eller leads retroaktivt.
 */

export interface SyncFilterSettings {
  sniCodes: string[];
  revenueMinSek: number;
  revenueYears: number[];
}

export const DEFAULT_SYNC_FILTER: SyncFilterSettings = {
  sniCodes: ["78.100"],
  revenueMinSek: 5_000_000,
  revenueYears: [2021, 2022],
};

const syncFilterSchema = z.object({
  sni_codes: z.array(z.string().min(1)).min(1),
  revenue_min_sek: z.number().int().positive(),
  revenue_years: z.array(z.number().int().min(1900).max(2100)).min(1),
});

export async function getSyncFilter(
  supabase: SupabaseClient,
): Promise<SyncFilterSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "sync_filter")
    .maybeSingle();

  const parsed = syncFilterSchema.safeParse(data?.value);
  if (!parsed.success) return { ...DEFAULT_SYNC_FILTER };
  return {
    sniCodes: parsed.data.sni_codes,
    revenueMinSek: parsed.data.revenue_min_sek,
    revenueYears: [...parsed.data.revenue_years].sort((a, b) => a - b),
  };
}

/** De två åren som visas som kolumner i bolagslistan. */
export function displayYears(settings: SyncFilterSettings): [number, number] {
  const years = [...settings.revenueYears].sort((a, b) => a - b);
  if (years.length === 0) return [2021, 2022];
  if (years.length === 1) return [years[0], years[0]];
  return [years[years.length - 2], years[years.length - 1]];
}

export async function getAutoSyncEnabled(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "auto_sync")
    .maybeSingle();
  const parsed = z.object({ enabled: z.boolean() }).safeParse(data?.value);
  return parsed.success ? parsed.data.enabled : true;
}
