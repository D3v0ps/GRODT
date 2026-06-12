import Link from "next/link";
import { z } from "zod";
import { fetchActivities } from "@/lib/activity";
import { ACTIVITY_ACTIONS } from "@/lib/activity-actions";
import { actionLabel, activityDetail } from "@/lib/activity-text";
import { getSessionProfile } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/empty-state";
import { AdminUsers, type AdminUserRow } from "./admin-users";
import { AuditFilter } from "./audit-filter";

export const metadata = { title: "Admin – GRODT" };

const LOG_PAGE_SIZE = 100;

const filterSchema = z.object({
  anvandare: z.union([z.uuid(), z.literal("system")]).optional(),
  handling: z.enum(ACTIVITY_ACTIONS).optional(),
  datum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sida: z.coerce.number().int().min(1).optional().default(1),
});

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionProfile();
  if (!session) return null;

  if (session.roll !== "admin") {
    return (
      <section className="view">
        <div className="view-head">
          <div>
            <h1>Admin</h1>
            <p className="lede">Användarhantering och global audit log.</p>
          </div>
        </div>
        <div className="card">
          <EmptyState
            title="Endast administratörer"
            description="Du behöver adminrollen för att hantera användare och se den globala loggen."
          />
        </div>
      </section>
    );
  }

  const raw = await searchParams;
  const filters = filterSchema.safeParse({
    anvandare: typeof raw.anvandare === "string" ? raw.anvandare : undefined,
    handling: typeof raw.handling === "string" ? raw.handling : undefined,
    datum: typeof raw.datum === "string" ? raw.datum : undefined,
    sida: typeof raw.sida === "string" ? raw.sida : undefined,
  });
  const anvandare = filters.success ? filters.data.anvandare : undefined;
  const handling = filters.success ? filters.data.handling : undefined;
  const datum = filters.success ? filters.data.datum : undefined;
  const sida = filters.success ? filters.data.sida : 1;

  // Admin-API:t behövs för e-postadresser (profiles innehåller inga).
  const admin = createSupabaseAdminClient();
  const [profilesRes, authUsersRes, activities] = await Promise.all([
    admin.from("profiles").select("id, namn, roll, aktiv").order("namn"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    fetchActivities({
      actorId: anvandare,
      action: handling,
      date: datum,
      limit: LOG_PAGE_SIZE,
      offset: (sida - 1) * LOG_PAGE_SIZE,
    }),
  ]);

  const logQuery = (page: number) => {
    const q = new URLSearchParams();
    if (anvandare) q.set("anvandare", anvandare);
    if (handling) q.set("handling", handling);
    if (datum) q.set("datum", datum);
    if (page > 1) q.set("sida", String(page));
    const s = q.toString();
    return `/admin${s ? `?${s}` : ""}`;
  };

  const emailById = new Map(
    (authUsersRes.data?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );
  const users: AdminUserRow[] = (profilesRes.data ?? []).map((p) => ({
    id: p.id,
    namn: p.namn,
    email: emailById.get(p.id) ?? "",
    roll: p.roll === "admin" || p.roll === "controller" ? p.roll : "saljare",
    aktiv: p.aktiv,
  }));

  return (
    <section className="view">
      <AdminUsers users={users} currentUserId={session.userId} />

      <div className="table-shell">
        <div className="table-toolbar">
          <strong style={{ fontSize: 13 }}>Audit log</strong>
          <span className="spacer" />
          <AuditFilter
            users={users.map((u) => ({ id: u.id, namn: u.namn }))}
            selectedUser={anvandare ?? ""}
            selectedAction={handling ?? ""}
            selectedDate={datum ?? ""}
          />
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Tidpunkt</th>
                <th>Användare</th>
                <th>Handling</th>
                <th>Detalj</th>
              </tr>
            </thead>
            <tbody>
              {activities.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ height: "auto", whiteSpace: "normal" }}>
                    <EmptyState
                      title="Inga loggrader"
                      description="Inga händelser matchar filtret. Varje mutation i systemet loggas här."
                    />
                  </td>
                </tr>
              ) : (
                activities.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{fmtDateTime(a.created_at)}</td>
                    <td>{a.actor_namn ?? "Systemet"}</td>
                    <td>
                      <span className="pill">{actionLabel(a.action)}</span>
                    </td>
                    <td style={{ whiteSpace: "normal" }}>
                      {activityDetail(a.action, a.payload)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <span>
            {activities.length > 0 &&
              `Visar ${(sida - 1) * LOG_PAGE_SIZE + 1}–${(sida - 1) * LOG_PAGE_SIZE + activities.length}`}
          </span>
          <span className="pages">
            {sida > 1 && (
              <Link href={logQuery(sida - 1)} aria-label="Nyare händelser">
                ← Nyare
              </Link>
            )}
            {activities.length === LOG_PAGE_SIZE && (
              <Link href={logQuery(sida + 1)} aria-label="Äldre händelser">
                Äldre →
              </Link>
            )}
          </span>
        </div>
      </div>
    </section>
  );
}
