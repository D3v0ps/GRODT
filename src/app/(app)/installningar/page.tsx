import { getSessionProfile } from "@/lib/auth";
import { avatarStoragePath } from "@/lib/avatar-url";
import { fmtDateTime } from "@/lib/format";
import { getEffectiveProviderName, providerLabel } from "@/lib/providers";
import {
  displayYears,
  getAutoSyncEnabled,
  getSyncFilter,
} from "@/lib/settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { IconInfo } from "@/components/icons";
import { AccountCard } from "./account-card";
import { BolagsverketTest } from "./bolagsverket-test";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Inställningar – GRODT" };

export default async function InstallningarPage() {
  const session = await getSessionProfile();
  const supabase = await createSupabaseServerClient();
  const [settings, autoSync] = await Promise.all([
    getSyncFilter(supabase),
    getAutoSyncEnabled(supabase),
  ]);

  const [{ data: lastOkRun }, { data: ownProfile }] = await Promise.all([
    supabase
      .from("import_runs")
      .select("finished_at, source")
      .eq("status", "ok")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    session
      ? supabase.from("profiles").select("avatar_url").eq("id", session.userId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Privat bucket: byt lagringssökvägen mot en signerad URL för förhandsvisningen.
  let ownAvatarUrl: string | null = null;
  const ownAvatarPath = avatarStoragePath(ownProfile?.avatar_url ?? null);
  if (ownAvatarPath) {
    const { data: signed } = await createSupabaseAdminClient()
      .storage.from("avatars")
      .createSignedUrl(ownAvatarPath, 3600);
    ownAvatarUrl = signed?.signedUrl ?? null;
  }

  const providerName = await getEffectiveProviderName(supabase);
  const apiConfigured = providerName !== null;
  const showBolagsverketTest =
    session?.roll === "admin" &&
    (providerName === "bolagsverket" || !!process.env.BOLAGSVERKET_CLIENT_ID);

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
        showBolagsverketTest={showBolagsverketTest}
      />
      {session && (
        <div style={{ marginTop: 14 }}>
          <AccountCard
            userId={session.userId}
            namn={session.namn}
            email={session.email}
            roll={session.roll}
            avatarUrl={ownAvatarUrl}
          />
        </div>
      )}
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
  showBolagsverketTest,
}: {
  isAdmin: boolean;
  settings: { sniCodes: string[]; revenueMinSek: number; revenueYears: number[] };
  autoSync: boolean;
  yearOptions: number[];
  providerName: string | null;
  apiConfigured: boolean;
  lastOkRun: { finished_at: string | null; source: string } | null;
  showBolagsverketTest: boolean;
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
              <div className="k">API-nycklar</div>
              <div className="v mono">
                {providerName === "tic"
                  ? "Konfigureras via miljövariabeln TIC_API_KEY"
                  : providerName === "bolagsverket"
                    ? "Konfigureras via BOLAGSVERKET_CLIENT_ID/SECRET"
                    : "Ej tillämplig"}
              </div>
            </div>
          </div>
          {showBolagsverketTest && <BolagsverketTest />}
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
