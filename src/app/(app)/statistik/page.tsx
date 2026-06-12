import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { fmtDate, fmtKr, fmtNumber } from "@/lib/format";
import { PERIODS, parsePeriod, periodLabel, periodRange } from "@/lib/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Statistik – GRODT" };

interface SellerStatsRow {
  user_id: string;
  namn: string;
  roll: string;
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

const AKTIVA_STATUSAR = ["ny", "kontaktad", "dialog", "mote"] as const;
const AKTIVA_LABELS: Record<(typeof AKTIVA_STATUSAR)[number], string> = {
  ny: "Ny",
  kontaktad: "Kontaktad",
  dialog: "Dialog",
  mote: "Möte",
};

export default async function StatistikPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const period = parsePeriod((await searchParams).period);
  const { from, to } = periodRange(period);
  const supabase = await createSupabaseServerClient();

  const [statsRes, pipelineRes] = await Promise.all([
    supabase.rpc("seller_stats", {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    }),
    supabase.rpc("lead_owner_status_counts"),
  ]);

  const stats = ((statsRes.data ?? []) as SellerStatsRow[])
    .map((row) => ({
      ...row,
      kontaktade: Number(row.kontaktade),
      dialoger: Number(row.dialoger),
      moten: Number(row.moten),
      vunna: Number(row.vunna),
      forlorade: Number(row.forlorade),
      anteckningar: Number(row.anteckningar),
      uppfoljningar_klara: Number(row.uppfoljningar_klara),
      ringda: Number(row.ringda),
      aktiviteter: Number(row.aktiviteter),
      intjanat: Number(row.intjanat),
    }))
    .sort(
      (a, b) =>
        b.intjanat - a.intjanat ||
        b.vunna - a.vunna ||
        b.aktiviteter - a.aktiviteter ||
        a.namn.localeCompare(b.namn, "sv"),
    );

  const summa = (key: keyof SellerStatsRow) =>
    stats.reduce((sum, row) => sum + Number(row[key]), 0);

  // Pipeline-nuläget: aktiva leads (Ny–Möte) per ansvarig + otilldelade.
  const pipeline = new Map<string, Record<string, number>>();
  for (const row of (pipelineRes.data ?? []) as OwnerStatusRow[]) {
    const key = row.owner_id ?? "";
    const bucket = pipeline.get(key) ?? {};
    bucket[row.status] = Number(row.antal);
    pipeline.set(key, bucket);
  }
  const aktiva = (ownerId: string, status: string) =>
    pipeline.get(ownerId)?.[status] ?? 0;
  const aktivaTotalt = (ownerId: string) =>
    AKTIVA_STATUSAR.reduce((sum, s) => sum + aktiva(ownerId, s), 0);
  const otilldelade = aktivaTotalt("");

