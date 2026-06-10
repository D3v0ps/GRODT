import { MockProvider } from "./mock";
import { TicProvider } from "./tic";
import { UcAllabolagProvider } from "./uc-allabolag";
import type { CompanyDataProvider } from "./types";

export type ProviderName = "tic" | "mock" | "uc-allabolag";

/**
 * DATA_PROVIDER styr vilken källa API-synken använder:
 *   tic           tic.io (kräver TIC_API_KEY)
 *   mock          deterministisk testdata – endast för utveckling/test
 *   uc-allabolag  stub, kräver avtal med UC
 *   (tom)         ingen API-synk konfigurerad – data importeras via CSV
 */
export function getConfiguredProviderName(): ProviderName | null {
  const raw = (process.env.DATA_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "tic" || raw === "mock" || raw === "uc-allabolag") return raw;
  return null;
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
    case "csv":
      return "CSV-import";
    default:
      return "Ej konfigurerad";
  }
}
