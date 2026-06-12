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
  varde: number;
}

interface LossReasonRow {
  orsak: string;
  antal: number;
}

interface StageDurationRow {
  steg: string;
  snitt_dagar: number;
  antal: number;
}

const AKTIVA_STATUSAR = ["ny", "kontaktad", "dialog", "mote"] as const;
const AKTIVA_LABELS: Record<(typeof AKTIVA_STATUSAR)[number], string> = {
  ny: "Ny",
  kontaktad: "Kontaktad",
  dialog: "Dialog",
  mote: "Möte",
};

/** Sannolikhetsvikt per status för den viktade pipelineprognosen. */
const VIKTER: Record<(typeof AKTIVA_STATUSAR)[number], number> = {
  ny: 0.1,
  kontaktad: 0.25,
  dialog: 0.5,
  mote: 0.75,
};

export default async function StatistikPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const period = parsePeriod((await searchParams).period);
  const { from, to } = periodRange(period);
  const supabase = await createSupabaseServerClient();

  const range = { p_from: from.toISOString(), p_to: to.toISOString() };
  const [statsRes, pipelineRes, lossRes, durationsRes] = await Promise.all([
    supabase.rpc("seller_stats", range),
    supabase.rpc("lead_owner_status_counts"),
    supabase.rpc("loss_reasons", range),
    supabase.rpc("stage_durations", range),
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

  // Pipeline-nuläget: aktiva leads (Ny–Möte) per ansvarig + otilldelade,
  // med affärsvärde per cell för prognosen.
  const pipeline = new Map<string, Record<string, { antal: number; varde: number }>>();
  for (const row of (pipelineRes.data ?? []) as OwnerStatusRow[]) {
    const key = row.owner_id ?? "";
    const bucket = pipeline.get(key) ?? {};
    bucket[row.status] = { antal: Number(row.antal), varde: Number(row.varde) };
    pipeline.set(key, bucket);
  }
  const aktiva = (ownerId: string, status: string) =>
    pipeline.get(ownerId)?.[status]?.antal ?? 0;
  const aktivaTotalt = (ownerId: string) =>
    AKTIVA_STATUSAR.reduce((sum, s) => sum + aktiva(ownerId, s), 0);
  const varde = (ownerId: string) =>
    AKTIVA_STATUSAR.reduce(
      (sum, s) => sum + (pipeline.get(ownerId)?.[s]?.varde ?? 0),
      0,
    );
  const otilldelade = aktivaTotalt("");

  // Prognosen summeras över ALLA ägare (även otilldelade leads).
  let pipelineVarde = 0;
  let viktatVarde = 0;
  for (const bucket of pipeline.values()) {
    for (const status of AKTIVA_STATUSAR) {
      const cell = bucket[status];
      if (!cell) continue;
      pipelineVarde += cell.varde;
      viktatVarde += cell.varde * VIKTER[status];
    }
  }

  // Tratt och analys ur periodens loggade händelser.
  const kontaktade = summa("kontaktade");
  const dialoger = summa("dialoger");
  const moten = summa("moten");
  const vunna = summa("vunna");
  const forlorade = summa("forlorade");
  const tratt = [
    { label: "Kontaktade", antal: kontaktade },
    { label: "Dialoger", antal: dialoger },
    { label: "Möten", antal: moten },
    { label: "Vunna", antal: vunna },
  ];
  const trattMax = Math.max(1, ...tratt.map((s) => s.antal));
  const winRate =
    vunna + forlorade > 0 ? Math.round((vunna / (vunna + forlorade)) * 100) : null;

  const lossReasons = ((lossRes.data ?? []) as LossReasonRow[]).map((row) => ({
    orsak: row.orsak,
    antal: Number(row.antal),
  }));
  const lossMax = Math.max(1, ...lossReasons.map((r) => r.antal));

  const durations = new Map(
    ((durationsRes.data ?? []) as StageDurationRow[]).map((row) => [
      row.steg,
      Number(row.snitt_dagar),
    ]),
  );
  const durationText = AKTIVA_STATUSAR.filter((s) => durations.has(s))
    .map((s) => `${AKTIVA_LABELS[s]} ${String(durations.get(s)).replace(".", ",")} d`)
    .join(" · ");

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

      <div className="analys-grid">
        <div className="card">
          <div className="card-head">
            <h2>Konverteringstratt</h2>
            <span className="small faint">
              {winRate === null ? "Ingen avgjord affär i perioden" : `Win rate ${winRate} %`}
            </span>
          </div>
          <div className="card-body">
            <div className="tratt">
              {tratt.map((steg, index) => {
                const prev = index === 0 ? null : tratt[index - 1].antal;
                const andel =
                  prev === null || prev === 0
                    ? null
                    : Math.round((steg.antal / prev) * 100);
                return (
                  <div className="t-rad" key={steg.label}>
                    <span className="t-label">{steg.label}</span>
                    <span className="t-bar">
                      <span
                        style={{ width: `${Math.round((steg.antal / trattMax) * 100)}%` }}
                      />
                    </span>
                    <span className="t-tal mono">
                      {fmtNumber(steg.antal)}
                      {andel !== null && (
                        <span className="faint"> ({andel} %)</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            {durationText && (
              <p className="small faint" style={{ margin: "12px 0 0" }}>
                Snitt-tid i steg innan vidareflytt: {durationText}.
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Förlustorsaker</h2>
            <span className="small faint">
              {forlorade > 0
                ? `${fmtNumber(forlorade)} förlorade i perioden`
                : "Inga förlorade i perioden"}
            </span>
          </div>
          <div className="card-body">
            {lossReasons.length === 0 ? (
              <p className="small faint" style={{ margin: 0 }}>
                När ett lead flyttas till Förlorad frågar appen alltid efter orsaken –
                topplistan över orsakerna hamnar här.
              </p>
            ) : (
              <div className="tratt">
                {lossReasons.map((reason) => (
                  <div className="t-rad" key={reason.orsak}>
                    <span className="t-label" title={reason.orsak}>
                      {reason.orsak}
                    </span>
                    <span className="t-bar forlust">
                      <span
                        style={{ width: `${Math.round((reason.antal / lossMax) * 100)}%` }}
                      />
                    </span>
                    <span className="t-tal mono">{fmtNumber(reason.antal)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
            {pipelineVarde > 0
              ? `Pipelinevärde ${fmtKr(pipelineVarde)} · viktat ≈ ${fmtKr(Math.round(viktatVarde))}`
              : "Sätt affärsvärden på bolagskorten så byggs prognosen här"}
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
                <th className="num" title="Summan av satta affärsvärden på aktiva leads">
                  Värde
                </th>
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
                  <td className="num">
                    {varde(row.user_id) > 0 ? fmtKr(varde(row.user_id)) : "–"}
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
                  <td className="num faint">{varde("") > 0 ? fmtKr(varde("")) : "–"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="small faint" style={{ marginTop: 10 }}>
        Kontaktade/Dialoger/Möten/Vunna räknar statusbyten i aktivitetsloggen – den som
        gör bytet får poängen. Intjänat krediteras säljaren som vann kunden, oavsett vem
        som registrerade intäkten. Viktade prognosen räknar affärsvärdena gånger
        sannolikhetsvikt per steg (Ny 10 % · Kontaktad 25 % · Dialog 50 % · Möte 75 %).
        Klicka på ett namn för personens profil och historik.
      </p>
    </section>
  );
}
