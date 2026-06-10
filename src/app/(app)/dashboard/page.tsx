import Link from "next/link";
import { fetchActivities } from "@/lib/activity";
import { activityFeedText } from "@/lib/activity-text";
import { LEAD_STATUSES } from "@/lib/constants";
import { fmtDate, fmtDateTime, fmtKr, fmtNumber } from "@/lib/format";
import { getAutoSyncEnabled, getSyncFilter } from "@/lib/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { RadarGlyph } from "@/components/radar-glyph";

export const metadata = { title: "Dashboard – GRODT" };

interface StatusCount {
  status: string;
  antal: number;
}

function nextMonday(from: Date): Date {
  const d = new Date(from);
  const day = d.getUTCDay();
  const delta = day === 1 ? 7 : (8 - day) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const settings = await getSyncFilter(supabase);

  const [companiesRes, statusRes, newUnassignedRes, recentCustomersRes, lastRunRes, autoSync] =
    await Promise.all([
      supabase.from("companies").select("orgnr", { count: "exact", head: true }),
      supabase.rpc("lead_status_counts"),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "ny")
        .is("owner_id", null),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "kund")
        .gte("updated_at", new Date(Date.now() - 30 * 86_400_000).toISOString()),
      supabase
        .from("import_runs")
        .select("finished_at, created, source")
        .eq("status", "ok")
        .order("finished_at", { ascending: false })
        .limit(1),
      getAutoSyncEnabled(supabase),
    ]);

  const companyCount = companiesRes.count ?? 0;
  const statusCounts = new Map<string, number>(
    ((statusRes.data ?? []) as StatusCount[]).map((r) => [r.status, Number(r.antal)]),
  );
  const totalLeads = [...statusCounts.values()].reduce((a, b) => a + b, 0);
  const newLeads = statusCounts.get("ny") ?? 0;
  const newUnassigned = newUnassignedRes.count ?? 0;
  const activeDialogs =
    (statusCounts.get("kontaktad") ?? 0) +
    (statusCounts.get("dialog") ?? 0) +
    (statusCounts.get("mote") ?? 0);
  const customers = statusCounts.get("kund") ?? 0;
  const recentCustomers = recentCustomersRes.count ?? 0;
  const lastRun = lastRunRes.data?.[0] ?? null;

  const activities = await fetchActivities({ limit: 6 });

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h1>Dashboard</h1>
          <p className="lede">
            Läget i radarn just nu · uppdaterat{" "}
            <span className="mono">{fmtDateTime(new Date())}</span>
          </p>
        </div>
        <div className="actions">
          <Link className="btn" href="/synk">
            Till synk
          </Link>
          <Link className="btn btn-primary" href="/bolag">
            Öppna bolagslistan
          </Link>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi kpi-accent">
          <div className="kpi-label">Bolag i databasen</div>
          <div className="kpi-value">{fmtNumber(companyCount)}</div>
          <div className="kpi-meta">
            {lastRun && lastRun.created > 0 ? (
              <>
                <span className="up">+{fmtNumber(lastRun.created)}</span> sedan senaste synk
              </>
            ) : (
              "Inga nya i senaste synken"
            )}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Nya leads att kvalificera</div>
          <div className="kpi-value">{fmtNumber(newLeads)}</div>
          <div className="kpi-meta">
            {newUnassigned === newLeads
              ? "Status Ny, ej tilldelade"
              : `${fmtNumber(newUnassigned)} ej tilldelade`}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Aktiva dialoger</div>
          <div className="kpi-value">{fmtNumber(activeDialogs)}</div>
          <div className="kpi-meta">Kontaktad–Möte</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Kunder</div>
          <div className="kpi-value">{fmtNumber(customers)}</div>
          <div className="kpi-meta">
            {recentCustomers > 0 ? (
              <>
                <span className="up">+{fmtNumber(recentCustomers)}</span> senaste 30 dagarna
              </>
            ) : (
              "Inga nya senaste 30 dagarna"
            )}
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div className="card">
            <div className="card-head">
              <h2>Pipeline-fördelning</h2>
              <span className="small faint">{fmtNumber(totalLeads)} leads</span>
            </div>
            <div className="card-body">
              {totalLeads === 0 ? (
                <EmptyState
                  title="Radarn har inte hittat några bolag ännu"
                  description="Importera en CSV-fil eller kör en synk under Import & synk så fylls pipelinen på."
                  action={
                    <Link className="btn btn-sm" href="/synk">
                      Till Import &amp; synk
                    </Link>
                  }
                />
              ) : (
                <>
                  <div className="pipe-bar" role="img" aria-label="Fördelning av leads per status">
                    {LEAD_STATUSES.map((s) => {
                      const count = statusCounts.get(s.key) ?? 0;
                      if (count === 0) return null;
                      return (
                        <span
                          key={s.key}
                          style={{
                            width: `${(count / totalLeads) * 100}%`,
                            background: `var(--st-${s.key}-dot)`,
                          }}
                          title={`${s.label}: ${count}`}
                        />
                      );
                    })}
                  </div>
                  <div className="pipe-legend">
                    {LEAD_STATUSES.map((s) => (
                      <div className="row" key={s.key}>
                        <span className="dot" style={{ background: `var(--st-${s.key}-dot)` }} />
                        {s.label}
                        <span className="count">{fmtNumber(statusCounts.get(s.key) ?? 0)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="radar-tile">
            <span style={{ color: "#6BA2B9" }}>
              <RadarGlyph size={56} live />
            </span>
            <div>
              <div className="label">Senaste svep</div>
              <div className="big">
                {lastRun?.finished_at ? fmtDateTime(lastRun.finished_at) : "–"}
              </div>
              <div className="meta">
                {lastRun
                  ? `${fmtNumber(lastRun.created)} nya bolag över tröskeln ${fmtKr(settings.revenueMinSek)}`
                  : "Ingen synk har körts ännu"}
                {autoSync
                  ? ` · nästa automatiska svep ${fmtDate(nextMonday(new Date()))}`
                  : " · automatiskt svep är avstängt"}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Senaste aktiviteter</h2>
            <Link className="small" href="/admin">
              Hela loggen
            </Link>
          </div>
          <div className="card-body" style={{ paddingTop: 6 }}>
            {activities.length === 0 ? (
              <EmptyState
                title="Inga aktiviteter ännu"
                description="Statusbyten, anteckningar och synkkörningar visas här."
              />
            ) : (
              <div className="activity-list">
                {activities.map((a) => {
                  const namn = a.actor_namn ?? "Systemet";
                  return (
                    <div className="item" key={a.id}>
                      <Avatar id={a.actor_id ?? "system"} namn={namn} />
                      <span className="txt">
                        <strong>{namn.split(" ")[0]}</strong>{" "}
                        {activityFeedText(a.action, a.payload)}
                      </span>
                      <span className="when">{fmtDateTime(a.created_at).slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
