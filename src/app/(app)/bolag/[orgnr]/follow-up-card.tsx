"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clearFollowUpAction, setFollowUpAction } from "@/actions/leads";
import { useToast } from "@/components/toast";
import { fmtDate, todayStockholm } from "@/lib/format";

interface UserOption {
  id: string;
  namn: string;
}

const PRESETS = [
  { label: "1 vecka", days: 7 },
  { label: "2 veckor", days: 14 },
  { label: "1 månad", days: 30 },
  { label: "3 månader", days: 91 },
] as const;

function isoDateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  // Svensk kalenderdag, inte UTC – kring midnatt skiljer de sig.
  return todayStockholm(d);
}

/**
 * Uppföljningskortet: "kontakta om 3 månader" med ett klick. En aktiv
 * uppföljning per lead – syns i Att göra-listan på dashboarden och på
 * kanban-korten tills den bockas av.
 */
export function FollowUpCard({
  leadId,
  followUpAt,
  followUpNote,
  followUpUserNamn,
  currentUserId,
  users,
}: {
  leadId: string;
  followUpAt: string | null;
  followUpNote: string | null;
  followUpUserNamn: string | null;
  currentUserId: string;
  users: UserOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [customDate, setCustomDate] = useState("");
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState(currentUserId);

  const overdue = followUpAt !== null && followUpAt < todayStockholm();

  function save(datum: string) {
    if (pending || !datum) return;
    startTransition(async () => {
      const result = await setFollowUpAction({
        leadId,
        datum,
        anteckning: note.trim() || undefined,
        userId: assignee || undefined,
      });
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) {
        setCustomDate("");
        setNote("");
        router.refresh();
      }
    });
  }

  function clear(klar: boolean) {
    if (pending) return;
    startTransition(async () => {
      const result = await clearFollowUpAction({ leadId, klar });
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Uppföljning</h2>
        {followUpAt && (
          <span className={`badge ${overdue ? "st-fel" : "st-ny"}`}>
            <span className="dot" />
            {overdue ? "Förfallen" : "Planerad"}
          </span>
        )}
      </div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {followUpAt ? (
          <>
            <div className="facts" style={{ gridTemplateColumns: "1fr" }}>
              <div className="fact">
                <div className="k">Datum</div>
                <div className="v mono" style={overdue ? { color: "var(--error)" } : undefined}>
                  {fmtDate(followUpAt)}
                </div>
              </div>
              <div className="fact">
                <div className="k">Ansvarig</div>
                <div className="v">{followUpUserNamn ?? "–"}</div>
              </div>
              {followUpNote && (
                <div className="fact">
                  <div className="k">Anteckning</div>
                  <div className="v">{followUpNote}</div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className={`btn btn-primary btn-sm${pending ? " loading" : ""}`}
                onClick={() => clear(true)}
                disabled={pending}
              >
                Markera klar
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => clear(false)}
                disabled={pending}
              >
                Ta bort
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="small muted">Påminn om att kontakta bolaget:</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PRESETS.map((preset) => (
                <button
                  key={preset.days}
                  type="button"
                  className="btn btn-sm"
                  disabled={pending}
                  onClick={() => save(isoDateInDays(preset.days))}
                >
                  Om {preset.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                className="input mono"
                type="date"
                aria-label="Eget datum"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                style={{ width: 150 }}
              />
              <button
                type="button"
                className="btn btn-sm"
                disabled={pending || !customDate}
                onClick={() => save(customDate)}
              >
                Sätt datum
              </button>
            </div>
            <input
              className="input"
              placeholder="Anteckning (valfri), t.ex. fråga efter ny HR-chef"
              aria-label="Anteckning till uppföljningen"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
            />
            <div className="field" style={{ maxWidth: 240 }}>
              <label htmlFor="fu-user">Vem följer upp?</label>
              <select
                className="select"
                id="fu-user"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.namn}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
