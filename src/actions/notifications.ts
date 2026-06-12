"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "./types";

/** Kvitterar alla olästa notiser för den inloggade (RLS: endast egna rader). */
export async function markNotificationsReadAction(): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", session.userId)
      .is("read_at", null);
    if (error) return { ok: false, message: `Kunde inte uppdatera: ${error.message}` };
    revalidatePath("/", "layout");
    return { ok: true, message: "Notiser lästa" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}
