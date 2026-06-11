import type { SupabaseClient } from "@supabase/supabase-js";
import { getSecretWithEnvOverride } from "@/lib/secrets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  BolagsverketProvider,
  DEFAULT_SYNC_LIMIT,
  type OrgnrSource,
} from "./bolagsverket";
import { MockProvider } from "./mock";
import { TicProvider } from "./tic";
import { UcAllabolagProvider } from "./uc-allabolag";
import type { CompanyDataProvider } from "./types";

export type ProviderName = "tic" | "mock" | "uc-allabolag" | "bolagsverket";

function parseProviderName(raw: string): ProviderName | null {
  const name = raw.trim().toLowerCase();
  if (name === "tic" || name === "mock" || name === "uc-allabolag" || name === "bolagsverket") {
    return name;
  }
  return null;
}

/**
 * Datakälla för API-synken, i prioritetsordning:
 *   1. Miljövariabeln DATA_PROVIDER
 *   2. app_settings-nyckeln 'data_provider' ({"name": "..."}), så att
 *      källan kan aktiveras utan ny deploy
 *
 *   bolagsverket  Värdefulla datamängder – berikar BEFINTLIGA bolag med
 *                 myndighetsdata + bokslut ur digitala årsredovisningar
 *                 (API:et stödjer inte prospektering/sökning)
 *   tic           tic.io (stödjer SNI-prospektering)
 *   mock          deterministisk testdata – endast utveckling/test
 *   uc-allabolag  stub, kräver avtal med UC
 */
export function getConfiguredProviderName(): ProviderName | null {
  return parseProviderName(process.env.DATA_PROVIDER ?? "");
}

export async function getEffectiveProviderName(
  supabase: SupabaseClient,
): Promise<ProviderName | null> {
  const fromEnv = getConfiguredProviderName();
  if (fromEnv) return fromEnv;
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "data_provider")
    .maybeSingle();
  const name = (data?.value as { name?: unknown } | null)?.name;
  return typeof name === "string" ? parseProviderName(name) : null;
}

function bolagsverketSyncLimit(): number {
  const raw = Number(process.env.BOLAGSVERKET_SYNC_LIMIT ?? "");
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_SYNC_LIMIT;
}

/**
 * Orgnr-källa för Bolagsverkets berikningsläge: äldst synkade bolag
 * först. Sidparametern ignoreras medvetet – varje hämtning tar de
 * just nu äldsta raderna, och eftersom synken uppdaterar
 * last_synced_at vandrar fönstret framåt av sig självt.
 */
function databaseOrgnrSource(syncLimit: number): OrgnrSource {
  return async (page, pageSize) => {
    const admin = createSupabaseAdminClient();
    const { count, error: countError } = await admin
      .from("companies")
      .select("orgnr", { count: "exact", head: true });
    if (countError) throw new Error(countError.message);
    const total = Math.min(count ?? 0, syncLimit);

    const alreadyPlanned = (page - 1) * pageSize;
    const limit = Math.min(pageSize, Math.max(0, total - alreadyPlanned));
    if (limit === 0) return { orgnrs: [], total };

    const { data, error } = await admin
      .from("companies")
      .select("orgnr")
      .order("last_synced_at", { ascending: true, nullsFirst: true })
      .order("orgnr", { ascending: true })
      .range(0, limit - 1);
    if (error) throw new Error(error.message);
    return { orgnrs: (data ?? []).map((r) => r.orgnr), total };
  };
}

export async function createBolagsverketProvider(opts?: {
  withOrgnrSource?: boolean;
}): Promise<BolagsverketProvider> {
  const syncLimit = bolagsverketSyncLimit();
  const [clientId, clientSecret] = await Promise.all([
    getSecretWithEnvOverride("BOLAGSVERKET_CLIENT_ID", "bolagsverket_client_id"),
    getSecretWithEnvOverride("BOLAGSVERKET_CLIENT_SECRET", "bolagsverket_client_secret"),
  ]);
  return new BolagsverketProvider({
    clientId: clientId ?? "",
    clientSecret: clientSecret ?? "",
    baseUrl: process.env.BOLAGSVERKET_BASE_URL,
    tokenUrl: process.env.BOLAGSVERKET_TOKEN_URL,
    scope: process.env.BOLAGSVERKET_SCOPE,
    syncLimit,
    orgnrSource:
      opts?.withOrgnrSource === false ? undefined : databaseOrgnrSource(syncLimit),
  });
}

/** Provider enligt effektiv konfiguration (env → app_settings → valv). */
export async function resolveProvider(
  supabase: SupabaseClient,
): Promise<CompanyDataProvider | null> {
  const name = await getEffectiveProviderName(supabase);
  if (!name) return null;
  switch (name) {
    case "tic": {
      const apiKey = await getSecretWithEnvOverride("TIC_API_KEY", "tic_api_key");
      return new TicProvider({
        apiKey: apiKey ?? "",
        baseUrl: process.env.TIC_API_BASE_URL,
      });
    }
    case "mock":
      return new MockProvider();
    case "uc-allabolag":
      return new UcAllabolagProvider();
    case "bolagsverket":
      return createBolagsverketProvider();
  }
}

export function providerLabel(name: string | null): string {
  switch (name) {
    case "tic":
      return "tic.io LENS API";
    case "mock":
      return "MockProvider (testdata)";
    case "uc-allabolag":
      return "UC/Allabolag (ej aktiverad)";
    case "bolagsverket":
      return "Bolagsverket (Värdefulla datamängder)";
    case "csv":
      return "CSV-import";
    case "manuell":
      return "Manuellt tillagd";
    default:
      return "Ej konfigurerad";
  }
}
