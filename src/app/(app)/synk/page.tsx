import Link from "next/link";
import { fmtDateTime, fmtKr, fmtNumber } from "@/lib/format";
import { getEffectiveProviderName, providerLabel } from "@/lib/providers";
import { getSyncFilter } from "@/lib/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { IconError } from "@/components/icons";
import { getSessionProfile } from "@/lib/auth";
import { getGooglePlacesApiKey } from "@/lib/providers/google-places";
import { CsvImportCard } from "./csv-import-card";
import { GoogleSweepCard } from "./google-sweep-card";
import { SyncButton } from "./sync-button";

export const metadata = { title: "Import & synk – GRODT" };

interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  source: string;
  trigger: string;
  fetched: number;
  created: number;
  updated: number;
  errors: { orgnr: string | null; message: string }[];
  profiles: { namn: string } | { namn: string }[] | null;
}

export default async function SynkPage() {
  const supabase = await createSupabaseServerClient();
  const [settings, providerName, session, googleKey, missingPhoneRes] = await Promise.all([
    getSyncFilter(supabase),
    getEffectiveProviderName(supabase),
    getSessionProfile(),
    getGooglePlacesApiKey(),
    supabase
      .from("companies")
      .select("orgnr", { count: "exact", head: true })
      .is("telefon", null)
      .is("avregistrerad_datum", null),
  ]);
  const saknarTelefon = missingPhoneRes.count ?? 0;

  const { data: runsData } = await supabase
    .from("import_runs")
    .select(
      "id, started_at, finished_at, status, source, trigger, fetched, created, updated, errors, profiles(namn)",
    )
    .order("started_at", { ascending: false })
    .limit(20);
  const runs = (runsData ?? []) as unknown as RunRow[];

  const yearsText = settings.revenueYears.join(" eller ");

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h1>Import &amp; synk</h1>
          <p className="lede">
            Importera din bolagslista som CSV eller hämta från datakällan enligt
            filterparametrarna nedan. Varje körning loggas.
          </p>
        </div>
        <div className="actions">
          <SyncButton disabled={providerName === null} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2>Aktiva filterparametrar</h2>
          <Link className="small" href="/installningar">
            Ändra i inställningar
          </Link>
        </div>
        <div className="card-body">
          <div className="sync-params">
            <span className="param-chip">
              <span className="k">SNI</span> {settings.sniCodes.join(", ")}
            </span>
            <span className="param-chip mono">
              <span className="k">Tröskel</span> ≥ {fmtKr(settings.revenueMinSek)}
            </span>
            <span className="param-chip mono">
              <span className="k">Räkenskapsår</span> {yearsText}
            </span>
            <span className="param-chip">
              <span className="k">Datakälla</span> {providerLabel(providerName)}
            </span>
          </div>
          <p className="small faint" style={{ marginTop: 10 }}>
            ELLER-logik på räkenskapsåren: ett bolag tas med om minst ett av åren når
            tröskeln, så att snabbväxare inte faller bort. Filtret gäller även CSV-import
            när filen innehåller omsättningssiffror.
          </p>
        </div>
      </div>

      <CsvImportCard sniCodes={settings.sniCodes} />

      {session?.roll === "admin" && (
        <GoogleSweepCard saknarTelefon={saknarTelefon} configured={googleKey !== null} />
      )}

      <div className="table-shell">
        <div className="table-toolbar">
          <strong style={{ fontSize: 13 }}>Körningshistorik</strong>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Tidpunkt</th>
                <th>Startad av</th>
                <th>Källa</th>
                <th className="num">Hämtade</th>
                <th className="num">Nya</th>
                <th className="num">Uppdaterade</th>
                <th className="num">Fel</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ height: "auto", whiteSpace: "normal" }}>
                    <EmptyState
                      title="Inga körningar ännu"
                      description="Importera en CSV-fil eller klicka på Hämta bolag nu för att göra det första svepet."
                    />
                  </td>
                </tr>
              ) : (
                runs.flatMap((run) => {
                  const profiles = run.profiles;
                  const startedBy = Array.isArray(profiles)
                    ? profiles[0]?.namn
                    : profiles?.namn;
                  const vem =
                    run.trigger === "cron" ? "Automatik (cron)" : startedBy ?? "Okänd";
                  const errors = Array.isArray(run.errors) ? run.errors : [];
                  const rows = [
                    <tr key={run.id}>
                      <td className="mono">{fmtDateTime(run.started_at)}</td>
                      <td>{vem}</td>
                      <td>{providerLabel(run.source)}</td>
                      <td className="num">{fmtNumber(run.fetched)}</td>
                      <td className="num">{fmtNumber(run.created)}</td>
                      <td className="num">{fmtNumber(run.updated)}</td>
                      <td className="num">{fmtNumber(errors.length)}</td>
                      <td>
                        {run.status === "ok" ? (
                          <span className="badge st-kund">
                            <span className="dot" />
                            Slutförd
                          </span>
                        ) : run.status === "running" ? (
                          <span className="badge st-ny">
                            <span className="dot" />
                            Pågår
                          </span>
                        ) : (
                          <span className="badge st-fel">
                            <span className="dot" />
                            Fel
                          </span>
                        )}
                      </td>
                    </tr>,
                  ];
                  if (errors.length > 0) {
                    rows.push(
                      <tr key={`${run.id}-err`}>
                        <td
                          colSpan={8}
                          style={{ height: "auto", padding: "0 12px 10px", whiteSpace: "normal" }}
                        >
                          <div className="banner error" style={{ margin: 0 }}>
                            <IconError />
                            <span>
                              <strong>Fel i körningen:</strong>{" "}
                              {errors
                                .slice(0, 3)
                                .map((e) => (e.orgnr ? `${e.orgnr}: ${e.message}` : e.message))
                                .join(" · ")}
                              {errors.length > 3 && ` · … och ${errors.length - 3} till`}
                            </span>
                          </div>
                        </td>
                      </tr>,
                    );
                  }
                  return rows;
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
