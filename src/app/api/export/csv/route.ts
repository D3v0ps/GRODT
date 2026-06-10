import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { getSessionProfile } from "@/lib/auth";
import { statusLabel } from "@/lib/constants";
import { toCsv } from "@/lib/csv-export";
import { fmtDate } from "@/lib/format";
import {
  parseListParams,
  rpcArgs,
  type LeadListRow,
} from "@/lib/list-params";
import { displayYears, getSyncFilter } from "@/lib/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const EXPORT_MAX_ROWS = 100_000;

/**
 * CSV-export av bolagslistan. Tar emot samma frågeparametrar som
 * listvyn och respekterar därmed alltid de aktiva filtren. RLS gäller
 * (användarens klient), och exporten skrivs till audit-loggen.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  }

  const params = parseListParams(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  const supabase = await createSupabaseServerClient();
  const settings = await getSyncFilter(supabase);
  const years = displayYears(settings);

  const { data, error } = await supabase.rpc(
    "list_leads",
    rpcArgs(params, years, EXPORT_MAX_ROWS, 0),
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as LeadListRow[];

  const csv = toCsv([
    [
      "Bolagsnamn",
      "Orgnr",
      "Ort",
      `Omsättning ${years[0]} (kr)`,
      `Omsättning ${years[1]} (kr)`,
      "Anställda",
      "Status",
      "Ansvarig",
    ],
    ...rows.map((row) => [
      row.namn,
      row.orgnr,
      row.ort,
      row.oms1,
      row.oms2,
      row.antal_anstallda,
      statusLabel(row.status),
      row.owner_namn ?? "",
    ]),
  ]);

  await logActivity({
    actorId: session.userId,
    entityType: "synk",
    entityId: "csv-export",
    action: "export",
    payload: {
      rader: rows.length,
      filter: Object.fromEntries(request.nextUrl.searchParams.entries()),
    },
  });

  const filename = `grodt-bolag-${fmtDate(new Date())}.csv`;
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
