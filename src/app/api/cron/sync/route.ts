import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getEffectiveProviderName } from "@/lib/providers";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAutoSyncEnabled } from "@/lib/settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { performSync } from "@/lib/sync/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Konstanttidsjämförelse – läcker inte hemlighetens längd eller prefix. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Schemalagd synk via Vercel Cron (se vercel.json). Skyddad med
 * CRON_SECRET – Vercel skickar den som "Authorization: Bearer <secret>".
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET är inte konfigurerad" }, { status: 500 });
  }
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "Obehörig" }, { status: 401 });
  }

  const limit = checkRateLimit("cron:sync", 2, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: `För många anrop – vänta ${limit.retryAfterSeconds} s` },
      { status: 429 },
    );
  }

  const admin = createSupabaseAdminClient();

  // CSV-läge: ingen API-leverantör konfigurerad är ett normalt drifttillstånd,
  // inte ett fel – cronen ska inte larma varje vecka.
  if ((await getEffectiveProviderName(admin)) === null) {
    return NextResponse.json({
      ok: true,
      skipped:
        "Ingen dataleverantör är konfigurerad – bolag importeras via CSV. Cronen hoppade över synken.",
    });
  }
  if (!(await getAutoSyncEnabled(admin))) {
    return NextResponse.json({ ok: true, skipped: "Automatiskt svep är avstängt i Inställningar" });
  }

  const outcome = await performSync({ actorId: null, trigger: "cron" });
  return NextResponse.json(
    {
      ok: outcome.ok,
      message: outcome.message,
      result: outcome.result ?? null,
    },
    { status: outcome.ok ? 200 : 500 },
  );
}
