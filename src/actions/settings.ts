"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth";
import { fmtKr } from "@/lib/format";
import { getAutoSyncEnabled, getSyncFilter } from "@/lib/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "./types";

const settingsSchema = z.object({
  sniCodes: z
    .array(z.string().trim().regex(/^\d{2}\.\d{3}$/, "SNI-koder skrivs som 78.100."))
    .min(1, "Ange minst en SNI-kod."),
  revenueMinSek: z
    .number()
    .int()
    .positive("Tröskeln måste vara ett positivt belopp i kr."),
  year1: z.number().int().min(2000).max(2100),
  year2: z.number().int().min(2000).max(2100),
  autoSync: z.boolean(),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

/**
 * Sparar filterparametrarna. Skrivs med användarens klient så att RLS
 * (endast admin får skriva app_settings) är den hårda gränsen.
 */
export async function saveSettingsAction(
  input: SettingsInput,
): Promise<ActionResult> {
  try {
    const session = await requireAdmin();
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ogiltiga inställningar." };
    }
    const { sniCodes, revenueMinSek, year1, year2, autoSync } = parsed.data;
    const revenueYears = [...new Set([year1, year2])].sort((a, b) => a - b);

    const supabase = await createSupabaseServerClient();
    const before = await getSyncFilter(supabase);
    const beforeAuto = await getAutoSyncEnabled(supabase);

    const filterChanges: string[] = [];
    if (before.sniCodes.join(",") !== sniCodes.join(",")) {
      filterChanges.push(`SNI: ${before.sniCodes.join(", ")} → ${sniCodes.join(", ")}`);
    }
    if (before.revenueMinSek !== revenueMinSek) {
      filterChanges.push(`Tröskel: ${fmtKr(before.revenueMinSek)} → ${fmtKr(revenueMinSek)}`);
    }
    if (before.revenueYears.join("/") !== revenueYears.join("/")) {
      filterChanges.push(`Räkenskapsår: ${before.revenueYears.join("/")} → ${revenueYears.join("/")}`);
    }

    const { error: filterError } = await supabase.from("app_settings").upsert({
      key: "sync_filter",
      value: {
        sni_codes: sniCodes,
        revenue_min_sek: revenueMinSek,
        revenue_years: revenueYears,
      },
      updated_at: new Date().toISOString(),
    });
    if (filterError) {
      return { ok: false, message: `Kunde inte spara: ${filterError.message}` };
    }
    const { error: autoError } = await supabase.from("app_settings").upsert({
      key: "auto_sync",
      value: { enabled: autoSync },
      updated_at: new Date().toISOString(),
    });
    if (autoError) {
      // Filtren är redan sparade – logga den delen och säg som det är,
      // i stället för att låtsas att ingenting ändrades.
      await logActivity({
        actorId: session.userId,
        entityType: "installningar",
        entityId: "app_settings",
        action: "installningar_andrade",
        payload: {
          beskrivning:
            (filterChanges.length > 0 ? `${filterChanges.join(" · ")} · ` : "") +
            "OBS: automatik-flaggan kunde inte sparas",
        },
      });
      revalidatePath("/installningar");
      return {
        ok: false,
        message: `Filtren sparades, men automatiskt svep kunde inte ändras: ${autoError.message}`,
      };
    }

    const changes = [...filterChanges];
    if (beforeAuto !== autoSync) {
      changes.push(`Automatiskt svep: ${autoSync ? "på" : "av"}`);
    }

    await logActivity({
      actorId: session.userId,
      entityType: "installningar",
      entityId: "app_settings",
      action: "installningar_andrade",
      payload: {
        beskrivning: changes.length > 0 ? changes.join(" · ") : "Sparade utan ändringar",
      },
    });

    revalidatePath("/installningar");
    revalidatePath("/synk");
    revalidatePath("/bolag");
    revalidatePath("/dashboard");
    return { ok: true, message: "Inställningar sparade – påverkar nästa synk" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}
