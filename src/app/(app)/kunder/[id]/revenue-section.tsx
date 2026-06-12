"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteCustomerRevenueAction,
  updateCustomerRevenueAction,
} from "@/actions/customers";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { fmtDate, fmtKr, parseSekInput } from "@/lib/format";
import { RevenueForm } from "./kund-actions";

export interface RevenueEntry {
  id: string;
  amountSek: number;
  beskrivning: string | null;
  datum: string;
  authorId: string | null;
  authorNamn: string | null;
}

/**
 * Intäktslistan med rättningsmöjlighet: den som registrerade en post
 * (eller admin) kan redigera den inline eller ta bort den. Varje
 * ändring loggas med före/efter-belopp i kundens aktivitet.
 */
export function RevenueSection({
  customerId,
  entries,
  currentUserId,
  isAdmin,
}: {
  customerId: string;
  entries: RevenueEntry[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editBeskrivning, setEditBeskrivning] = useState("");
  const [editDatum, setEditDatum] = useState("");
  const [deleteEntry, setDeleteEntry] = useState<RevenueEntry | null>(null);

  const total = entries.reduce((sum, e) => sum + e.amountSek, 0);
  const canManage = (entry: RevenueEntry) =>
    isAdmin || entry.authorId === currentUserId;

  function startEdit(entry: RevenueEntry) {
    setEditingId(entry.id);
    setEditAmount(String(entry.amountSek));
    setEditBeskrivning(entry.beskrivning ?? "");
    setEditDatum(entry.datum);
  }

  function saveEdit() {
    if (pending || !editingId) return;
    const parsed = parseSekInput(editAmount);
    if (parsed === null || parsed <= 0) {
      toast("Ange ett belopp i kr, t.ex. 150 000.", "err");
      return;
    }
    startTransition(async () => {
      const result = await updateCustomerRevenueAction({
        revenueId: editingId,
        amountSek: parsed,
        beskrivning: editBeskrivning.trim() || undefined,
        datum: editDatum,
      });
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) {
        setEditingId(null);
        router.refresh();
      }
    });
  }

  function confirmDelete() {
    if (pending || !deleteEntry) return;
    startTransition(async () => {
      const result = await deleteCustomerRevenueAction({ revenueId: deleteEntry.id });
      toast(result.message, result.ok ? "info" : "err");
      setDeleteEntry(null);
      if (result.ok) router.refresh();
    });
  }

  return (
    <>
      {entries.length === 0 ? (
        <EmptyState
          title="Inga intäkter registrerade"
          description="Registrera vad ni fakturerat eller tjänat på kunden så syns totalsumman här och i topplistan."
        />
      ) : (
        <div className="table-wrap" style={{ margin: "-6px 0 6px" }}>
          <table className="data">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Beskrivning</th>
                <th>Registrerad av</th>
                <th className="num">Belopp</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) =>
                editingId === entry.id ? (
                  <tr key={entry.id}>
                    <td>
                      <input
                        className="input mono"
                        type="date"
                        aria-label="Datum"
                        value={editDatum}
                        onChange={(e) => setEditDatum(e.target.value)}
                        style={{ width: 140, padding: "4px 8px" }}
                      />
                    </td>
                    <td style={{ whiteSpace: "normal" }}>
                      <input
                        className="input"
                        aria-label="Beskrivning"
                        value={editBeskrivning}
                        onChange={(e) => setEditBeskrivning(e.target.value)}
                        maxLength={300}
                        style={{ width: "100%", padding: "4px 8px" }}
                      />
                    </td>
                    <td>{entry.authorNamn ?? "–"}</td>
                    <td className="num">
                      <input
                        className="input mono"
                        aria-label="Belopp i kronor"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        style={{ width: 130, padding: "4px 8px", textAlign: "right" }}
                      />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        <button
                          type="button"
                          className={`btn btn-primary btn-sm${pending ? " loading" : ""}`}
                          onClick={saveEdit}
                          disabled={pending}
                        >
                          Spara
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setEditingId(null)}
                          disabled={pending}
                        >
                          Avbryt
                        </button>
                      </span>
                    </td>
                  </tr>
                ) : (
                  <tr key={entry.id}>
                    <td className="mono small">{fmtDate(entry.datum)}</td>
                    <td style={{ whiteSpace: "normal" }}>{entry.beskrivning ?? "–"}</td>
                    <td>{entry.authorNamn ?? "–"}</td>
                    <td className="num">{fmtKr(entry.amountSek)}</td>
                    <td style={{ textAlign: "right" }}>
                      {canManage(entry) && (
                        <span style={{ display: "inline-flex", gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => startEdit(entry)}
                            disabled={pending}
                          >
                            Redigera
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: "var(--error)" }}
                            onClick={() => setDeleteEntry(entry)}
                            disabled={pending}
                          >
                            Ta bort
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ),
              )}
              <tr>
                <td colSpan={3} style={{ fontWeight: 700 }}>
                  Totalt intjänat
                </td>
                <td className="num" style={{ fontWeight: 700 }}>
                  {fmtKr(total)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <RevenueForm customerId={customerId} />

      <ConfirmDialog
        open={deleteEntry !== null}
        title="Ta bort intäkten?"
        body={`Posten på ${deleteEntry ? fmtKr(deleteEntry.amountSek) : ""}${deleteEntry?.beskrivning ? ` (${deleteEntry.beskrivning})` : ""} tas bort och totalsumman räknas om. Borttagningen loggas i kundens aktivitet.`}
        actionLabel="Ta bort"
        destructive
        busy={pending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteEntry(null)}
      />
    </>
  );
}
