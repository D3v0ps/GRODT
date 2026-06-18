import { redirect } from "next/navigation";
import {
  PAGE_SIZE,
  listParamsToQuery,
  parseListParams,
  rpcArgs,
  type LeadListRow,
} from "@/lib/list-params";
import { displayYears, getSyncFilter, tableYearWindow } from "@/lib/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BolagTable } from "./bolag-table";

export const metadata = { title: "Bolag – GRODT" };

export default async function BolagPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseListParams(await searchParams);
  const supabase = await createSupabaseServerClient();
  const settings = await getSyncFilter(supabase);
  const yearWindow = tableYearWindow(settings);
  const qualYears = displayYears(settings);

  const offset = (params.sida - 1) * PAGE_SIZE;
  const [listRes, orterRes, usersRes, offTargetRes] = await Promise.all([
    supabase.rpc("list_leads", rpcArgs(params, yearWindow, PAGE_SIZE, offset)),
    supabase.rpc("lead_orter"),
    supabase.from("profiles").select("id, namn").eq("aktiv", true).order("namn"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("off_target_at", "is", null),
  ]);

  const rows = (listRes.data ?? []) as LeadListRow[];
  const total = rows[0]?.total_count ? Number(rows[0].total_count) : 0;
  const orter = (orterRes.data ?? []) as string[];
  const users = usersRes.data ?? [];
  const offTargetCount = offTargetRes.count ?? 0;

  // En sidlänk bortom sista sidan (t.ex. gammalt bokmärke efter att
  // filter ändrats) ska inte visa "Inga bolag" – gå till första sidan.
  if (rows.length === 0 && params.sida > 1) {
    const query = listParamsToQuery({ ...params, sida: 1 }).toString();
    redirect(`/bolag${query ? `?${query}` : ""}`);
  }

  return (
    <section className="view view-wide">
      <BolagTable
        rows={rows}
        total={total}
        params={params}
        years={yearWindow}
        qualYears={qualYears}
        threshold={settings.revenueMinSek}
        sniCodes={settings.sniCodes}
        orter={orter}
        users={users}
        offTargetCount={offTargetCount}
      />
    </section>
  );
}
