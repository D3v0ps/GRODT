"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { decodeCsvBuffer } from "@/lib/csv-import";
import { checkRateLimit } from "@/lib/rate-limit";
import { performCsvImport, type CsvImportOutcome } from "@/lib/sync/csv-run";
import { performSync } from "@/lib/sync/run";
import type { ActionResult } from "./types";

const CSV_MAX_BYTES = 5 * 1024 * 1024;

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

const leadModeSchema = z.enum(["auto", "qualified", "always"]);

export type CsvImportActionResult = ActionResult & Partial<CsvImportOutcome>;

/** CSV-import från Import & synk-vyn. */
export async function importCsvAction(
  formData: FormData,
): Promise<CsvImportActionResult> {
  try {
    const session = await requireUser();
    const limit = checkRateLimit(`csv:${session.userId}`, 3, 60_000);
    if (!limit.ok) {
      return { ok: false, message: `För många importförsök – vänta ${limit.retryAfterSeconds} s.` };
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: "Välj en CSV-fil att importera." };
    }
    if (file.size > CSV_MAX_BYTES) {
      return { ok: false, message: "Filen är större än 5 MB – dela upp den." };
    }
    const leadMode = leadModeSchema.safeParse(formData.get("leadMode"));

    const text = decodeCsvBuffer(await file.arrayBuffer());
    const outcome = await performCsvImport({
      actorId: session.userId,
      fileName: file.name || "import.csv",
      text,
      leadMode: leadMode.success ? leadMode.data : "auto",
    });

    revalidateDataViews();
    return { ...outcome };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}
