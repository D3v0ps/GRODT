import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { getSessionProfile } from "@/lib/auth";
import { kundStatusLabel } from "@/lib/constants";
import { toCsv } from "@/lib/csv-export";
import { parseKundParams, type CustomerListRow } from "@/lib/customer-params";
import { fmtDate } from "@/lib/format";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const EXPORT_MAX_ROWS = 100_000;

/**
 * CSV-export av kundlistan – samma frågeparametrar som kundvyn, så att
 * exporten respekterar de aktiva filtren. RLS gäller (användarens
 * klient) och exporten audit-loggas, precis som bolagsexporten.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  }

  // Delar exportbudgeten med övriga exporter (5 per minut och användare).
  const limit = checkRateLimit(`export:${session.userId}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `För många exporter – vänta ${limit.retryAfterSeconds} s` },
      { status: 429 },
    );
  }

  const params = parseKundParams(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_customers", {
    p_search: params.sok || null,
    p_status: params.status ?? null,
    p_controller: params.controller ?? null,
    p_sort: params.sort,
    p_dir: params.dir,
    p_limit: EXPORT_MAX_ROWS,
    p_offset: 0,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as CustomerListRow[];

  const csv = toCsv([
    [
      "Bolagsnamn",
      "Orgnr",
      "Ort",
      "Status",
      "Säljare",
      "Controller",
      "Överlämnad",
      "Intjänat totalt (kr)",
    ],
    ...rows.map((row) => [
      row.namn,
      row.orgnr,
      row.ort,
      kundStatusLabel(row.status),
      row.saljare_namn ?? "",
      row.controller_namn ?? "",
      fmtDate(row.overlamnad_at),
      Number(row.intjanat),
    ]),
  ]);

  await logActivity({
    actorId: session.userId,
    entityType: "synk",
    entityId: "csv-export",
    action: "export",
    payload: {
      typ: "kunder",
      rader: rows.length,
      filter: Object.fromEntries(request.nextUrl.searchParams.entries()),
    },
  });

  const filename = `grodt-kunder-${fmtDate(new Date())}.csv`;
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
