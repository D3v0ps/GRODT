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

/**
 * DATA_PROVIDER styr vilken källa API-synken använder:
 *   bolagsverket  Värdefulla datamängder – berikar BEFINTLIGA bolag med
 *                 myndighetsdata + bokslut ur digitala årsredovisningar
 *                 (API:et stödjer inte prospektering/sökning)
 *   tic           tic.io (kräver TIC_API_KEY) – stödjer SNI-prospektering
 *   mock          deterministisk testdata – endast för utveckling/test
 *   uc-allabolag  stub, kräver avtal med UC
 *   (tom)         ingen API-synk konfigurerad – data importeras via CSV
 */
export function getConfiguredProviderName(): ProviderName | null {
  const raw = (process.env.DATA_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "tic" || raw === "mock" || raw === "uc-allabolag" || raw === "bolagsverket") {
    return raw;
  }
  return null;
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

export function createBolagsverketProvider(opts?: {
  withOrgnrSource?: boolean;
}): BolagsverketProvider {
  const syncLimit = bolagsverketSyncLimit();
  return new BolagsverketProvider({
    clientId: process.env.BOLAGSVERKET_CLIENT_ID ?? "",
    clientSecret: process.env.BOLAGSVERKET_CLIENT_SECRET ?? "",
    baseUrl: process.env.BOLAGSVERKET_BASE_URL,
    tokenUrl: process.env.BOLAGSVERKET_TOKEN_URL,
    syncLimit,
    orgnrSource:
      opts?.withOrgnrSource === false ? undefined : databaseOrgnrSource(syncLimit),
  });
}

export function createProvider(name: ProviderName): CompanyDataProvider {
  switch (name) {
    case "tic":
      return new TicProvider({
        apiKey: process.env.TIC_API_KEY ?? "",
        baseUrl: process.env.TIC_API_BASE_URL,
      });
    case "mock":
      return new MockProvider();
    case "uc-allabolag":
      return new UcAllabolagProvider();
    case "bolagsverket":
      return createBolagsverketProvider();
  }
}

/** Provider enligt DATA_PROVIDER, eller null om ingen är konfigurerad. */
export function getConfiguredProvider(): CompanyDataProvider | null {
  const name = getConfiguredProviderName();
  return name ? createProvider(name) : null;
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
