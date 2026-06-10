"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateLeadStatusAction } from "@/actions/leads";
import { Avatar } from "@/components/avatar";
import { useToast } from "@/components/toast";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/constants";
import { fmtMkr } from "@/lib/format";

export interface KanbanCard {
  leadId: string;
  orgnr: string;
  namn: string;
  ort: string | null;
  status: string;
  ownerId: string | null;
  ownerNamn: string | null;
  maxOms: number | null;
  dagar: number;
}

/**
 * Kanban med HTML5 drag & drop enligt designen: draget kort 45 % opacitet,
 * målkolumnen får streckad Duvblå outline, släpp = statusbyte + toast +
 * logg (via server action). Dubbelklick öppnar bolagsdetaljen.
 */
export function Kanban({ cards: initialCards }: { cards: KanbanCard[] }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [cards, setCards] = useState(initialCards);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  function drop(status: LeadStatus) {
    setOverCol(null);
    if (!dragId) return;
    const card = cards.find((c) => c.leadId === dragId);
    setDragId(null);
    if (!card || card.status === status) return;

    const previous = card.status;
    // Optimistiskt: flytta direkt, återställ vid fel.
    setCards((current) =>
      current.map((c) => (c.leadId === card.leadId ? { ...c, status, dagar: 0 } : c)),
    );
    startTransition(async () => {
      const result = await updateLeadStatusAction({ leadId: card.leadId, status });
      toast(result.message, result.ok ? "ok" : "err");
      if (!result.ok) {
        setCards((current) =>
          current.map((c) =>
            c.leadId === card.leadId ? { ...c, status: previous } : c,
          ),
        );
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="kanban">
      {LEAD_STATUSES.map((statusDef) => {
        const columnCards = cards.filter((c) => c.status === statusDef.key);
        return (
          <div
            key={statusDef.key}
            className={`kcol${overCol === statusDef.key ? " dragover" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(statusDef.key);
            }}
            onDragLeave={() => setOverCol((c) => (c === statusDef.key ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              drop(statusDef.key);
            }}
          >
            <div className="kcol-head">
              <span className="dot" style={{ background: `var(--st-${statusDef.key}-dot)` }} />
              {statusDef.label}
              <span className="count">{columnCards.length}</span>
            </div>
            <div className="kcards">
              {columnCards.map((card) => (
                <div
                  key={card.leadId}
                  className={`kcard${dragId === card.leadId ? " dragging" : ""}`}
                  draggable
                  tabIndex={0}
                  onDragStart={(e) => {
                    setDragId(card.leadId);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", card.leadId);
                  }}
                  onDragEnd={() => setDragId(null)}
                  onDoubleClick={() => router.push(`/bolag/${card.orgnr}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") router.push(`/bolag/${card.orgnr}`);
                  }}
                >
                  <div className="k-namn">{card.namn}</div>
                  <div className="k-meta">
                    <span>{card.ort ?? "–"}</span>
                    <span className="k-oms">
                      {card.maxOms === null ? "–" : fmtMkr(card.maxOms)}
                    </span>
                  </div>
                  <div className="k-foot">
                    {card.ownerId && card.ownerNamn ? (
                      <Avatar id={card.ownerId} namn={card.ownerNamn} small />
                    ) : (
                      <span className="faint small">Ej tilldelad</span>
                    )}
                    <span className="days">{card.dagar} d</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
