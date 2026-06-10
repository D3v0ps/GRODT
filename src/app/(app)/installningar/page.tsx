import { getSessionProfile } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { getConfiguredProviderName, providerLabel } from "@/lib/providers";
import {
  displayYears,
  getAutoSyncEnabled,
  getSyncFilter,
} from "@/lib/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { IconInfo } from "@/components/icons";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Inställningar – GRODT" };

export default async function InstallningarPage() {
  const session = await getSessionProfile();
  const supabase = await createSupabaseServerClient();
  const [settings, autoSync] = await Promise.all([
    getSyncFilter(supabase),
    getAutoSyncEnabled(supabase),
  ]);

  const { data: lastOkRun } = await supabase
    .from("import_runs")
    .select("finished_at, source")
    .eq("status", "ok")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const providerName = getConfiguredProviderName();
  const apiConfigured = providerName !== null;

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 8 }, (_, i) => currentYear - 6 + i);

  return (
    <section className="view">
      <SettingsFormWrapper
        isAdmin={session?.roll === "admin"}
        settings={settings}
        autoSync={autoSync}
        yearOptions={yearOptions}
        providerName={providerName}
        apiConfigured={apiConfigured}
        lastOkRun={lastOkRun}
      />
    </section>
  );
}

function SettingsFormWrapper({
  isAdmin,
  settings,
  autoSync,
  yearOptions,
  providerName,
  apiConfigured,
  lastOkRun,
}: {
  isAdmin: boolean;
  settings: { sniCodes: string[]; revenueMinSek: number; revenueYears: number[] };
  autoSync: boolean;
  yearOptions: number[];
  providerName: string | null;
  apiConfigured: boolean;
  lastOkRun: { finished_at: string | null; source: string } | null;
}) {
  const years = displayYears(settings);
  return (
    <>
      <SettingsForm
        isAdmin={isAdmin}
        sniCodes={settings.sniCodes}
        revenueMinSek={settings.revenueMinSek}
        years={years}
        autoSync={autoSync}
        yearOptions={yearOptions}
      />
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <h2>Datakälla</h2>
          {apiConfigured ? (
            <span className="pill ok">
              <span className="dot" />
              {providerName === "mock" ? "Mock-läge" : "API konfigurerad"}
            </span>
          ) : (
            <span className="pill">
              <span className="dot" style={{ background: "var(--ink-3)" }} />
              CSV-läge
            </span>
          )}
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="facts" style={{ gridTemplateColumns: "1fr" }}>
            <div className="fact">
              <div className="k">Leverantör</div>
              <div className="v">{providerLabel(providerName)}</div>
            </div>
            <div className="fact">
              <div className="k">Senaste lyckade körning</div>
              <div className="v mono">
                {lastOkRun?.finished_at
                  ? `${fmtDateTime(lastOkRun.finished_at)} (${providerLabel(lastOkRun.source)})`
                  : "Ingen ännu"}
              </div>
            </div>
            <div className="fact">
              <div className="k">API-nyckel</div>
              <div className="v mono">
                {providerName === "tic"
                  ? "Konfigurerad via miljövariabeln TIC_API_KEY"
                  : "Ej tillämplig"}
              </div>
            </div>
          </div>
          <div className="banner info">
            <IconInfo />
            <span>
              Ändrade filterparametrar påverkar nästa svep och nästa CSV-import –
              befintliga bolag och leads tas aldrig bort, och alla års bokslutssiffror
              sparas oavsett filter.
            </span>
          </div>
          {!apiConfigured && (
            <p className="small faint">
              Ingen API-leverantör är konfigurerad (DATA_PROVIDER). Bolag importeras via
              CSV under Import &amp; synk. Sätt DATA_PROVIDER=tic och TIC_API_KEY för att
              aktivera automatisk hämtning, eller DATA_PROVIDER=mock för testdata under
              utveckling.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
