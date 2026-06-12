import { qualifies } from "@/lib/qualification";
import type {
  CompanyDataProvider,
  CompanyDetails,
  YearFinancials,
} from "@/lib/providers/types";
import type { SyncStore } from "./store";

export interface SyncSettings {
  sniCodes: string[];
  revenueMinSek: number;
  revenueYears: number[];
}

export interface SyncError {
  orgnr: string | null;
  message: string;
}

export interface SyncResult {
  fetched: number;
  created: number; // nya bolag (nya orgnr)
  updated: number; // befintliga bolag som synkades om
  leadsCreated: number;
  errors: SyncError[];
  /** Sant om körningen stoppades i förtid av tidsbudgeten (inte ett fel). */
  stoppedEarly: boolean;
}

export interface RunSyncOptions {
  /** Epoch-ms; när tiden passerats avslutas körningen snyggt mellan bolag. */
  deadlineMs?: number;
}

const MAX_PAGES = 200; // skyddsräcke mot oändlig paginering

/**
 * Synkmotorn: hämta från provider → upsert companies + financials →
 * nya kvalificerade orgnr ⇒ lead med status 'ny'.
 *
 * Idempotent: två körningar i rad ger inga dubbletter (upserts på orgnr
 * respektive (orgnr, year), lead skapas bara när den saknas).
 *
 * Kvalificeringen (ELLER-logiken) körs alltid här, på ALLA hämtade
 * årssiffror – oavsett hur grovt providerns sökfilter är. Alla års
 * siffror sparas i company_financials; filtret avgör bara lead-skapandet.
 */
export async function runSync(
  provider: CompanyDataProvider,
  store: SyncStore,
  settings: SyncSettings,
  options: RunSyncOptions = {},
): Promise<SyncResult> {
  const result: SyncResult = {
    fetched: 0,
    created: 0,
    updated: 0,
    leadsCreated: 0,
    errors: [],
    stoppedEarly: false,
  };
  const seen = new Set<string>(); // dedupe inom körningen
  const pastDeadline = () =>
    options.deadlineMs !== undefined && Date.now() >= options.deadlineMs;

  let page = 1;
  for (let guard = 0; guard < MAX_PAGES; guard++) {
    if (pastDeadline()) {
      result.stoppedEarly = true;
      break;
    }
    let searchResult;
    try {
      searchResult = await provider.searchCompanies({
        sniCodes: settings.sniCodes,
        revenueMinSek: settings.revenueMinSek,
        years: settings.revenueYears,
        page,
      });
    } catch (e) {
      result.errors.push({
        orgnr: null,
        message: `Sökningen misslyckades (sida ${page}): ${messageOf(e)}`,
      });
      break;
    }

    for (const summary of searchResult.companies) {
      if (pastDeadline()) {
        result.stoppedEarly = true;
        break;
      }
      if (seen.has(summary.orgnr)) continue;
      seen.add(summary.orgnr);
      try {
        const details = await provider.getCompany(summary.orgnr);
        const financials = await provider.getFinancials(summary.orgnr);
        const outcome = await importCompany(store, settings, {
          details,
          financials,
          kalla: provider.name,
        });
        result.fetched++;
        if (outcome.company === "created") result.created++;
        else result.updated++;
        if (outcome.leadCreated) result.leadsCreated++;
      } catch (e) {
        result.errors.push({ orgnr: summary.orgnr, message: messageOf(e) });
        // Stämpla raden ändå – annars fastnar äldst-först-rotationen på
        // samma trasiga bolag i varje körning.
        try {
          await store.touchCompany(summary.orgnr);
        } catch {
          // Stämpeln är best effort.
        }
      }
    }

    if (
      result.stoppedEarly ||
      page >= searchResult.totalPages ||
      searchResult.companies.length === 0
    ) {
      break;
    }
    page++;
  }

  return result;
}

export interface ImportCompanyInput {
  details: CompanyDetails;
  financials: YearFinancials[];
  kalla: string;
  /**
   * 'qualified' (default): lead skapas endast om omsättningsfiltret
   * uppfylls. 'always': lead skapas för alla rader – används av
   * CSV-importen när användaren uttryckligen importerar en färdig lista.
   */
  leadMode?: "qualified" | "always";
}

export interface ImportCompanyOutcome {
  company: "created" | "updated";
  leadCreated: boolean;
}

/**
 * Gemensam importväg för API-synk och CSV-import: upsert av bolag och
 * samtliga årssiffror, därefter lead-beslut enligt kvalificeringsregeln.
 */
export async function importCompany(
  store: SyncStore,
  settings: SyncSettings,
  input: ImportCompanyInput,
): Promise<ImportCompanyOutcome> {
  const companyOutcome = await store.upsertCompany({
    ...input.details,
    kalla: input.kalla,
  });
  await store.upsertFinancials(input.details.orgnr, input.financials);

  // Datahygien: avregistrerade bolag ska aldrig ligga kvar som aktiva leads.
  if (input.details.avregistreradDatum) {
    await store.markLeadLost(
      input.details.orgnr,
      input.details.namn,
      `Avregistrerat hos Bolagsverket ${input.details.avregistreradDatum}`,
    );
    return { company: companyOutcome, leadCreated: false };
  }

  const shouldHaveLead =
    input.leadMode === "always" ||
    qualifies(
      input.financials.map((f) => ({ year: f.year, revenueSek: f.revenueSek })),
      settings,
    );

  let leadCreated = false;
  if (shouldHaveLead && !(await store.hasLead(input.details.orgnr))) {
    await store.createLead(input.details.orgnr, {
      namn: input.details.namn,
      kalla: input.kalla,
    });
    leadCreated = true;
  }
  return { company: companyOutcome, leadCreated };
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
