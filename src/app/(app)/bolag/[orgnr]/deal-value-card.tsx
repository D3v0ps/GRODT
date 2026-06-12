"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setDealValueAction } from "@/actions/leads";
import { useToast } from "@/components/toast";
import { fmtKr, parseSekInput } from "@/lib/format";

/** Förväntat affärsvärde – grunden för pipelineprognosen i Statistik. */
export function DealValueCard({
  leadId,
  valueSek,
}: {
  leadId: string;
  valueSek: number | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save(next: number | null) {
    startTransition(async () => {
      const result = await setDealValueAction({ leadId, valueSek: next });
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    const parsed = parseSekInput(input);
    if (parsed === null) {
      setError("Ange ett belopp i kr, t.ex. 250 000.");
      return;
    }
    save(parsed);
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Affärsvärde</h2>
        {!editing && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setInput(valueSek ? String(valueSek) : "");
              setError(null);
              setEditing(true);
            }}
          >
            {valueSek ? "Ändra" : "Sätt värde"}
          </button>
        )}
      </div>
      <div className="card-body">
        {editing ? (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input mono"
                placeholder="Belopp i kr, t.ex. 250 000"
                aria-label="Förväntat affärsvärde i kronor"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={pending}
                style={{ flex: 1 }}
                aria-invalid={error ? true : undefined}
              />
              <button
                type="submit"
                className={`btn btn-primary btn-sm${pending ? " loading" : ""}`}
                disabled={pending}
              >
                Spara
              </button>
            </div>
            {error && <span className="error-text">{error}</span>}
            <div style={{ display: "flex", gap: 8 }}>
              {valueSek !== null && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => save(null)}
                  disabled={pending}
                >
                  Ta bort värdet
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEditing(false)}
                disabled={pending}
              >
                Avbryt
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="v mono" style={{ fontSize: 20, fontWeight: 600 }}>
              {valueSek ? fmtKr(valueSek) : "–"}
            </div>
            <p className="small faint" style={{ margin: "6px 0 0" }}>
              Förväntat värde av affären. Syns på pipelinekortet och räknas in i
              prognosen under Statistik.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
