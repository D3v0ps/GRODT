import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { fetchActivities } from "@/lib/activity";
import { activityFeedText } from "@/lib/activity-text";
import { getSessionProfile } from "@/lib/auth";
import { rollLabel, statusLabel } from "@/lib/constants";
import { fmtDate, fmtDateTime, fmtKr, fmtNumber } from "@/lib/format";
import { PERIODS, parsePeriod, periodLabel, periodRange } from "@/lib/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Profil – GRODT" };

interface SellerStatsRow {
  user_id: string;
  kontaktade: number;
  dialoger: number;
  moten: number;
  vunna: number;
  forlorade: number;
  anteckningar: number;
  uppfoljningar_klara: number;
  ringda: number;
  aktiviteter: number;
  intjanat: number;
}

interface OwnerStatusRow {
  owner_id: string | null;
  status: string;
  antal: number;
}

interface LeaderboardRow {
  saljare_id: string;
  antal_kunder: number;
  intjanat: number;
}

const AKTIVA_STATUSAR = ["ny", "kontaktad", "dialog", "mote"] as const;

export default async function ProfilPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const period = parsePeriod((await searchParams).period);
  const { from, to } = periodRange(period);

  const supabase = await createSupabaseServerClient();
  const [session, profileRes, statsRes, pipelineRes, leaderboardRes, kunderRes] =
    await Promise.all([
      getSessionProfile(),
      supabase
        .from("profiles")
        .select("id, namn, roll, aktiv, created_at")
        .eq("id", id)
        .maybeSingle(),
      supabase.rpc("seller_stats", {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      }),
      supabase.rpc("lead_owner_status_counts"),
      supabase.rpc("customer_leaderboard"),
      supabase.from("customers").select("status").eq("controller_id", id),
    ]);

  const profile = profileRes.data;
  if (!profile) notFound();

  const statsRow = ((statsRes.data ?? []) as SellerStatsRow[]).find(
    (row) => row.user_id === id,
  );
  const stat = (key: keyof Omit<SellerStatsRow, "user_id">) =>
    Number(statsRow?.[key] ?? 0);

  const aktivaLeads = new Map<string, number>();
  let aktivaTotalt = 0;
  for (const row of (pipelineRes.data ?? []) as OwnerStatusRow[]) {
    if (row.owner_id !== id) continue;
    if (!AKTIVA_STATUSAR.some((s) => s === row.status)) continue;
    aktivaLeads.set(row.status, Number(row.antal));
    aktivaTotalt += Number(row.antal);
  }

  const leaderboard = ((leaderboardRes.data ?? []) as LeaderboardRow[]).find(
    (row) => row.saljare_id === id,
  );
  const kundStatusar = (kunderRes.data ?? []).map((row) => row.status as string);
  const kunderILeverans = kundStatusar.filter(
    (s) => s !== "betald" && s !== "fakturerad",
  ).length;
  const kunderFakturerade = kundStatusar.filter((s) => s === "fakturerad").length;

  const activities = await fetchActivities({ actorId: id, limit: 20 });
  const arJag = session?.userId === id;
  const fornamn = profile.namn.split(" ")[0];

  return (
    <section className="view">
      <div className="view-head">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Avatar id={profile.id} namn={profile.namn} size={56} />
          <div>
            <h1>
              {profile.namn}
              {arJag && <span className="faint" style={{ fontWeight: 400 }}> · min profil</span>}
            </h1>
            <p className="lede">
              {rollLabel(profile.roll)}
              {!profile.aktiv && " · Inaktiverad"} · med sedan{" "}
              <span className="mono">{fmtDate(profile.created_at)}</span>
            </p>
          </div>
        </div>
        <div className="actions">
          <span className="seg" role="group" aria-label="Välj period">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={
                  p.key === "manad"
                    ? `/profil/${profile.id}`
                    : `/profil/${profile.id}?period=${p.key}`
                }
                className={p.key === period ? "active" : undefined}
                aria-current={p.key === period ? "true" : undefined}
              >
                {p.label}
              </Link>
            ))}
          </span>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Kontaktade</div>
          <div className="kpi-value">{fmtNumber(stat("kontaktade"))}</div>
          <div className="kpi-meta">{periodLabel(period)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Möten bokade</div>
          <div className="kpi-value">{fmtNumber(stat("moten"))}</div>
          <div className="kpi-meta">{periodLabel(period)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Vunna affärer</div>
          <div className="kpi-value">{fmtNumber(stat("vunna"))}</div>
          <div className="kpi-meta">
            {stat("forlorade") > 0
              ? `${fmtNumber(stat("forlorade"))} förlorade`
              : periodLabel(period)}
          </div>
        </div>
        <div className="kpi kpi-accent">
          <div className="kpi-label">Intjänat</div>
          <div className="kpi-value">{fmtKr(stat("intjanat"))}</div>
          <div className="kpi-meta">{periodLabel(period)}</div>
        </div>
      </div>

      <div className="dash-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div className="card">
            <div className="card-head">
              <h2>Aktivitet – {periodLabel(period).toLowerCase()}</h2>
              <span className="small faint">
                {fmtNumber(stat("aktiviteter"))} händelser totalt
              </span>
            </div>
            <div className="card-body">
              <div className="facts">
                <div className="fact">
                  <div className="k">Dialoger startade</div>
                  <div className="v mono">{fmtNumber(stat("dialoger"))}</div>
                </div>
                <div className="fact">
                  <div className="k">Ringda (ringlistor)</div>
                  <div className="v mono">{fmtNumber(stat("ringda"))}</div>
                </div>
                <div className="fact">
                  <div className="k">Anteckningar</div>
                  <div className="v mono">{fmtNumber(stat("anteckningar"))}</div>
                </div>
                <div className="fact">
                  <div className="k">Uppföljningar avklarade</div>
                  <div className="v mono">{fmtNumber(stat("uppfoljningar_klara"))}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Senaste händelser</h2>
              <span className="small faint">de 20 senaste</span>
            </div>
            <div className="card-body" style={{ paddingTop: 6 }}>
              {activities.length === 0 ? (
                <EmptyState
                  title="Ingen aktivitet ännu"
                  description="Statusbyten, anteckningar och avbockade samtal hamnar här."
                />
              ) : (
                <div className="activity-list">
                  {activities.map((a) => (
                    <div className="item" key={a.id}>
                      <span className="txt">
                        <strong>{fornamn}</strong> {activityFeedText(a.action, a.payload)}
                      </span>
                      <span className="when">{fmtDateTime(a.created_at).slice(5)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div className="card">
            <div className="card-head">
              <h2>På bordet just nu</h2>
            </div>
            <div className="card-body">
              <div className="facts" style={{ gridTemplateColumns: "1fr" }}>
                <div className="fact">
                  <div className="k">Aktiva leads</div>
                  <div className="v">
                    <strong className="mono" style={{ fontSize: 18 }}>
                      {fmtNumber(aktivaTotalt)}
                    </strong>{" "}
                    <span className="faint small">
                      {AKTIVA_STATUSAR.filter((s) => (aktivaLeads.get(s) ?? 0) > 0)
                        .map((s) => `${aktivaLeads.get(s)} ${statusLabel(s).toLowerCase()}`)
                        .join(" · ") || "inga"}
                    </span>
                  </div>
                </div>
                <div className="fact">
                  <div className="k">Kunder som controller</div>
                  <div className="v">
                    <strong className="mono" style={{ fontSize: 18 }}>
                      {fmtNumber(kundStatusar.length)}
                    </strong>{" "}
                    <span className="faint small">
                      {kundStatusar.length > 0
                        ? `${fmtNumber(kunderILeverans)} i leverans · ${fmtNumber(kunderFakturerade)} fakturerade`
                        : "inga"}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <Link className="btn btn-sm" href={`/bolag?ansvarig=${profile.id}`}>
                  Visa bolag
                </Link>
                <Link className="btn btn-sm" href={`/kunder?controller=${profile.id}`}>
                  Visa kunder
                </Link>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Som säljare totalt</h2>
              <span className="small faint">hela tiden</span>
            </div>
            <div className="card-body">
              <div className="facts" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div className="fact">
                  <div className="k">Vunna kunder</div>
                  <div className="v mono" style={{ fontSize: 18, fontWeight: 600 }}>
                    {fmtNumber(Number(leaderboard?.antal_kunder ?? 0))}
                  </div>
                </div>
                <div className="fact">
                  <div className="k">Intjänat</div>
                  <div className="v mono" style={{ fontSize: 18, fontWeight: 600 }}>
                    {fmtKr(Number(leaderboard?.intjanat ?? 0))}
                  </div>
                </div>
              </div>
              <p className="small faint" style={{ margin: "10px 0 0" }}>
                Affärer krediteras den säljare som ägde leadet vid överlämningen.
              </p>
            </div>
          </div>

          {arJag && (
            <div className="card">
              <div className="card-head">
                <h2>Mitt konto</h2>
              </div>
              <div
                className="card-body"
                style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
              >
                <p className="small muted" style={{ margin: 0, flex: "1 1 220px" }}>
                  Lösenord och profilbild byter du under Inställningar → Mitt konto.
                </p>
                <Link className="btn btn-sm" href="/installningar">
                  Till Inställningar
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
