import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity";
import { getSessionProfile } from "@/lib/auth";
import { kundStatusLabel } from "@/lib/constants";
import { toCsv } from "@/lib/csv-export";
import { fmtDate } from "@/lib/format";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const EXPORT_MAX_ROWS = 100_000;

interface RevenueExportRow {
  amount_sek: number;
  beskrivning: string | null;
  datum: string;
  profiles: { namn: string } | { namn: string }[] | null;
  customers:
    | {
        orgnr: string;
        status: string;
        companies: { namn: string } | { namn: string }[] | null;
      }
    | {
        orgnr: string;
        status: string;
        companies: { namn: string } | { namn: string }[] | null;
      }[]
    | null;
}

function one<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * CSV-export av alla intäktsposter (för bokföring/månadsrapport):
 * en rad per registrerad intäkt med bolag, belopp, datum och vem som
 * registrerade den. RLS gäller och exporten audit-loggas.
 */
export async function GET() {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  }

  const limit = checkRateLimit(`export:${session.userId}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `För många exporter – vänta ${limit.retryAfterSeconds} s` },
      { status: 429 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_revenues")
    .select(
      "amount_sek, beskrivning, datum, profiles(namn), customers(orgnr, status, companies(namn))",
    )
    .order("datum", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(EXPORT_MAX_ROWS);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as unknown as RevenueExportRow[];

  const csv = toCsv([
    [
      "Datum",
      "Bolagsnamn",
      "Orgnr",
      "Belopp (kr)",
      "Beskrivning",
      "Registrerad av",
      "Kundstatus",
    ],
    ...rows.map((row) => {
      const customer = one(row.customers);
      const company = one(customer?.companies ?? null);
      return [
        row.datum,
        company?.namn ?? customer?.orgnr ?? "",
        customer?.orgnr ?? "",
        Number(row.amount_sek),
        row.beskrivning ?? "",
        one(row.profiles)?.namn ?? "",
        customer ? kundStatusLabel(customer.status) : "",
      ];
    }),
  ]);

  await logActivity({
    actorId: session.userId,
    entityType: "synk",
    entityId: "csv-export",
    action: "export",
    payload: { typ: "intäkter", rader: rows.length },
  });

  const filename = `grodt-intakter-${fmtDate(new Date())}.csv`;
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
