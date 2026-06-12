import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { AvatarProvider } from "@/components/avatar";
import { getSessionProfile } from "@/lib/auth";
import { avatarStoragePath } from "@/lib/avatar-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  // Middleware är första grinden; profilkollen här är bältet och hängslena.
  const [profile, avatarsRes] = await Promise.all([
    getSessionProfile(),
    supabase.from("profiles").select("id, avatar_url").not("avatar_url", "is", null),
  ]);
  if (!profile) redirect("/login");

  // Avatars-bucketen är privat: byt lagringssökvägarna mot signerade
  // URL:er (en batchad förfrågan för hela teamet).
  const pathToUser = new Map<string, string>();
  for (const row of avatarsRes.data ?? []) {
    const path = avatarStoragePath(row.avatar_url);
    if (path) pathToUser.set(path, row.id);
  }
  const avatarUrls: Record<string, string> = {};
  if (pathToUser.size > 0) {
    const admin = createSupabaseAdminClient();
    const { data: signed } = await admin.storage
      .from("avatars")
      .createSignedUrls([...pathToUser.keys()], 3600);
    for (const item of signed ?? []) {
      const userId = item.path ? pathToUser.get(item.path) : undefined;
      if (userId && item.signedUrl) avatarUrls[userId] = item.signedUrl;
    }
  }

  return (
    <AvatarProvider urls={avatarUrls}>
      <AppShell
        profile={{ userId: profile.userId, namn: profile.namn, roll: profile.roll }}
        mustChangePassword={profile.mustChangePassword}
      >
        {children}
      </AppShell>
    </AvatarProvider>
  );
}
