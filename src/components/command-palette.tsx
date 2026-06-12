"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { globalSearchAction, type GlobalSearchResult } from "@/actions/search";
import { rollLabel } from "@/lib/constants";
import { Avatar } from "./avatar";
import { IconSearch } from "./icons";
import { StatusBadge } from "./status-badge";

/**
 * Snabbsöket: Ctrl+K (Cmd+K) var som helst i appen öppnar en palett som
 * söker bolag och kunder på namn/orgnr/ort och hoppar till sidor.
 * Piltangenter + Enter navigerar, Esc stänger. Sidoknappen i menyn
 * öppnar samma palett via ett fönster-event (samma mönster som rundturen).
 */

export const PALETTE_EVENT = "grodt-sok";

/** Öppnar snabbsöket – för knappar utanför komponenten (sidomenyn). */
export function openPalette() {
  window.dispatchEvent(new Event(PALETTE_EVENT));
}

const PAGES = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/bolag", label: "Bolag" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/ringlistor", label: "Ringlistor" },
  { href: "/kunder", label: "Kunder" },
  { href: "/statistik", label: "Statistik" },
  { href: "/synk", label: "Import & synk" },
  { href: "/admin", label: "Admin" },
  { href: "/installningar", label: "Inställningar" },
  { href: "/hjalp", label: "Hjälp" },
] as const;

interface PaletteItem {
  key: string;
  href: string;
  label: string;
  group: "Bolag" | "Kunder" | "Personer" | "Sidor";
  meta?: string;
  status?: string;
  personId?: string;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<GlobalSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const onOpenEvent = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener(PALETTE_EVENT, onOpenEvent);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(PALETTE_EVENT, onOpenEvent);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Varje öppning börjar tom – snabbsöket är ett språngbräde, inte ett minne.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResult(null);
    setSearching(false);
    setActive(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResult(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const mySeq = ++seq.current;
    const timer = setTimeout(async () => {
      const res = await globalSearchAction(q);
      // Släng svar som hunnit bli inaktuella under skrivandet.
      if (seq.current === mySeq) {
        setResult(res);
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [open, query]);

  const q = query.trim().toLowerCase();
  const items: PaletteItem[] = [];
  if (result) {
    for (const b of result.bolag) {
      items.push({
        key: `bolag-${b.orgnr}`,
        href: `/bolag/${b.orgnr}`,
        label: b.namn,
        group: "Bolag",
        meta: [b.ort, b.orgnr].filter(Boolean).join(" · "),
        status: b.status,
      });
    }
    for (const k of result.kunder) {
      items.push({
        key: `kund-${k.id}`,
        href: `/kunder/${k.id}`,
        label: k.namn,
        group: "Kunder",
        meta: [k.ort, k.orgnr].filter(Boolean).join(" · "),
      });
    }
    for (const p of result.personer) {
      items.push({
        key: `person-${p.id}`,
        href: `/profil/${p.id}`,
        label: p.namn,
        group: "Personer",
        meta: rollLabel(p.roll),
        personId: p.id,
      });
    }
  }
  for (const page of PAGES) {
    if (q === "" || page.label.toLowerCase().includes(q)) {
      items.push({
        key: `sida-${page.href}`,
        href: page.href,
        label: page.label,
        group: "Sidor",
      });
    }
  }
  const activeIndex = Math.min(active, Math.max(0, items.length - 1));

  // Håll den aktiva raden synlig när man bläddrar med piltangenterna.
  useEffect(() => {
    if (!open) return;
    document
      .getElementById(`palette-opt-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  if (!open) return null;

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) go(item.href);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Snabbsök"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="palette">
        <div className="palette-input">
          <IconSearch />
          <input
            autoFocus
            type="text"
            value={query}
            placeholder="Sök bolag, kund eller sida …"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="palette-list"
            aria-activedescendant={
              items[activeIndex] ? `palette-opt-${activeIndex}` : undefined
            }
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKeyDown}
          />
          {searching && (
            <span className="small faint" aria-hidden="true">
              Söker …
            </span>
          )}
        </div>
        <div className="palette-list" id="palette-list" role="listbox" aria-label="Träffar">
          {items.length === 0 ? (
            <div className="palette-empty">
              {q.length >= 2 && !searching
                ? `Inga träffar på "${query.trim()}"`
                : "Skriv minst två tecken för att söka bland bolag och kunder."}
            </div>
          ) : (
            items.map((item, index) => (
              <Fragment key={item.key}>
                {(index === 0 || items[index - 1].group !== item.group) && (
                  <div className="palette-group" role="presentation">
                    {item.group}
                  </div>
                )}
                <button
                  type="button"
                  id={`palette-opt-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`palette-item${index === activeIndex ? " active" : ""}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(item.href)}
                >
                  {item.personId && <Avatar id={item.personId} namn={item.label} small />}
                  <span className="p-label">{item.label}</span>
                  {item.status && <StatusBadge status={item.status} />}
                  {item.meta && <span className="meta">{item.meta}</span>}
                </button>
              </Fragment>
            ))
          )}
        </div>
        <div className="palette-foot">
          <span>
            <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> välj
          </span>
          <span>
            <kbd className="kbd">Enter</kbd> öppna
          </span>
          <span>
            <kbd className="kbd">Esc</kbd> stäng
          </span>
        </div>
      </div>
    </div>
  );
}
