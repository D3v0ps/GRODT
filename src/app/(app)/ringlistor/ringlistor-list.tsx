"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteCallListAction } from "@/actions/ringlistor";
import { AvatarWithName } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { fmtDate, fmtNumber } from "@/lib/format";

export interface CallListRow {
  id: string;
  namn: string;
  createdBy: string | null;
  createdByNamn: string | null;
  createdAt: string;
  antal: number;
  ringda: number;
}

export function RinglistorList({
  rows,
  currentUserId,
  isAdmin,
}: {
  rows: CallListRow[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [toDelete, setToDelete] = useState<CallListRow | null>(null);

  function runDelete() {
    if (!toDelete || pending) return;
    startTransition(async () => {
      const result = await deleteCallListAction({ listId: toDelete.id });
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) {
        setToDelete(null);
        router.refresh();
      }
    });
  }

  if (rows.length === 0) {
    return (
      <div className="card">
        <div className="card-body">
          <EmptyState
            title="Inga ringlistor ännu"
            description='Gå till bolagslistan, filtrera eller markera rader och klicka "Spara som ringlista" – så har teamet en gemensam lista att beta av.'
            action={
              <Link className="btn btn-sm" href="/bolag">
                Till bolagslistan
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="table-shell">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Lista</th>
                <th style={{ width: 260 }}>Framsteg</th>
                <th>Skapad av</th>
                <th>Skapad</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const done = row.antal > 0 && row.ringda === row.antal;
                const canDelete = isAdmin || row.createdBy === currentUserId;
                return (
                  <tr
                    key={row.id}
                    className="clickable"
                    tabIndex={0}
                    onClick={() => router.push(`/ringlistor/${row.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") router.push(`/ringlistor/${row.id}`);
                    }}
                  >
                    <td className="namn">
                      {row.namn}
                      {done && (
                        <span className="badge st-kund" style={{ marginLeft: 8 }}>
                          <span className="dot" />
                          Klar
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="progress" style={{ flex: 1 }}>
                          <span
                            style={{
                              width: `${row.antal === 0 ? 0 : Math.round((row.ringda / row.antal) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="mono small" style={{ whiteSpace: "nowrap" }}>
                          {fmtNumber(row.ringda)}/{fmtNumber(row.antal)}
                        </span>
                      </div>
                    </td>
                    <td>
                      {row.createdBy && row.createdByNamn ? (
                        <AvatarWithName id={row.createdBy} namn={row.createdByNamn} />
                      ) : (
                        <span className="faint small">–</span>
                      )}
                    </td>
                    <td className="mono small">{fmtDate(row.createdAt)}</td>
                    <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "right" }}>
                      {canDelete && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setToDelete(row)}
                          disabled={pending}
                        >
                          Ta bort
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title={`Ta bort "${toDelete?.namn ?? ""}"?`}
        body={`Listan med ${fmtNumber(toDelete?.antal ?? 0)} bolag försvinner för hela teamet. Bolagen och deras leads påverkas inte.`}
        actionLabel="Ta bort listan"
        destructive
        busy={pending}
        onConfirm={runDelete}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
