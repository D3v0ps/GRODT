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
 * runId tillhör användaren och fortfarande är öppen. Totalerna
 * ackumuleras server-side per batch – klienten kan inte påverka dem.
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
    radfel: z.array(z.string().max(300)).max(50),
  }),
  z.object({
    action: z.literal("abort"),
    runId: z.uuid(),
    fileName: z.string().max(200).optional(),
    message: z.string().max(500),
  }),
]);

/** Vakt: en körning utan livstecken så här länge anses ha kraschat. */
const STALE_RUN_MINUTES = 15;

interface RunTotals {
  fetched: number;
  created: number;
  updated: number;
  leads_created: number;
}

async function verifyRun(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  runId: string,
  userId: string,
): Promise<RunTotals | null> {
  const { data: run } = await admin
    .from("import_runs")
    .select("id, started_by, status, progress_at, fetched, created, updated, leads_created")
    .eq("id", runId)
    .maybeSingle();
  if (!run || run.started_by !== userId || run.status !== "running") {
    return null;
  }
  // Stalenessvakt: tar inte emot fler batchar till en körning som
  // zombiestädningen när som helst kan komma att avbryta.
  const staleCutoff = Date.now() - STALE_RUN_MINUTES * 60_000;
  if (new Date(run.progress_at).getTime() < staleCutoff) {
    return null;
  }
  return {
    fetched: run.fetched ?? 0,
    created: run.created ?? 0,
    updated: run.updated ?? 0,
    leads_created: run.leads_created ?? 0,
  };
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
      // Zombiestädning: körningar utan livstecken markeras som fel, annars
      // blockerar de unika indexet för pågående körningar för alltid.
      const staleCutoff = new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString();
      await admin
        .from("import_runs")
        .update({
          status: "fel",
          finished_at: new Date().toISOString(),
          errors: [
            { orgnr: null, message: "Körningen avbröts: inget svar (avbruten av servern)." },
          ],
        })
        .eq("status", "running")
        .lt("progress_at", staleCutoff);

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
        if (error?.code === "23505") {
          return NextResponse.json(
            { error: "En import eller synk pågår redan – vänta tills den är klar." },
            { status: 409 },
          );
        }
        return NextResponse.json(
          { error: `Kunde inte starta importen: ${error?.message}` },
          { status: 500 },
        );
      }
      return NextResponse.json({ runId: run.id });
    }

    case "batch": {
      const totals = await verifyRun(admin, payload.runId, session.userId);
      if (!totals) {
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
        const result = await importBatch(
          admin,
          settings,
          rows,
          payload.leadMode,
          "csv",
          session.userId,
        );
        await admin
          .from("import_runs")
          .update({
            fetched: totals.fetched + rows.length,
            created: totals.created + result.created,
            updated: totals.updated + result.updated,
            leads_created: totals.leads_created + result.leadsCreated,
            progress_at: new Date().toISOString(),
          })
          .eq("id", payload.runId);
        return NextResponse.json({ ...result, invalid });
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Batchen misslyckades" },
          { status: 500 },
        );
      }
    }

    case "finish": {
      const totals = await verifyRun(admin, payload.runId, session.userId);
      if (!totals) {
        return NextResponse.json({ error: "Okänd eller avslutad importkörning." }, { status: 409 });
      }
      const hasErrors = payload.radfel.length > 0;
      await admin
        .from("import_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: hasErrors ? "fel" : "ok",
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
          nya: totals.created,
          uppdaterade: totals.updated,
          leads: totals.leads_created,
          fel: payload.radfel.length,
          lead_lage: payload.leadMode,
        },
      });
      return NextResponse.json({ ok: true });
    }

    case "abort": {
      const totals = await verifyRun(admin, payload.runId, session.userId);
      if (totals) {
        await admin
          .from("import_runs")
          .update({
            finished_at: new Date().toISOString(),
            status: "fel",
            errors: [{ orgnr: null, message: payload.message || "Importen avbröts." }],
          })
          .eq("id", payload.runId);
        await logActivity({
          actorId: session.userId,
          entityType: "synk",
          entityId: payload.runId,
          action: "csv_import",
          payload: {
            fil: payload.fileName ?? "",
            nya: totals.created,
            uppdaterade: totals.updated,
            leads: totals.leads_created,
            avbruten: "ja",
            orsak: payload.message || "Importen avbröts.",
          },
        });
      }
      return NextResponse.json({ ok: true });
    }
  }
}
