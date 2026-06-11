import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { fetchActivities } from "@/lib/activity";
import { activityTimelineText } from "@/lib/activity-text";
import { fmtDate, fmtDateTime, fmtKr } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { IconBack } from "@/components/icons";
import { KundActions, KundNoteForm, RevenueForm } from "./kund-actions";

export const metadata = { title: "Kund – GRODT" };

interface ProfileRef {
  namn: string;
}

function profileName(value: ProfileRef | ProfileRef[] | null): string | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0]?.namn ?? null) : value.namn;
}

export default async function KundDetaljPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createSupabaseServerClient();

  // Allt utom aktiviteterna är nyckelbart på id → en parallell omgång.
  const [customerRes, revenuesRes, notesRes, usersRes] = await Promise.all([
    supabase
      .from("customers")
      .select(
        "id, orgnr, status, controller_id, saljare_id, overlamnad_at, companies(namn, ort, sni_kod), saljare:profiles!customers_saljare_id_fkey(namn), controller:profiles!customers_controller_id_fkey(namn)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("customer_revenues")
      .select("id, amount_sek, beskrivning, datum, created_at, profiles(namn)")
      .eq("customer_id", id)
      .order("datum", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("customer_notes")
      .select("id, body, created_at, profiles(namn)")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, namn").eq("aktiv", true).order("namn"),
  ]);

  const customer = customerRes.data;
  if (!customer) notFound();

  const companies = customer.companies as
    | { namn: string; ort: string | null; sni_kod: string | null }
    | { namn: string; ort: string | null; sni_kod: string | null }[]
    | null;
  const company = Array.isArray(companies) ? companies[0] : companies;
  const namn = company?.namn ?? customer.orgnr;
  const saljareNamn = profileName(customer.saljare as ProfileRef | ProfileRef[] | null);
  const controllerNamn = profileName(customer.controller as ProfileRef | ProfileRef[] | null);

  const activities = await fetchActivities({
    entityType: "kund",
    entityId: customer.orgnr,
    limit: 30,
  });

  const revenues = revenuesRes.data ?? [];
  const notes = notesRes.data ?? [];
  const users = usersRes.data ?? [];
  const totalRevenue = revenues.reduce((sum, r) => sum + Number(r.amount_sek), 0);

  return (
    <section className="view">
      <Link className="backlink" href="/kunder">
        <IconBack />
        Tillbaka till kundlistan
      </Link>
      <div className="view-head">
        <div>
          <h1>{namn}</h1>
          <p className="lede">
            <span className="mono">{customer.orgnr}</span> · {company?.ort ?? "Okänd ort"} ·{" "}
            <Link href={`/bolag/${customer.orgnr}`}>Öppna bolagskortet</Link>
          </p>
        </div>
        <KundActions
          customerId={customer.id}
          status={customer.status}
          controllerId={customer.controller_id}
          users={users}
        />
      </div>

      <div className="detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div className="card">
            <div className="card-head">
              <h2>Intäkter</h2>
              <span className="small faint">Belopp i kr, hela teamet ser allt</span>
            </div>
            <div className="card-body">
              {revenues.length === 0 ? (
                <EmptyState
                  title="Inga intäkter registrerade"
                  description="Registrera vad ni fakturerat eller tjänat på kunden så syns totalsumman här och i topplistan."
                />
              ) : (
                <div className="table-wrap" style={{ margin: "-6px 0 6px" }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Datum</th>
                        <th>Beskrivning</th>
                        <th>Registrerad av</th>
                        <th className="num">Belopp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenues.map((r) => (
                        <tr key={r.id}>
                          <td className="mono small">{fmtDate(r.datum)}</td>
                          <td style={{ whiteSpace: "normal" }}>{r.beskrivning ?? "–"}</td>
                          <td>{profileName(r.profiles as ProfileRef | ProfileRef[] | null) ?? "–"}</td>
                          <td className="num">{fmtKr(Number(r.amount_sek))}</td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={3} style={{ fontWeight: 700 }}>
                          Totalt intjänat
                        </td>
                        <td className="num" style={{ fontWeight: 700 }}>
                          {fmtKr(totalRevenue)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              <RevenueForm customerId={customer.id} />
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Kommentarer</h2>
            </div>
            <div className="card-body">
              {notes.length === 0 ? (
                <EmptyState
                  title="Inga kommentarer ännu"
                  description="Kommentarer på kunden visas här för hela teamet, med namn på den som skrev."
                />
              ) : (
                <div>
                  {notes.map((note) => (
                    <div className="note" key={note.id}>
                      <div>{note.body}</div>
                      <div className="n-meta">
                        {fmtDateTime(note.created_at)} ·{" "}
                        {profileName(note.profiles as ProfileRef | ProfileRef[] | null) ?? "Okänd"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <KundNoteForm customerId={customer.id} />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div className="card">
            <div className="card-head">
              <h2>Kundfakta</h2>
            </div>
            <div className="card-body">
              <div className="facts" style={{ gridTemplateColumns: "1fr" }}>
                <div className="fact">
                  <div className="k">Totalt intjänat</div>
                  <div className="v mono" style={{ fontSize: 20, fontWeight: 600 }}>
                    {fmtKr(totalRevenue)}
                  </div>
                </div>
                <div className="fact">
                  <div className="k">Säljare (vann affären)</div>
                  <div className="v">{saljareNamn ?? "–"}</div>
                </div>
                <div className="fact">
                  <div className="k">Controller</div>
                  <div className="v">{controllerNamn ?? "Ej tilldelad"}</div>
                </div>
                <div className="fact">
                  <div className="k">Överlämnad</div>
                  <div className="v mono">{fmtDate(customer.overlamnad_at)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Aktivitet</h2>
            </div>
            <div className="card-body">
              {activities.length === 0 ? (
                <EmptyState
                  title="Ingen aktivitet ännu"
                  description="Statusbyten, intäkter och kommentarer loggas här."
                />
              ) : (
                <div className="timeline">
                  {activities.map((a) => (
                    <div className="t-item" key={a.id}>
                      <span
                        className="t-dot"
                        style={
                          a.action === "kund_intakt"
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
