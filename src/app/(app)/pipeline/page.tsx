import Link from "next/link";
import { daysSince } from "@/lib/format";
import {
  parseListParams,
  rpcArgs,
  type LeadListRow,
} from "@/lib/list-params";
import { displayYears, getSyncFilter } from "@/lib/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { Kanban, type KanbanCard } from "./kanban";

export const metadata = { title: "Pipeline – GRODT" };

const KANBAN_LIMIT = 2000;

export default async function PipelinePage() {
  const supabase = await createSupabaseServerClient();
  const settings = await getSyncFilter(supabase);
  const years = displayYears(settings);

  const { data } = await supabase.rpc(
    "list_leads",
    rpcArgs(parseListParams({}), years, KANBAN_LIMIT, 0),
  );
  const rows = (data ?? []) as LeadListRow[];

  const cards: KanbanCard[] = rows.map((row) => ({
    leadId: row.lead_id,
    orgnr: row.orgnr,
    namn: row.namn,
    ort: row.ort,
    status: row.status,
    ownerId: row.owner_id,
    ownerNamn: row.owner_namn,
    maxOms:
      row.oms1 === null && row.oms2 === null
        ? null
        : Math.max(row.oms1 ?? 0, row.oms2 ?? 0),
    dagar: daysSince(row.updated_at),
  }));

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h1>Pipeline</h1>
          <p className="lede">
            Dra kort mellan kolumnerna för att byta status. Dubbelklicka för bolagsdetalj.
          </p>
        </div>
      </div>
      {cards.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Pipelinen är tom"
            description="Importera bolag via CSV eller kör en synk så dyker leads upp här."
            action={
              <Link className="btn btn-sm" href="/synk">
                Till Import &amp; synk
              </Link>
            }
          />
        </div>
      ) : (
        <Kanban cards={cards} />
      )}
    </section>
  );
}
