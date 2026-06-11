"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

/* ------------------------------------------------------------------ */
/* Profilbild                                                           */
/* ------------------------------------------------------------------ */

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** "…/avatars/<sökväg>" → "<sökväg>", för att städa bort gamla bilder. */
function avatarPathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = "/avatars/";
  const index = url.indexOf(marker);
  return index === -1 ? null : url.slice(index + marker.length);
}

export interface AvatarActionResult extends ActionResult {
  avatarUrl?: string | null;
}

/** Byt sin egen profilbild (Inställningar → Mitt konto). */
export async function updateAvatarAction(
  formData: FormData,
): Promise<AvatarActionResult> {
  try {
    const session = await requireUser();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: "Välj en bild." };
    }
    if (!AVATAR_TYPES.has(file.type)) {
      return { ok: false, message: "Bilden måste vara JPEG, PNG eller WebP." };
    }
    if (file.size > AVATAR_MAX_BYTES) {
      return { ok: false, message: "Bilden är större än 2 MB." };
    }

    const admin = createSupabaseAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("avatar_url")
      .eq("id", session.userId)
      .maybeSingle();

    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${session.userId}/${Date.now()}.${extension}`;
    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(path, file, { contentType: file.type, upsert: true });
    if (uploadError) {
      return { ok: false, message: `Kunde inte ladda upp: ${uploadError.message}` };
    }
    const { data: publicUrl } = admin.storage.from("avatars").getPublicUrl(path);

    const { error: updateError } = await admin
      .from("profiles")
      .update({ avatar_url: publicUrl.publicUrl })
      .eq("id", session.userId);
    if (updateError) {
      return { ok: false, message: `Kunde inte spara profilen: ${updateError.message}` };
    }

    // Städa bort den gamla bilden (best effort).
    const oldPath = avatarPathFromUrl(profile?.avatar_url ?? null);
    if (oldPath && oldPath !== path) {
      await admin.storage.from("avatars").remove([oldPath]);
    }

    await logActivity({
      actorId: session.userId,
      entityType: "anvandare",
      entityId: session.userId,
      action: "profilbild_andrad",
      payload: { namn: session.namn },
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Profilbilden är uppdaterad", avatarUrl: publicUrl.publicUrl };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

/** Ta bort sin profilbild – initialerna visas i stället. */
export async function removeAvatarAction(): Promise<AvatarActionResult> {
  try {
    const session = await requireUser();
    const admin = createSupabaseAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("avatar_url")
      .eq("id", session.userId)
      .maybeSingle();

    const { error } = await admin
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", session.userId);
    if (error) {
      return { ok: false, message: `Kunde inte ta bort: ${error.message}` };
    }
    const oldPath = avatarPathFromUrl(profile?.avatar_url ?? null);
    if (oldPath) {
      await admin.storage.from("avatars").remove([oldPath]);
    }

    await logActivity({
      actorId: session.userId,
      entityType: "anvandare",
      entityId: session.userId,
      action: "profilbild_andrad",
      payload: { namn: session.namn, borttagen: "ja" },
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Profilbilden är borttagen", avatarUrl: null };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}
