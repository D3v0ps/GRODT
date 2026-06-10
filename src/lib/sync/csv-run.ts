import { logActivity } from "@/lib/activity";
import { parseCompanyCsv, type CsvRowError } from "@/lib/csv-import";
import { getSyncFilter } from "@/lib/settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { importCompany } from "./engine";
import { SupabaseSyncStore } from "./supabase-store";

export type CsvLeadMode = "auto" | "qualified" | "always";

export interface CsvImportOutcome {
  ok: boolean;
  message: string;
  fetched: number;
  created: number;
  updated: number;
  leadsCreated: number;
  rowErrors: CsvRowError[];
  /** Hur lead-beslutet faktiskt togs (auto löses till qualified/always). */
  appliedLeadMode: "qualified" | "always";
}

/**
 * CSV-import: parsa filen, kör varje rad genom samma importpipeline som
 * API-synken (upsert bolag + alla årssiffror, lead enligt
 * omsättningsfiltret) och logga körningen i import_runs + audit log.
 *
 * leadMode:
 *  - "auto" (default): filen innehåller omsättningssiffror → tillämpa
 *    ELLER-filtret; saknar filen siffror → alla rader blir leads
 *    (då är filen en färdig lista och filtret skulle ge noll träffar).
 *  - "qualified": tillämpa alltid filtret.
 *  - "always": skapa lead för alla rader oavsett omsättning.
 */
export async function performCsvImport(options: {
  actorId: string;
  fileName: string;
  text: string;
  leadMode?: CsvLeadMode;
}): Promise<CsvImportOutcome> {
  const parsed = parseCompanyCsv(options.text);

  const fail = (message: string): CsvImportOutcome => ({
    ok: false,
    message,
    fetched: 0,
    created: 0,
    updated: 0,
    leadsCreated: 0,
    rowErrors: parsed.errors,
    appliedLeadMode: "qualified",
  });

  if (parsed.rows.length === 0) {
    return fail(
      parsed.errors[0]?.message ?? "Filen innehöll inga giltiga bolagsrader.",
    );
  }

  const requested = options.leadMode ?? "auto";
  const appliedLeadMode: "qualified" | "always" =
    requested === "auto"
      ? parsed.hasRevenueData
        ? "qualified"
        : "always"
      : requested;

  const admin = createSupabaseAdminClient();
  const settings = await getSyncFilter(admin);
  const store = new SupabaseSyncStore(admin);

  const { data: run, error: runError } = await admin
    .from("import_runs")
    .insert({
      started_by: options.actorId,
      status: "running",
      source: "csv",
      trigger: "manuell",
    })
    .select("id")
    .single();
  if (runError || !run) {
    return fail(`Kunde inte starta importen: ${runError?.message}`);
  }

  let created = 0;
  let updated = 0;
  let leadsCreated = 0;
  const importErrors: CsvRowError[] = [...parsed.errors];

  for (const row of parsed.rows) {
    try {
      const outcome = await importCompany(store, settings, {
        details: row.details,
        financials: row.financials,
        kalla: "csv",
        leadMode: appliedLeadMode,
      });
      if (outcome.company === "created") created++;
      else updated++;
      if (outcome.leadCreated) leadsCreated++;
    } catch (e) {
      importErrors.push({
        row: 0,
        message: `${row.details.orgnr}: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  const fetched = created + updated;
  await admin
    .from("import_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: importErrors.length > 0 ? "fel" : "ok",
      fetched,
      created,
      updated,
      errors: importErrors.map((e) => ({
        orgnr: null,
        message: e.row > 0 ? `Rad ${e.row}: ${e.message}` : e.message,
      })),
    })
    .eq("id", run.id);

  await logActivity({
    actorId: options.actorId,
    entityType: "synk",
    entityId: run.id,
    action: "csv_import",
    payload: {
      fil: options.fileName,
      format: parsed.format,
      nya: created,
      uppdaterade: updated,
      leads: leadsCreated,
      fel: importErrors.length,
      lead_lage: appliedLeadMode,
    },
  });

  const skippedNote =
    appliedLeadMode === "qualified" && fetched > leadsCreated
      ? ` (${fetched - leadsCreated} under tröskeln sparades utan lead)`
      : "";
  return {
    ok: importErrors.length === 0,
    message:
      importErrors.length > 0
        ? `Import klar med ${importErrors.length} radfel – ${created} nya, ${updated} uppdaterade, ${leadsCreated} leads`
        : `Import slutförd – ${created} nya bolag, ${updated} uppdaterade, ${leadsCreated} leads${skippedNote}`,
    fetched,
    created,
    updated,
    leadsCreated,
    rowErrors: importErrors,
    appliedLeadMode,
  };
}
