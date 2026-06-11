import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchActivities } from "@/lib/activity";
import { activityTimelineText } from "@/lib/activity-text";
import { sniLabel } from "@/lib/constants";
import { fmtDate, fmtDateTime, fmtKr } from "@/lib/format";
import { providerLabel } from "@/lib/providers";
import { displayYears, getSyncFilter } from "@/lib/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { IconBack } from "@/components/icons";
import { DetailActions } from "./detail-actions";
import { HandoffPanel } from "./handoff-panel";
import { NoteForm } from "./note-form";
import { TrendChart } from "./trend-chart";

export const metadata = { title: "Bolagsdetalj – GRODT" };

interface NoteRow {
  id: string;
  body: string;
  created_at: string;
  profiles: { namn: string } | { namn: string }[] | null;
}

export default async function BolagDetaljPage({
  params,
}: {
  params: Promise<{ orgnr: string }>;
}) {
  const { orgnr: rawOrgnr } = await params;
  const orgnr = decodeURIComponent(rawOrgnr);
  const supabase = await createSupabaseServerClient();

  // Allt är nyckelbart på orgnr → en enda parallell omgång databasanrop.
  const [
    companyRes,
    settings,
    financialsRes,
    leadRes,
    usersRes,
    customerRes,
    notesRes,
    activities,
  ] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "orgnr, namn, sni_kod, ort, adress, antal_anstallda, hemsida, telefon, kalla, last_synced_at",
      )
      .eq("orgnr", orgnr)
      .maybeSingle(),
    getSyncFilter(supabase),
    supabase
      .from("company_financials")
      .select("year, revenue_sek, profit_sek, employees")
      .eq("orgnr", orgnr)
      .order("year"),
    supabase
      .from("leads")
      .select("id, status, owner_id")
      .eq("orgnr", orgnr)
      .maybeSingle(),
    supabase.from("profiles").select("id, namn").eq("aktiv", true).order("namn"),
    supabase.from("customers").select("id").eq("orgnr", orgnr).maybeSingle(),
    supabase
      .from("notes")
      .select("id, body, created_at, profiles(namn), leads!inner(orgnr)")
      .eq("leads.orgnr", orgnr)
      .order("created_at", { ascending: false }),
    fetchActivities({ entityType: "lead", entityId: orgnr, limit: 30 }),
  ]);

  const company = companyRes.data;
  if (!company) notFound();

  const years = displayYears(settings);
  const financials = financialsRes.data ?? [];
  const lead = leadRes.data ?? null;
  const users = usersRes.data ?? [];
  const customer = customerRes.data ?? null;
  const notes = (notesRes.data ?? []) as unknown as NoteRow[];

  const omsByYear = new Map(financials.map((f) => [f.year, f.revenue_sek]));
  const oms1 = omsByYear.get(years[0]) ?? null;
  const oms2 = omsByYear.get(years[1]) ?? null;

  return (
    <section className="view">
      <Link className="backlink" href="/bolag">
        <IconBack />
        Tillbaka till bolagslistan
      </Link>
      <div className="view-head">
        <div>
          <h1>{company.namn}</h1>
          <p className="lede">
            <span className="mono">{company.orgnr}</span> · {company.ort ?? "Okänd ort"} · SNI{" "}
            {company.sni_kod ?? "–"}
          </p>
        </div>
        {lead ? (
          <DetailActions
            leadId={lead.id}
            status={lead.status}
            ownerId={lead.owner_id}
            users={users}
          />
        ) : (
          <span className="pill">
            <span className="dot" style={{ background: "var(--ink-3)" }} />
            Utanför filtret – inget lead
          </span>
        )}
      </div>

      {lead?.status === "kund" && (
        <HandoffPanel orgnr={orgnr} customerId={customer?.id ?? null} controllers={users} />
      )}

      <div className="detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div className="card">
            <div className="card-head">
              <h2>Bolagsfakta</h2>
              <span className="small faint">
                Källa: {providerLabel(company.kalla)} ·{" "}
                {company.last_synced_at ? fmtDate(company.last_synced_at) : "–"}
              </span>
            </div>
            <div className="card-body">
              <div className="facts">
                <div className="fact">
                  <div className="k">Organisationsnummer</div>
                  <div className="v mono">{company.orgnr}</div>
                </div>
                <div className="fact">
                  <div className="k">Bransch</div>
                  <div className="v">{sniLabel(company.sni_kod)}</div>
                </div>
                <div className="fact">
                  <div className="k">Omsättning {years[0]}</div>
                  <div className="v mono">{oms1 === null ? "Uppgift saknas" : fmtKr(oms1)}</div>
                </div>
                <div className="fact">
                  <div className="k">Omsättning {years[1]}</div>
                  <div className="v mono">{oms2 === null ? "Uppgift saknas" : fmtKr(oms2)}</div>
                </div>
                <div className="fact">
                  <div className="k">Anställda</div>
                  <div className="v">
                    {company.antal_anstallda === null ? "–" : `${company.antal_anstallda} st`}
                  </div>
                </div>
                <div className="fact">
                  <div className="k">Adress</div>
                  <div className="v">
                    {[company.adress, company.ort].filter(Boolean).join(", ") || "–"}
                  </div>
                </div>
                <div className="fact">
                  <div className="k">Hemsida</div>
                  <div className="v">
                    {company.hemsida ? (
                      <a href={company.hemsida} target="_blank" rel="noreferrer">
                        {company.hemsida.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      "–"
                    )}
                  </div>
                </div>
                <div className="fact">
                  <div className="k">Telefon</div>
                  <div className="v mono">{company.telefon ?? "–"}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Omsättningstrend</h2>
              <span className="small faint">Tröskel {fmtKr(settings.revenueMinSek)} streckad</span>
            </div>
            <div className="card-body" style={{ paddingTop: 30 }}>
              {financials.length === 0 ? (
                <EmptyState
                  title="Inga bokslutssiffror"
                  description="Det finns inga omsättningsuppgifter för bolaget ännu – kör en synk eller importera siffror via CSV."
                />
              ) : (
                <TrendChart
                  years={financials.map((f) => ({ year: f.year, revenueSek: f.revenue_sek }))}
                  threshold={settings.revenueMinSek}
                />
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Anteckningar</h2>
            </div>
            <div className="card-body">
              {lead ? (
                <>
                  {notes.length === 0 ? (
                    <EmptyState
                      title="Inga anteckningar ännu"
                      description="Anteckningar du sparar på ett bolag visas här för hela teamet."
                    />
                  ) : (
                    <div>
                      {notes.map((note) => {
                        const profiles = note.profiles;
                        const author = Array.isArray(profiles)
                          ? profiles[0]?.namn
                          : profiles?.namn;
                        return (
                          <div className="note" key={note.id}>
                            <div>{note.body}</div>
                            <div className="n-meta">
                              {fmtDateTime(note.created_at)} · {author ?? "Okänd"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <NoteForm leadId={lead.id} />
                </>
              ) : (
                <EmptyState
                  title="Inget lead för bolaget"
                  description="Bolaget ligger utanför omsättningsfiltret. Anteckningar kan bara sparas på leads."
                />
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Status &amp; aktivitet</h2>
          </div>
          <div className="card-body">
            {activities.length === 0 ? (
              <EmptyState
                title="Ingen aktivitet ännu"
                description="Statusbyten, tilldelningar och anteckningar loggas här."
              />
            ) : (
              <div className="timeline">
                {activities.map((a) => (
                  <div className="t-item" key={a.id}>
                    <span
                      className="t-dot"
                      style={
                        a.action === "status_andrad"
                          ? { background: "var(--accent)" }
                          : undefined
                      }
                    />
                    <div>
                      <div className="t-body">{activityTimelineText(a.action, a.payload)}</div>
                      <div className="t-meta">
                        {fmtDateTime(a.created_at)} · {a.actor_namn ?? "Systemet"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
