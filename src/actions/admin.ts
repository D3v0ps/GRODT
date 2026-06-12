"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth";
import { rollLabel } from "@/lib/constants";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./types";

/**
 * Kontohantering – invite-only. Ingen självregistrering finns: konton
 * skapas här via Supabase Admin API (service role, endast server-side).
 */

const createUserSchema = z.object({
  namn: z.string().trim().min(2, "Ange för- och efternamn.").max(120),
  email: z.email("Ogiltig e-postadress."),
  roll: z.enum(["admin", "saljare", "controller"]),
});

export interface CreateUserResult extends ActionResult {
  /** Visas EN gång för administratören som skapar kontot. */
  tempPassword?: string;
}

export async function createUserAction(
  input: z.infer<typeof createUserSchema>,
): Promise<CreateUserResult> {
  try {
    const session = await requireAdmin();
    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ogiltiga uppgifter." };
    }
    const { namn, email, roll } = parsed.data;

    const admin = createSupabaseAdminClient();
    const tempPassword = `Grodt-${randomBytes(9).toString("base64url")}`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { namn },
    });
    if (error || !created.user) {
      const msg = error?.message ?? "Okänt fel";
      return {
        ok: false,
        message: /already/i.test(msg)
          ? "Det finns redan ett konto med den e-postadressen."
          : `Kunde inte skapa kontot: ${msg}`,
      };
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      id: created.user.id,
      namn,
      roll,
      aktiv: true,
      // Engångslösenordet ska bytas vid första inloggningen.
      must_change_password: true,
    });
    if (profileError) {
      return { ok: false, message: `Kontot skapades men profilen kunde inte sparas: ${profileError.message}` };
    }

    await logActivity({
      actorId: session.userId,
      entityType: "anvandare",
      entityId: created.user.id,
      action: "anvandare_skapad",
      payload: { namn, roll, email },
    });
    revalidatePath("/admin");
    return {
      ok: true,
      message: `Konto skapat för ${namn}`,
      tempPassword,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

const setActiveSchema = z.object({
  userId: z.uuid(),
  aktiv: z.boolean(),
});

export async function setUserActiveAction(
  input: z.infer<typeof setActiveSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireAdmin();
    const parsed = setActiveSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Ogiltig förfrågan." };
    const { userId, aktiv } = parsed.data;

    if (userId === session.userId && !aktiv) {
      return { ok: false, message: "Du kan inte inaktivera ditt eget konto." };
    }

    const admin = createSupabaseAdminClient();
    const { data: profile, error } = await admin
      .from("profiles")
      .update({ aktiv })
      .eq("id", userId)
      .select("namn")
      .maybeSingle();
    if (error || !profile) {
      return { ok: false, message: `Kunde inte uppdatera: ${error?.message ?? "profil saknas"}` };
    }

    // Spärra/öppna sessionen direkt (middleware-koll på aktiv är ändå
    // den hårda grinden på varje request).
    try {
      await admin.auth.admin.updateUserById(userId, {
        ban_duration: aktiv ? "none" : "87600h",
      });
    } catch {
      // best effort
    }

    await logActivity({
      actorId: session.userId,
      entityType: "anvandare",
      entityId: userId,
      action: aktiv ? "anvandare_aktiverad" : "anvandare_inaktiverad",
      payload: { namn: profile.namn },
    });
    revalidatePath("/admin");
    return {
      ok: true,
      message: aktiv ? `${profile.namn} återaktiverad` : `${profile.namn} inaktiverad`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

const setRoleSchema = z.object({
  userId: z.uuid(),
  roll: z.enum(["admin", "saljare", "controller"]),
});

export async function setUserRoleAction(
  input: z.infer<typeof setRoleSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireAdmin();
    const parsed = setRoleSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Ogiltig förfrågan." };
    const { userId, roll } = parsed.data;

    if (userId === session.userId) {
      return { ok: false, message: "Du kan inte ändra din egen roll." };
    }

    const admin = createSupabaseAdminClient();
    const { data: profile, error } = await admin
      .from("profiles")
      .update({ roll })
      .eq("id", userId)
      .select("namn")
      .maybeSingle();
    if (error || !profile) {
      return { ok: false, message: `Kunde inte uppdatera: ${error?.message ?? "profil saknas"}` };
    }

    await logActivity({
      actorId: session.userId,
      entityType: "anvandare",
      entityId: userId,
      action: "roll_andrad",
      payload: { namn: profile.namn, roll },
    });
    revalidatePath("/admin");
    return { ok: true, message: `${profile.namn} är nu ${rollLabel(roll)}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

const resetPasswordSchema = z.object({
  userId: z.uuid(),
});

export interface ResetPasswordResult extends ActionResult {
  /** Visas EN gång för administratören. */
  tempPassword?: string;
}

/** Admin återställer en användares lösenord – nytt engångslösenord genereras. */
export async function resetUserPasswordAction(
  input: z.infer<typeof resetPasswordSchema>,
): Promise<ResetPasswordResult> {
  try {
    const session = await requireAdmin();
    const parsed = resetPasswordSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Ogiltig förfrågan." };
    const { userId } = parsed.data;

    const admin = createSupabaseAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("namn")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) return { ok: false, message: "Användaren hittades inte." };

    const tempPassword = `Grodt-${randomBytes(9).toString("base64url")}`;
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: tempPassword,
    });
    if (error) {
      return { ok: false, message: `Kunde inte återställa: ${error.message}` };
    }

    // Engångslösenordet ska bytas vid nästa inloggning.
    await admin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", userId);

    await logActivity({
      actorId: session.userId,
      entityType: "anvandare",
      entityId: userId,
      action: "losenord_aterstallt",
      payload: { namn: profile.namn },
    });
    revalidatePath("/admin");
    return {
      ok: true,
      message: `Nytt lösenord satt för ${profile.namn}`,
      tempPassword,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}
