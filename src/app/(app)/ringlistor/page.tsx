import { getSessionProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RinglistorList, type CallListRow } from "./ringlistor-list";

export const metadata = { title: "Ringlistor – GRODT" };

interface OverviewRow {
  id: string;
  namn: string;
  created_by: string | null;
  created_by_namn: string | null;
  created_at: string;
  antal: number;
  ringda: number;
}

export default async function RinglistorPage() {
  const supabase = await createSupabaseServerClient();
  const [profile, overviewRes] = await Promise.all([
    getSessionProfile(),
    supabase.rpc("call_list_overview"),
  ]);

  const rows: CallListRow[] = ((overviewRes.data ?? []) as OverviewRow[]).map((row) => ({
    id: row.id,
    namn: row.namn,
    createdBy: row.created_by,
    createdByNamn: row.created_by_namn,
    createdAt: row.created_at,
    antal: Number(row.antal),
    ringda: Number(row.ringda),
  }));

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h1>Ringlistor</h1>
          <p className="lede">
            Sparade urval ur bolagslistan som teamet betar av tillsammans – bocka av
            medan ni ringer.
          </p>
        </div>
      </div>
      <RinglistorList
        rows={rows}
        currentUserId={profile?.userId ?? ""}
        isAdmin={profile?.roll === "admin"}
      />
    </section>
  );
}
