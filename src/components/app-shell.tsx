"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { signOutAction } from "@/actions/auth";
import { rollLabel, type Roll } from "@/lib/constants";
import { Avatar } from "./avatar";
import {
  IconBriefcase,
  IconBuildings,
  IconDashboard,
  IconDesign,
  IconHelp,
  IconLogout,
  IconPipeline,
  IconSettings,
  IconSync,
  IconUsers,
} from "./icons";
import { RadarGlyph } from "./radar-glyph";
import { TourOverlay } from "./tour";

interface ShellProfile {
  userId: string;
  namn: string;
  roll: Roll;
}

const MAIN_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: IconDashboard },
  { href: "/bolag", label: "Bolag", icon: IconBuildings },
  { href: "/pipeline", label: "Pipeline", icon: IconPipeline },
  { href: "/kunder", label: "Kunder", icon: IconBriefcase },
  { href: "/synk", label: "Import & synk", icon: IconSync },
] as const;

const SYSTEM_NAV = [
  { href: "/admin", label: "Admin", icon: IconUsers },
  { href: "/installningar", label: "Inställningar", icon: IconSettings },
  { href: "/hjalp", label: "Hjälp", icon: IconHelp },
] as const;

export function AppShell({
  profile,
  mustChangePassword = false,
  children,
}: {
  profile: ShellProfile;
  /** Sant efter admin-återställning – visa uppmaning tills lösenordet bytts. */
  mustChangePassword?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Esc stänger mobilmenyn, precis som scrim-klicket.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const navLink = (item: { href: string; label: string; icon: typeof IconDashboard }) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={active ? "active" : undefined}
        aria-current={active ? "page" : undefined}
        onClick={() => setMenuOpen(false)}
      >
        <Icon />
        {item.label}
      </Link>
    );
  };

  return (
    <div className="app">
      <div
        className={`scrim${menuOpen ? " show" : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />
      <aside id="sidomeny" className={`sidebar${menuOpen ? " open" : ""}`}>
        <div className="brand">
          <span style={{ color: "#FFFFFF" }}>
            <RadarGlyph size={30} live />
          </span>
          <span>
            <span className="wordmark">GRODT</span>
            <span className="sub">Get rich or die trying</span>
          </span>
        </div>
        <nav className="nav" aria-label="Huvudnavigering">
          {MAIN_NAV.map(navLink)}
          <div className="divider" />
          <span className="nav-label">System</span>
          {SYSTEM_NAV.map(navLink)}
          <div className="divider" />
          <span className="nav-label">Design</span>
          {navLink({ href: "/designsystem", label: "Designsystem", icon: IconDesign })}
        </nav>
        <div className="me">
          <Avatar id={profile.userId} namn={profile.namn} />
          <span className="who">
            {profile.namn}
            <br />
            <span className="role">{rollLabel(profile.roll)}</span>
          </span>
          <form action={signOutAction}>
            <button className="logout" title="Logga ut" aria-label="Logga ut" type="submit">
              <IconLogout />
            </button>
          </form>
        </div>
      </aside>

      <main className="main">
        <button
          type="button"
          className="menu-btn"
          aria-label="Öppna meny"
          aria-expanded={menuOpen}
          aria-controls="sidomeny"
          onClick={() => setMenuOpen(true)}
        >
          ☰&nbsp; GRODT
        </button>
        {mustChangePassword && (
          <div className="banner info" role="alert" style={{ marginBottom: 14 }}>
            <span>
              <strong>Byt ditt lösenord.</strong> Ditt konto använder ett tillfälligt
              lösenord från en administratör –{" "}
              <Link href="/installningar" style={{ textDecoration: "underline" }}>
                välj ett eget under Inställningar → Mitt konto
              </Link>
              .
            </span>
          </div>
        )}
        {children}
      </main>
      <TourOverlay />
    </div>
  );
}
