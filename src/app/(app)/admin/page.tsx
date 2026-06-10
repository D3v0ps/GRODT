import { z } from "zod";
import { fetchActivities } from "@/lib/activity";
import { actionLabel, activityDetail } from "@/lib/activity-text";
import { getSessionProfile } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/empty-state";
import { AdminUsers, type AdminUserRow } from "./admin-users";
import { AuditFilter } from "./audit-filter";

export const metadata = { title: "Admin – GRODT" };

const filterSchema = z.object({
  anvandare: z.uuid().optional(),
  datum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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
    datum: typeof raw.datum === "string" ? raw.datum : undefined,
  });
  const anvandare = filters.success ? filters.data.anvandare : undefined;
  const datum = filters.success ? filters.data.datum : undefined;

  // Admin-API:t behövs för e-postadresser (profiles innehåller inga).
  const admin = createSupabaseAdminClient();
  const [profilesRes, authUsersRes, activities] = await Promise.all([
    admin.from("profiles").select("id, namn, roll, aktiv").order("namn"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    fetchActivities({ actorId: anvandare, date: datum, limit: 100 }),
  ]);

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
      </div>
    </section>
  );
}
