import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Roll } from "@/lib/constants";

export interface SessionProfile {
  userId: string;
  email: string;
  namn: string;
  roll: Roll;
}

/**
 * Inloggad användare med aktiv profil, annars null.
 *
 * JWT:n valideras lokalt (getClaims, ingen nätverksrunda); profilfrågan
 * är den enda databasträffen och fungerar samtidigt som spärr för
 * inaktiverade konton på varje sidrendering.
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  if (!claims?.sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("namn, roll, aktiv")
    .eq("id", claims.sub)
    .maybeSingle();

  if (!profile?.aktiv) return null;
  const roll: Roll =
    profile.roll === "admin" || profile.roll === "controller"
      ? profile.roll
      : "saljare";
  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    namn: profile.namn,
    roll,
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
