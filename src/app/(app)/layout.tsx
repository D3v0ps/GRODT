import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { AvatarProvider } from "@/components/avatar";
import { getSessionProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  // Middleware är första grinden; profilkollen här är bältet och hängslena.
  const [profile, avatarsRes] = await Promise.all([
    getSessionProfile(),
    supabase.from("profiles").select("id, avatar_url").not("avatar_url", "is", null),
  ]);
  if (!profile) redirect("/login");

  const avatarUrls = Object.fromEntries(
    (avatarsRes.data ?? [])
      .filter((p) => p.avatar_url)
      .map((p) => [p.id, p.avatar_url as string]),
  );

  return (
    <AvatarProvider urls={avatarUrls}>
      <AppShell
        profile={{ userId: profile.userId, namn: profile.namn, roll: profile.roll }}
      >
        {children}
      </AppShell>
    </AvatarProvider>
  );
}