  return (
    <section className="view view-wide">
      <div className="view-head">
        <div>
          <h1>Statistik</h1>
          <p className="lede">
            {periodLabel(period)}
            {period !== "allt" && (
              <>
                {" "}
                · från <span className="mono">{fmtDate(from)}</span>
              </>
            )}{" "}
            · poängen följer aktivitetsloggen
          </p>
        </div>
        <div className="actions">
          <span className="seg" role="group" aria-label="Välj period">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={p.key === "manad" ? "/statistik" : `/statistik?period=${p.key}`}
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
          <div className="kpi-value">{fmtNumber(summa("kontaktade"))}</div>
          <div className="kpi-meta">Leads flyttade till Kontaktad</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Möten bokade</div>
          <div className="kpi-value">{fmtNumber(summa("moten"))}</div>
          <div className="kpi-meta">Leads flyttade till Möte</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Vunna affärer</div>
          <div className="kpi-value">{fmtNumber(summa("vunna"))}</div>
          <div className="kpi-meta">
            {summa("forlorade") > 0
              ? `${fmtNumber(summa("forlorade"))} förlorade samma period`
              : "Inga förlorade denna period"}
          </div>
        </div>
        <div className="kpi kpi-accent">
          <div className="kpi-label">Intjänat</div>
          <div className="kpi-value">{fmtKr(summa("intjanat"))}</div>
          <div className="kpi-meta">Intäkter daterade i perioden</div>
        </div>
      </div>

      <div className="table-shell" style={{ marginBottom: 14 }}>
        <div className="table-toolbar">
          <strong style={{ fontSize: 13 }}>Aktivitet per person</strong>
          <span className="spacer" />
          <span className="result-count">{periodLabel(period)}</span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Person</th>
                <th className="num">Kontaktade</th>
                <th className="num">Dialoger</th>
                <th className="num">Möten</th>
                <th className="num">Vunna</th>
                <th className="num">Förlorade</th>
                <th className="num" title="Avbockade samtal i ringlistor">
                  Ringda
                </th>
                <th className="num">Anteckningar</th>
                <th className="num" title="Avklarade uppföljningar">
                  Uppföljn.
                </th>
                <th className="num">Intjänat</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row, index) => (
                <tr key={row.user_id}>
                  <td>
                    <span className="ansvarig-cell">
                      <span className="mono faint small" style={{ width: 16 }}>
                        {index + 1}
                      </span>
                      <Avatar id={row.user_id} namn={row.namn} />
                      <Link href={`/profil/${row.user_id}`}>
                        <strong>{row.namn}</strong>
                      </Link>
                    </span>
                  </td>
                  <td className="num">{fmtNumber(row.kontaktade)}</td>
                  <td className="num">{fmtNumber(row.dialoger)}</td>
                  <td className="num">{fmtNumber(row.moten)}</td>
                  <td className="num" style={row.vunna > 0 ? { color: "var(--ok)", fontWeight: 600 } : undefined}>
                    {fmtNumber(row.vunna)}
                  </td>
                  <td className="num">{fmtNumber(row.forlorade)}</td>
                  <td className="num">{fmtNumber(row.ringda)}</td>
                  <td className="num">{fmtNumber(row.anteckningar)}</td>
                  <td className="num">{fmtNumber(row.uppfoljningar_klara)}</td>
                  <td className="num" style={row.intjanat > 0 ? { fontWeight: 600 } : undefined}>
                    {fmtKr(row.intjanat)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="table-shell">
        <div className="table-toolbar">
          <strong style={{ fontSize: 13 }}>Pipeline just nu</strong>
          <span className="spacer" />
          <span className="result-count">
            {otilldelade > 0
              ? `${fmtNumber(otilldelade)} aktiva leads utan ansvarig`
              : "Alla aktiva leads har en ansvarig"}
          </span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Person</th>
                {AKTIVA_STATUSAR.map((s) => (
                  <th key={s} className="num">
                    {AKTIVA_LABELS[s]}
                  </th>
                ))}
                <th className="num">Aktiva totalt</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => (
                <tr key={row.user_id}>
                  <td>
                    <span className="ansvarig-cell">
                      <Avatar id={row.user_id} namn={row.namn} />
                      <Link href={`/profil/${row.user_id}`}>{row.namn}</Link>
                    </span>
                  </td>
                  {AKTIVA_STATUSAR.map((s) => (
                    <td key={s} className="num">
                      {fmtNumber(aktiva(row.user_id, s))}
                    </td>
                  ))}
                  <td className="num" style={{ fontWeight: 600 }}>
                    {fmtNumber(aktivaTotalt(row.user_id))}
                  </td>
                </tr>
              ))}
              {otilldelade > 0 && (
                <tr>
                  <td>
                    <Link className="faint" href="/bolag?status=ny">
                      Ej tilldelade
                    </Link>
                  </td>
                  {AKTIVA_STATUSAR.map((s) => (
                    <td key={s} className="num faint">
                      {fmtNumber(aktiva("", s))}
                    </td>
                  ))}
                  <td className="num faint">{fmtNumber(otilldelade)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="small faint" style={{ marginTop: 10 }}>
        Kontaktade/Dialoger/Möten/Vunna räknar statusbyten i aktivitetsloggen – den som
        gör bytet får poängen. Intjänat krediteras säljaren som vann kunden, oavsett vem
        som registrerade intäkten. Klicka på ett namn för personens profil och historik.
      </p>
    </section>
  );
}
