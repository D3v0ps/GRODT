import type {
  CompanyDataProvider,
  CompanyDetails,
  CompanySearchResult,
  SearchCompaniesParams,
  YearFinancials,
} from "./types";
import { ProviderError } from "./types";

/**
 * UcAllabolagProvider – tom stub.
 *
 * Allabolags data säljs via UC och kräver kommersiellt avtal; det finns
 * inget självbetjänings-API. Den här klassen finns som påbyggnadspunkt
 * ifall avtal med UC/Allabolag tecknas senare.
 *
 * TODO när avtal finns:
 *  - Lägg till UC_API_KEY (och ev. UC_API_BASE_URL) i env + .env.example.
 *  - Implementera searchCompanies mot UC:s urvals-/prospekteringstjänst
 *    med SNI-kod och omsättningsintervall.
 *  - Implementera getCompany + getFinancials mot UC:s bolags- och
 *    bokslutsendpoints.
 *  - Kontrollera enheten i bokslutsdata (sannolikt tkr) och konvertera
 *    med tkrToSek() – belopp i GRODT är ALLTID SEK som heltal.
 *  - Lägg till mappningstester likt tic-mapping.test.ts.
 */
export class UcAllabolagProvider implements CompanyDataProvider {
  readonly name = "uc-allabolag";
  readonly label = "UC/Allabolag (ej aktiverad)";

  async searchCompanies(_params: SearchCompaniesParams): Promise<CompanySearchResult> {
    throw new ProviderError(
      "UC/Allabolag-providern är inte implementerad – kräver kommersiellt avtal med UC.",
      this.name,
    );
  }

  async getCompany(orgnr: string): Promise<CompanyDetails> {
    throw new ProviderError(
      "UC/Allabolag-providern är inte implementerad – kräver kommersiellt avtal med UC.",
      this.name,
      orgnr,
    );
  }

  async getFinancials(orgnr: string): Promise<YearFinancials[]> {
    throw new ProviderError(
      "UC/Allabolag-providern är inte implementerad – kräver kommersiellt avtal med UC.",
      this.name,
      orgnr,
    );
  }
}
