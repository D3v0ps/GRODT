import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { getSessionProfile } from "@/lib/auth";
import { normalizeOrgnr } from "@/lib/format";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSyncFilter } from "@/lib/settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { BULK_BATCH_SIZE, importBatch, type BulkRow } from "@/lib/sync/bulk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Batch-API för stora CSV-importer. Filen tolkas i webbläsaren (förbi
 * Vercels gräns på ~4,5 MB per request) och skickas hit i omgångar om
 * max 500 bolag:
 *
 *   start  → skapar import_run, returnerar runId
 *   batch  → upsertar bolag/bokslut + leads enligt omsättningsfiltret
 *   finish → stänger körningen och skriver audit log
 *   abort  → markerar körningen som fel
 *
 * Auth: inloggad aktiv användare (cookies). Varje batch verifierar att
 * runId tillhör användaren och fortfarande är öppen.
 */

const detailsSchema = z.object({
  orgnr: z.string().min(1).max(20),
  namn: z.string().min(1).max(300),
  ort: z.string().max(120).nullable(),
  sniKod: z.string().max(20).nullable(),
  adress: z.string().max(300).nullable(),
  antalAnstallda: z.number().int().min(0).max(10_000_000).nullable(),
  hemsida: z.string().max(300).nullable(),
  telefon: z.string().max(60).nullable(),
});

const financialsSchema = z.object({
  year: z.number().int().min(1900).max(2100),
  revenueSek: z.number().int().nullable(),
  profitSek: z.number().int().nullable(),
  employees: z.number().int().min(0).nullable(),
});

const payloadSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    fileName: z.string().min(1).max(200),
  }),
  z.object({
    action: z.literal("batch"),
    runId: z.uuid(),
    leadMode: z.enum(["qualified", "always"]),
    rows: z
      .array(z.object({ details: detailsSchema, financials: z.array(financialsSchema).max(30) }))
      .min(1)
      .max(BULK_BATCH_SIZE),
  }),
  z.object({
    action: z.literal("finish"),
    runId: z.uuid(),
    fileName: z.string().min(1).max(200),
    leadMode: z.enum(["qualified", "always"]),
    totals: z.object({
      fetched: z.number().int().min(0),
      created: z.number().int().min(0),
      updated: z.number().int().min(0),
      leadsCreated: z.number().int().min(0),
    }),
    radfel: z.array(z.string().max(300)).max(50),
  }),
  z.object({
    action: z.literal("abort"),
    runId: z.uuid(),
    message: z.string().max(500),
  }),
]);

async function verifyRun(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  runId: string,
  userId: string,
) {
  const { data: run } = await admin
    .from("import_runs")
    .select("id, started_by, status")
    .eq("id", runId)
    .maybeSingle();
  if (!run || run.started_by !== userId || run.status !== "running") {
    return null;
  }
  return run;
}

export async function POST(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ogiltig förfrågan" },
      { status: 400 },
    );
  }
  const payload = parsed.data;

  const limit = checkRateLimit(
    `import:${payload.action}:${session.userId}`,
    payload.action === "batch" ? 600 : 10,
    60_000,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: `För många anrop – vänta ${limit.retryAfterSeconds} s` },
      { status: 429 },
    );
  }

  const admin = createSupabaseAdminClient();

  switch (payload.action) {
    case "start": {
      const { data: run, error } = await admin
        .from("import_runs")
        .insert({
          started_by: session.userId,
          status: "running",
          source: "csv",
          trigger: "manuell",
        })
        .select("id")
        .single();
      if (error || !run) {
        return NextResponse.json(
          { error: `Kunde inte starta importen: ${error?.message}` },
          { status: 500 },
        );
      }
      return NextResponse.json({ runId: run.id });
    }

    case "batch": {
      const run = await verifyRun(admin, payload.runId, session.userId);
      if (!run) {
        return NextResponse.json({ error: "Okänd eller avslutad importkörning." }, { status: 409 });
      }
      // Defensiv normalisering server-side – klienten ska redan ha gjort detta.
      const rows: BulkRow[] = [];
      let invalid = 0;
      for (const row of payload.rows) {
        const orgnr = normalizeOrgnr(row.details.orgnr);
        if (!orgnr) {
          invalid++;
          continue;
        }
        rows.push({ details: { ...row.details, orgnr }, financials: row.financials });
      }
      try {
        const settings = await getSyncFilter(admin);
        const result = await importBatch(admin, settings, rows, payload.leadMode);
        return NextResponse.json({ ...result, invalid });
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Batchen misslyckades" },
          { status: 500 },
        );
      }
    }

    case "finish": {
      const run = await verifyRun(admin, payload.runId, session.userId);
      if (!run) {
        return NextResponse.json({ error: "Okänd eller avslutad importkörning." }, { status: 409 });
      }
      const hasErrors = payload.radfel.length > 0;
      await admin
        .from("import_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: hasErrors ? "fel" : "ok",
          fetched: payload.totals.fetched,
          created: payload.totals.created,
          updated: payload.totals.updated,
          errors: payload.radfel.map((message) => ({ orgnr: null, message })),
        })
        .eq("id", payload.runId);

      await logActivity({
        actorId: session.userId,
        entityType: "synk",
        entityId: payload.runId,
        action: "csv_import",
        payload: {
          fil: payload.fileName,
          nya: payload.totals.created,
          uppdaterade: payload.totals.updated,
          leads: payload.totals.leadsCreated,
          fel: payload.radfel.length,
          lead_lage: payload.leadMode,
        },
      });
      return NextResponse.json({ ok: true });
    }

    case "abort": {
      const run = await verifyRun(admin, payload.runId, session.userId);
      if (run) {
        await admin
          .from("import_runs")
          .update({
            finished_at: new Date().toISOString(),
            status: "fel",
            errors: [{ orgnr: null, message: payload.message || "Importen avbröts." }],
          })
          .eq("id", payload.runId);
      }
      return NextResponse.json({ ok: true });
    }
  }
}
