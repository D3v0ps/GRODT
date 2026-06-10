import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getSessionProfile } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Middleware är första grinden; detta är bältet och hängslena.
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");

  return (
    <AppShell
      profile={{ userId: profile.userId, namn: profile.namn, roll: profile.roll }}
    >
      {children}
    </AppShell>
  );
}
