import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SessionProfile {
  userId: string;
  email: string;
  namn: string;
  roll: "admin" | "user";
}

/** Inloggad användare med aktiv profil, annars null. */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("namn, roll, aktiv")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.aktiv) return null;
  return {
    userId: user.id,
    email: user.email ?? "",
    namn: profile.namn,
    roll: profile.roll === "admin" ? "admin" : "user",
  };
}

/** För server actions: kasta tydligt fel i stället för redirect. */
export async function requireUser(): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session) throw new Error("Du är inte inloggad.");
  return session;
}

export async function requireAdmin(): Promise<SessionProfile> {
  const session = await requireUser();
  if (session.roll !== "admin") {
    throw new Error("Endast administratörer kan göra detta.");
  }
  return session;
}
