"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { clearFollowUpAction } from "@/actions/leads";
import { useToast } from "@/components/toast";
import { fmtDate, todayStockholm } from "@/lib/format";

export interface FollowUpRow {
  leadId: string;
  orgnr: string;
  namn: string;
  datum: string;
  anteckning: string | null;
  ansvarigNamn: string | null;
}

/** Att göra-listan på dashboarden: förfallna i rött, bocka av direkt. */
export function FollowUpList({ rows }: { rows: FollowUpRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const today = todayStockholm();

  function markDone(leadId: string) {
    if (pending) return;
    startTransition(async () => {
      const result = await clearFollowUpAction({ leadId, klar: true });
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="activity-list">
      {rows.map((row) => {
        const overdue = row.datum < today;
        const isToday = row.datum === today;
        return (
          <div className="item" key={row.leadId} style={{ alignItems: "center" }}>
            <span
              className="mono small"
              style={{
                width: 96,
                flex: "none",
                fontWeight: 600,
                color: overdue ? "var(--error)" : isToday ? "var(--accent-deep)" : "var(--ink-2)",
              }}
              title={overdue ? `Förfallen – skulle gjorts ${fmtDate(row.datum)}` : isToday ? "Idag" : undefined}
            >
              {overdue ? `Förf. ${fmtDate(row.datum).slice(5)}` : isToday ? "Idag" : fmtDate(row.datum)}
            </span>
            <span className="txt" style={{ minWidth: 0 }}>
              <Link href={`/bolag/${row.orgnr}`}>
                <strong>{row.namn}</strong>
              </Link>
              {row.anteckning && <span className="faint"> – {row.anteckning}</span>}
              {row.ansvarigNamn && (
                <span className="faint small"> · {row.ansvarigNamn}</span>
              )}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{ flex: "none" }}
              onClick={() => markDone(row.leadId)}
              disabled={pending}
            >
              Klar
            </button>
          </div>
        );
      })}
    </div>
  );
}
