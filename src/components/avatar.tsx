"use client";

import { createContext, useContext, type ReactNode } from "react";
import { avatarClass, initials } from "@/lib/format";

/**
 * Avatarer med profilbild: (app)/layout hämtar en karta userId →
 * avatar_url en gång per sidrendering och tillhandahåller den via
 * context, så att varje Avatar i tabeller, kanban, topplistor och
 * sidopanel visar bilden utan extra frågor. Saknas bild visas initialer
 * med stabil färg per användare, precis som i designen.
 */

const AvatarUrlContext = createContext<Record<string, string>>({});

export function AvatarProvider({
  urls,
  children,
}: {
  urls: Record<string, string>;
  children: ReactNode;
}) {
  return <AvatarUrlContext.Provider value={urls}>{children}</AvatarUrlContext.Provider>;
}

export function Avatar({
  id,
  namn,
  small = false,
  size,
}: {
  id: string;
  namn: string;
  small?: boolean;
  /** Explicit storlek i px (t.ex. 64 i Mitt konto). */
  size?: number;
}) {
  const urls = useContext(AvatarUrlContext);
  const url = urls[id];
  const dimension = size ?? (small ? 20 : undefined);
  const style = dimension
    ? { width: dimension, height: dimension, fontSize: dimension * 0.42 }
    : small
      ? { width: 20, height: 20, fontSize: 8.5 }
      : undefined;

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="avatar avatar-img"
        src={url}
        alt=""
        title={namn}
        style={style}
        loading="lazy"
      />
    );
  }
  return (
    <span className={`avatar ${avatarClass(id)}`.trim()} title={namn} style={style}>
      {initials(namn)}
    </span>
  );
}

export function AvatarWithName({ id, namn }: { id: string; namn: string }) {
  return (
    <span className="ansvarig-cell">
      <Avatar id={id} namn={namn} />
      <span>{namn}</span>
    </span>
  );
}
