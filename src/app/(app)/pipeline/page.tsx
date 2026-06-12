import Link from "next/link";
import { daysSince } from "@/lib/format";
import {
  parseListParams,
  rpcArgs,
  type LeadListRow,
} from "@/lib/list-params";
import { getSyncFilter, tableYearWindow } from "@/lib/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { Kanban, type KanbanCard } from "./kanban";

export const metadata = { title: "Pipeline – GRODT" };

const KANBAN_LIMIT = 2000;

export default async function PipelinePage() {
  const supabase = await createSupabaseServerClient();
  const settings = await getSyncFilter(supabase);
  const years = tableYearWindow(settings);

  const { data } = await supabase.rpc(
    "list_leads",
    rpcArgs(parseListParams({}), years, KANBAN_LIMIT, 0),
  );
  const rows = (data ?? []) as LeadListRow[];

  const cards: KanbanCard[] = rows.map((row) => {
    const oms = [row.oms1, row.oms2, row.oms3, row.oms4].filter(
      (v): v is number => v !== null,
    );
    return {
      leadId: row.lead_id,
      orgnr: row.orgnr,
      namn: row.namn,
      ort: row.ort,
      status: row.status,
      ownerId: row.owner_id,
      ownerNamn: row.owner_namn,
      maxOms: oms.length === 0 ? null : Math.max(...oms),
      dagar: daysSince(row.updated_at),
      followUpAt: row.follow_up_at,
      dealValue: row.deal_value_sek === null ? null : Number(row.deal_value_sek),
    };
  });

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
