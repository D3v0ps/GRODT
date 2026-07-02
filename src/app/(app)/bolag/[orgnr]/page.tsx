import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchActivities } from "@/lib/activity";
import { activityTimelineText } from "@/lib/activity-text";
import { getSessionProfile } from "@/lib/auth";
import { branschKlassLabel, sniLabel } from "@/lib/constants";
import { fmtDate, fmtDateTime, fmtKr, fmtPercent } from "@/lib/format";
import { likelyStaffing } from "@/lib/target";
import { providerLabel } from "@/lib/providers";
import { displayYears, getSyncFilter } from "@/lib/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { IconBack, IconError, IconFlame, IconInfo } from "@/components/icons";
import { ContactsCard, type ContactRow } from "./contacts-card";
import { DealValueCard } from "./deal-value-card";
import { DetailActions } from "./detail-actions";
import { FollowUpCard } from "./follow-up-card";
import { GoogleEnrichButton } from "./google-enrich-button";
import { HandoffPanel } from "./handoff-panel";
import { NoteForm } from "./note-form";
import { TargetControls } from "./target-controls";
import { TrendChart } from "./trend-chart";

export const metadata = { title: "Bolagsdetalj – GRODT" };

interface NoteRow {
  id: string;
  body: string;
  created_at: string;
  profiles: { namn: string } | { namn: string }[] | null;
}

interface ProfileRef {
  namn: string;
}

