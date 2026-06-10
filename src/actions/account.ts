"use server";

import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "./types";

const passwordSchema = z.object({
  password: z
    .string()
    .min(10, "Lösenordet måste vara minst 10 tecken.")
    .max(128),
});

/** Byt sitt eget lösenord (Inställningar → Mitt konto). */
export async function changeOwnPasswordAction(
  input: z.infer<typeof passwordSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = passwordSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ogiltigt lösenord." };
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (error) {
      return {
        ok: false,
        message: /same/i.test(error.message)
          ? "Det nya lösenordet får inte vara samma som det gamla."
          : `Kunde inte byta lösenord: ${error.message}`,
      };
    }

    await logActivity({
      actorId: session.userId,
      entityType: "anvandare",
      entityId: session.userId,
      action: "losenord_bytt",
      payload: { namn: session.namn },
    });
    return { ok: true, message: "Lösenordet är bytt" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}
