"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { performSync } from "@/lib/sync/run";
import type { ActionResult } from "./types";

function revalidateDataViews() {
  revalidatePath("/dashboard");
  revalidatePath("/bolag");
  revalidatePath("/pipeline");
  revalidatePath("/synk");
  revalidatePath("/installningar");
}

export interface SyncActionResult extends ActionResult {
  /** Antal bolag kvar i berikningskön (aldrig synkade) efter körningen. */
  kvar?: number;
}

/**
 * "Hämta bolag nu" – manuell synk mot konfigurerad provider. Returnerar
 * hur många bolag som återstår i berikningskön så att knappen kan kedja
 * svep tills kön är tom (Vercels tidsgräns tillåter ~40 bolag per svep).
 */
export async function triggerSyncAction(): Promise<SyncActionResult> {
  try {
    const session = await requireUser();
    const userLimit = checkRateLimit(`sync:${session.userId}`, 2, 60_000);
    const globalLimit = checkRateLimit("sync:global", 4, 60_000);
    if (!userLimit.ok || !globalLimit.ok) {
      const wait = Math.max(userLimit.retryAfterSeconds, globalLimit.retryAfterSeconds);
      return { ok: false, message: `För många synkförsök – vänta ${wait} s.` };
    }

    const outcome = await performSync({ actorId: session.userId, trigger: "manuell" });
    revalidateDataViews();

    const { count } = await createSupabaseAdminClient()
      .from("companies")
      .select("orgnr", { count: "exact", head: true })
      .is("last_synced_at", null);
    return { ok: outcome.ok, message: outcome.message, kvar: count ?? 0 };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}
