"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { avatarStoragePath } from "@/lib/avatar-url";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "./types";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Ange ditt nuvarande lösenord."),
  password: z
    .string()
    .min(10, "Lösenordet måste vara minst 10 tecken.")
    .max(128),
});

/**
 * Byt sitt eget lösenord (Inställningar → Mitt konto). Kräver nuvarande
 * lösenord – en kvarglömd inloggad dator ska inte räcka för att ta över
 * kontot.
 */
export async function changeOwnPasswordAction(
  input: z.infer<typeof passwordSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = passwordSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ogiltigt lösenord." };
    }

    const limit = checkRateLimit(`password:${session.userId}`, 5, 10 * 60_000);
    if (!limit.ok) {
      return {
        ok: false,
        message: `För många försök – vänta ${limit.retryAfterSeconds} s.`,
      };
    }

    // Verifiera nuvarande lösenord med en fristående klient så att den
    // riktiga sessionens cookies inte rörs.
    const verifier = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error: verifyError } = await verifier.auth.signInWithPassword({
      email: session.email,
      password: parsed.data.currentPassword,
    });
    if (verifyError) {
      return { ok: false, message: "Fel nuvarande lösenord." };
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

    // Lösenordet är bytt – kravet från en admin-återställning är uppfyllt.
    const admin = createSupabaseAdminClient();
    await admin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", session.userId);

    await logActivity({
      actorId: session.userId,
      entityType: "anvandare",
      entityId: session.userId,
      action: "losenord_bytt",
      payload: { namn: session.namn },
    });
    revalidatePath("/", "layout");
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

    // Bucketen är privat: profilen lagrar sökvägen och appen signerar
    // URL:er vid rendering ((app)/layout).
    const { error: updateError } = await admin
      .from("profiles")
      .update({ avatar_url: path })
      .eq("id", session.userId);
    if (updateError) {
      return { ok: false, message: `Kunde inte spara profilen: ${updateError.message}` };
    }

    // Städa bort den gamla bilden (best effort).
    const oldPath = avatarStoragePath(profile?.avatar_url ?? null);
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
    const { data: signed } = await admin.storage
      .from("avatars")
      .createSignedUrl(path, 3600);
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: "Profilbilden är uppdaterad",
      avatarUrl: signed?.signedUrl ?? null,
    };
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
    const oldPath = avatarStoragePath(profile?.avatar_url ?? null);
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
