"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { signOutAction } from "@/actions/auth";
import { rollLabel, type Roll } from "@/lib/constants";
import { Avatar } from "./avatar";
import {
  IconBriefcase,
  IconBuildings,
  IconDashboard,
  IconDesign,
  IconLogout,
  IconPipeline,
  IconSettings,
  IconSync,
  IconUsers,
} from "./icons";
import { RadarGlyph } from "./radar-glyph";

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
] as const;

export function AppShell({
  profile,
  children,
}: {
  profile: ShellProfile;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const navLink = (item: { href: string; label: string; icon: typeof IconDashboard }) => {
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={isActive(item.href) ? "active" : undefined}
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
      <aside className={`sidebar${menuOpen ? " open" : ""}`}>
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
          onClick={() => setMenuOpen(true)}
        >
          ☰&nbsp; GRODT
        </button>
        {children}
      </main>
    </div>
  );
}
