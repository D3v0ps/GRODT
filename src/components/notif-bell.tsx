"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { markNotificationsReadAction } from "@/actions/notifications";
import { fmtDateTime } from "@/lib/format";
import { IconBell } from "./icons";

export interface NotifItem {
  id: number;
  text: string;
  href: string | null;
  createdAt: string;
  read: boolean;
}

/**
 * Notisklockan i sidomenyn: personliga händelser ("du fick ett lead").
 * Öppning kvitterar alla olästa – siffran nollas direkt och servern
 * uppdateras i bakgrunden.
 */
export function NotifBell({ items, unread }: { items: NotifItem[]; unread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [localUnread, setLocalUnread] = useState(unread);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalUnread(unread);
  }, [unread]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && localUnread > 0) {
      setLocalUnread(0);
      void markNotificationsReadAction().then(() => router.refresh());
    }
  }

  return (
    <div className="notif" ref={ref}>
      <button
        type="button"
        className="notif-btn"
        aria-label={
          localUnread > 0 ? `Notiser, ${localUnread} olästa` : "Notiser"
        }
        aria-expanded={open}
        onClick={toggle}
      >
        <IconBell />
        {localUnread > 0 && (
          <span className="notif-badge">{localUnread > 9 ? "9+" : localUnread}</span>
        )}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notiser">
          <div className="notif-head">Notiser</div>
          {items.length === 0 ? (
            <div className="notif-empty">
              Inga notiser ännu. När någon tilldelar dig ett lead, sätter en
              uppföljning åt dig eller lämnar över en kund dyker det upp här.
            </div>
          ) : (
            <div className="notif-list">
              {items.map((item) => {
                const inner = (
                  <>
                    <span className={item.read ? "n-text" : "n-text unread"}>
                      {item.text}
                    </span>
                    <span className="n-when">{fmtDateTime(item.createdAt).slice(5)}</span>
                  </>
                );
                return item.href ? (
                  <Link
                    key={item.id}
                    className="notif-item"
                    href={item.href}
                    onClick={() => setOpen(false)}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={item.id} className="notif-item">
                    {inner}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
