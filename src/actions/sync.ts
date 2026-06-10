"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { performSync } from "@/lib/sync/run";
import type { ActionResult } from "./types";

function revalidateDataViews() {
  revalidatePath("/dashboard");
  revalidatePath("/bolag");
  revalidatePath("/pipeline");
  revalidatePath("/synk");
  revalidatePath("/installningar");
}

/** "Hämta bolag nu" – manuell synk mot konfigurerad provider. */
export async function triggerSyncAction(): Promise<ActionResult> {
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
    return { ok: outcome.ok, message: outcome.message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}