function profileName(value: ProfileRef | ProfileRef[] | null | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0]?.namn ?? null) : value.namn;
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
    session,
    companyRes,
    settings,
    financialsRes,
    leadRes,
    usersRes,
    customerRes,
    contactsRes,
    notesRes,
    activities,
  ] = await Promise.all([
    getSessionProfile(),
    supabase
      .from("companies")
      .select(
        "orgnr, namn, sni_kod, ort, adress, antal_anstallda, hemsida, telefon, telefon_kalla, hemsida_kalla, kalla, last_synced_at, verksamhetsbeskrivning, registreringsdatum, bolagsform, avregistrerad_datum, reklamsparr, bransch_klass",
      )
      .eq("orgnr", orgnr)
      .maybeSingle(),
    getSyncFilter(supabase),
    supabase
      .from("company_financials")
      .select("year, revenue_sek, profit_sek, employees, soliditet")
      .eq("orgnr", orgnr)
      .order("year"),
    supabase
      .from("leads")
      .select(
        "id, status, owner_id, follow_up_at, follow_up_note, follow_up_user, deal_value_sek, off_target_at, off_target_sni, target_kept, fu:profiles!leads_follow_up_user_fkey(namn)",
      )
      .eq("orgnr", orgnr)
      .maybeSingle(),
    supabase.from("profiles").select("id, namn").eq("aktiv", true).order("namn"),
    supabase.from("customers").select("id").eq("orgnr", orgnr).maybeSingle(),
    supabase
      .from("company_contacts")
      .select("id, namn, titel, telefon, epost, anteckning, kalla")
      .eq("orgnr", orgnr)
      .order("created_at", { ascending: true }),
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
  const contacts = (contactsRes.data ?? []) as ContactRow[];
  const notes = (notesRes.data ?? []) as unknown as NoteRow[];

  const omsByYear = new Map(financials.map((f) => [f.year, f.revenue_sek]));
  const oms1 = omsByYear.get(years[0]) ?? null;
  const oms2 = omsByYear.get(years[1]) ?? null;

  // Hälsotal ur senaste året med kompletta siffror.
  const latestWithProfit = [...financials]
    .reverse()
    .find((f) => f.revenue_sek !== null && f.revenue_sek > 0 && f.profit_sek !== null);
  const margin = latestWithProfit
    ? (Number(latestWithProfit.profit_sek) / Number(latestWithProfit.revenue_sek)) * 100
    : null;
  const latestSolidity = [...financials].reverse().find((f) => f.soliditet !== null);
  const tillvaxt =
    oms1 !== null && oms1 > 0 && oms2 !== null
      ? ((Number(oms2) - Number(oms1)) / Number(oms1)) * 100
      : null;
  const companyAge = company.registreringsdatum
    ? Math.floor(
        (Date.now() - new Date(company.registreringsdatum).getTime()) / (365.25 * 86_400_000),
      )
    : null;
  const sniMismatch =
    company.sni_kod !== null &&
    settings.sniCodes.length > 0 &&
    !settings.sniCodes.some(
      (c) => c.replace(/\D/g, "") === (company.sni_kod ?? "").replace(/\D/g, ""),
    );

  return (
    <section className="view">
      <Link className="backlink" href="/bolag">
        <IconBack />
        Tillbaka till bolagslistan
      </Link>
      <div className="view-head">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {company.namn}
            {!company.avregistrerad_datum && company.bransch_klass === "arbetsformedling" && (
              <span
                className="flame-wrap"
                title="AI-bedömd: bolaget kör arbetsförmedling/rekrytering – rätt målgrupp"
              >
                <IconFlame className="flame flame-lg" />
                <span className="sr-only">Bedömd arbetsförmedling</span>
              </span>
            )}
          </h1>
          <p className="lede">
            <span className="mono">{company.orgnr}</span> · {company.ort ?? "Okänd ort"} · SNI{" "}
            {company.sni_kod ?? "–"}
          </p>
        </div>
        {lead ? (
          <DetailActions
            leadId={lead.id}
            companyName={company.namn}
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

      {company.avregistrerad_datum && (
        <div className="banner error" style={{ marginBottom: 14 }}>
          <IconError />
          <span>
            <strong>Avregistrerat bolag:</strong> avregistrerat hos Bolagsverket{" "}
            {fmtDate(company.avregistrerad_datum)}. Leadet markeras automatiskt som Förlorad.
          </span>
        </div>
      )}
      {!company.avregistrerad_datum && sniMismatch && lead && !lead.off_target_at && (
        <div className="banner info" style={{ marginBottom: 14 }}>
          <IconInfo />
          <span>
            <strong>Behållet trots målbilden:</strong> Bolagsverket anger{" "}
            {sniLabel(company.sni_kod)} som bransch – er målbild är{" "}
            {settings.sniCodes.map((c) => sniLabel(c)).join(", ")}. Leadet ligger kvar i
            pipelinen efter ett manuellt val.
          </span>
        </div>
      )}
      {!company.avregistrerad_datum && sniMismatch && !lead && (
        <div className="banner info" style={{ marginBottom: 14 }}>
          <IconInfo />
          <span>
            <strong>Utanför målbilden:</strong> Bolagsverket anger {sniLabel(company.sni_kod)} som
            bransch – er målbild är {settings.sniCodes.map((c) => sniLabel(c)).join(", ")}.
          </span>
        </div>
      )}
      {lead && (
        <TargetControls
          leadId={lead.id}
          offTarget={lead.off_target_at !== null}
          offTargetSni={lead.off_target_sni}
          likelyStaffing={
            !lead.off_target_at &&
            !sniMismatch &&
            likelyStaffing(company.namn, company.verksamhetsbeskrivning)
          }
        />
      )}

      {lead?.status === "kund" && (
        <HandoffPanel orgnr={orgnr} customerId={customer?.id ?? null} controllers={users} />
      )}

      <div className="detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div className="card">
            <div className="card-head">
              <h2>Bolagsfakta</h2>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                {(!company.telefon || !company.hemsida) && (
                  <GoogleEnrichButton orgnr={company.orgnr} />
                )}
                <span className="small faint">
                  Källa: {providerLabel(company.kalla)} ·{" "}
                  {company.last_synced_at ? fmtDate(company.last_synced_at) : "–"}
                </span>
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
                  <div className="v">
                    {sniLabel(company.sni_kod)}
                    {branschKlassLabel(company.bransch_klass) && (
                      <span className="faint small" style={{ display: "block" }}>
                        Bedömning: {branschKlassLabel(company.bransch_klass)}
                      </span>
                    )}
                  </div>
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
                      <>
                        <a href={company.hemsida} target="_blank" rel="noreferrer">
                          {company.hemsida.replace(/^https?:\/\//, "")}
                        </a>
                        {company.hemsida_kalla === "google" && (
                          <span className="faint small"> · via Google</span>
                        )}
                      </>
                    ) : (
                      "–"
                    )}
                  </div>
                </div>
                <div className="fact">
                  <div className="k">Telefon</div>
                  <div className="v mono">
                    {company.telefon ? (
                      <>
                        <a href={`tel:${company.telefon}`}>{company.telefon}</a>
                        {company.telefon_kalla === "google" && (
                          <span
                            className="faint small"
                            style={{ fontFamily: "var(--font-ui)" }}
                            title="Numret kommer från bolagets publika Google-profil och är ofta en växel – inte ett verifierat direktnummer"
                          >
                            {" "}
                            · via Google, kan vara växelnummer
                          </span>
                        )}
                      </>
                    ) : (
                      "–"
                    )}
                  </div>
                </div>
                <div className="fact">
                  <div className="k">Registrerat</div>
                  <div className="v">
                    {company.registreringsdatum ? (
                      <>
                        <span className="mono">{fmtDate(company.registreringsdatum)}</span>
                        {companyAge !== null && ` (${companyAge} år)`}
                      </>
                    ) : (
                      "–"
                    )}
                  </div>
                </div>
                <div className="fact">
                  <div className="k">Bolagsform</div>
                  <div className="v">
                    {company.bolagsform ?? "–"}
                    {company.reklamsparr && (
                      <span
                        className="badge st-kontaktad"
                        style={{ marginLeft: 8 }}
                        title="Bolaget har reklamspärr registrerad hos Bolagsverket – undvik oadresserade utskick"
                      >
                        <span className="dot" />
                        Reklamspärr
                      </span>
                    )}
                  </div>
                </div>
                <div className="fact">
                  <div className="k">Tillväxt {years[0]}–{years[1]}</div>
                  <div
                    className="v mono"
                    style={tillvaxt !== null && tillvaxt > 0 ? { color: "var(--ok)" } : undefined}
                  >
                    {tillvaxt === null ? "–" : fmtPercent(tillvaxt, { sign: true })}
                  </div>
                </div>
                <div className="fact">
                  <div className="k">
                    Vinstmarginal{latestWithProfit ? ` ${latestWithProfit.year}` : ""}
                  </div>
                  <div className="v mono">
                    {margin === null ? "–" : fmtPercent(margin)}
                  </div>
                </div>
                <div className="fact">
                  <div className="k">
                    Soliditet{latestSolidity ? ` ${latestSolidity.year}` : ""}
                  </div>
                  <div className="v mono">
                    {latestSolidity ? fmtPercent(Number(latestSolidity.soliditet)) : "–"}
                  </div>
                </div>
              </div>
              {company.verksamhetsbeskrivning && (
                <div style={{ marginTop: 16 }}>
                  <div className="fact">
                    <div className="k">Verksamhetsbeskrivning (Bolagsverket)</div>
                    <div className="v" style={{ whiteSpace: "pre-wrap" }}>
                      {company.verksamhetsbeskrivning}
                    </div>
                  </div>
                </div>
              )}
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

        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <ContactsCard orgnr={orgnr} contacts={contacts} />
        {lead && session && (
          <FollowUpCard
            leadId={lead.id}
            followUpAt={lead.follow_up_at}
            followUpNote={lead.follow_up_note}
            followUpUserNamn={profileName(lead.fu as ProfileRef | ProfileRef[] | null)}
            currentUserId={session.userId}
            users={users}
          />
        )}
        {lead && (
          <DealValueCard
            leadId={lead.id}
            valueSek={lead.deal_value_sek === null ? null : Number(lead.deal_value_sek)}
          />
        )}
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
      </div>
    </section>
  );
}
