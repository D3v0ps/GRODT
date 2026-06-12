import { redirect } from "next/navigation";
import { fmtKr, fmtNumber } from "@/lib/format";
import {
  KUNDER_PAGE_SIZE,
  kundParamsToQuery,
  parseKundParams,
  type CustomerListRow,
} from "@/lib/customer-params";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/avatar";
import { KunderTable } from "./kunder-table";

export const metadata = { title: "Kunder – GRODT" };

interface Stats {
  totalt: number;
  i_leverans: number;
  levererade: number;
  fakturerade: number;
  betalda: number;
  intjanat_totalt: number;
}

interface LeaderboardRow {
  saljare_id: string;
  namn: string;
  antal_kunder: number;
  intjanat: number;
}

export default async function KunderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseKundParams(await searchParams);
  const supabase = await createSupabaseServerClient();

  const offset = (params.sida - 1) * KUNDER_PAGE_SIZE;
  const [listRes, statsRes, leaderboardRes, controllersRes] = await Promise.all([
    supabase.rpc("list_customers", {
      p_search: params.sok || null,
      p_status: params.status ?? null,
      p_controller: params.controller ?? null,
      p_sort: params.sort,
      p_dir: params.dir,
      p_limit: KUNDER_PAGE_SIZE,
      p_offset: offset,
    }),
    supabase.rpc("customer_stats"),
    supabase.rpc("customer_leaderboard"),
    supabase.from("profiles").select("id, namn").eq("aktiv", true).order("namn"),
  ]);

  const rows = (listRes.data ?? []) as CustomerListRow[];
  const total = rows[0]?.total_count ? Number(rows[0].total_count) : 0;

  // Sidlänk bortom sista sidan → tillbaka till första, med filtren kvar.
  if (rows.length === 0 && params.sida > 1) {
    const query = kundParamsToQuery({ ...params, sida: 1 }).toString();
    redirect(`/kunder${query ? `?${query}` : ""}`);
  }
  const stats = ((statsRes.data ?? [])[0] ?? {
    totalt: 0,
    i_leverans: 0,
    levererade: 0,
    fakturerade: 0,
    betalda: 0,
    intjanat_totalt: 0,
  }) as Stats;
  const leaderboard = (leaderboardRes.data ?? []) as LeaderboardRow[];
  const users = controllersRes.data ?? [];

  return (
    <section className="view">
      <div className="kpi-grid">
        <div className="kpi kpi-accent">
          <div className="kpi-label">Intjänat totalt</div>
          <div className="kpi-value">{fmtKr(Number(stats.intjanat_totalt))}</div>
          <div className="kpi-meta">Alla registrerade intäkter</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Kunder</div>
          <div className="kpi-value">{fmtNumber(Number(stats.totalt))}</div>
          <div className="kpi-meta">Vunna och överlämnade bolag</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">I leverans</div>
          <div className="kpi-value">{fmtNumber(Number(stats.i_leverans))}</div>
          <div className="kpi-meta">Överlämnad till 75 % klar</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Fakturor ute</div>
          <div className="kpi-value">{fmtNumber(Number(stats.fakturerade))}</div>
          <div className="kpi-meta">
            {fmtNumber(Number(stats.levererade))} att fakturera ·{" "}
            {fmtNumber(Number(stats.betalda))} betalda
          </div>
        </div>
      </div>

      <KunderTable rows={rows} total={total} params={params} controllers={users} />

      {leaderboard.length > 0 && (
        <div className="card" style={{ marginTop: 14, maxWidth: 520 }}>
          <div className="card-head">
            <h2>Topplistan</h2>
            <span className="small faint">Get rich or die trying</span>
          </div>
          <div className="card-body" style={{ paddingTop: 6 }}>
            <div className="activity-list">
              {leaderboard.map((row, index) => (
                <div className="item" key={row.saljare_id}>
                  <span className="mono" style={{ width: 18, color: "var(--ink-3)" }}>
                    {index + 1}
                  </span>
                  <Avatar id={row.saljare_id} namn={row.namn} />
                  <span className="txt">
                    <strong>{row.namn}</strong>{" "}
                    <span className="faint small">
                      {fmtNumber(Number(row.antal_kunder))}{" "}
                      {Number(row.antal_kunder) === 1 ? "kund" : "kunder"}
                    </span>
                  </span>
                  <span className="when" style={{ fontSize: 12.5 }}>
                    {fmtKr(Number(row.intjanat))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
