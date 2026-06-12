"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteCallListAction,
  removeFromCallListAction,
  toggleCalledAction,
} from "@/actions/ringlistor";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/modal";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/toast";
import { fmtDate, fmtDateTime, fmtNumber } from "@/lib/format";

export interface RinglistaItem {
  leadId: string;
  orgnr: string;
  namn: string;
  ort: string | null;
  telefon: string | null;
  telefonGoogle: boolean;
  /** Kontaktperson med direktnummer, när en finns – går före växeln. */
  kontaktNamn: string | null;
  kontaktTitel: string | null;
  status: string;
  ownerNamn: string | null;
  ringd: boolean;
  ringdAt: string | null;
  ringdAvNamn: string | null;
}

export function RinglistaView({
  listId,
  namn,
  createdByNamn,
  createdAt,
  items,
  canDelete,
}: {
  listId: string;
  namn: string;
  createdByNamn: string | null;
  createdAt: string;
  items: RinglistaItem[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  // Optimistisk avbockning: kryssrutan ska svara direkt i ringflödet.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const ringd = (item: RinglistaItem) => overrides[item.leadId] ?? item.ringd;
  const antalRingda = items.filter(ringd).length;
  const nextLeadId = items.find((item) => !ringd(item))?.leadId ?? null;

  function toggle(item: RinglistaItem) {
    const next = !ringd(item);
    setOverrides((current) => ({ ...current, [item.leadId]: next }));
    startTransition(async () => {
      const result = await toggleCalledAction({ listId, leadId: item.leadId, ringd: next });
      if (!result.ok) {
        setOverrides((current) => ({ ...current, [item.leadId]: !next }));
        toast(result.message, "err");
        return;
      }
      router.refresh();
    });
  }

  function remove(item: RinglistaItem) {
    startTransition(async () => {
      const result = await removeFromCallListAction({ listId, leadId: item.leadId });
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) router.refresh();
    });
  }

  function runDelete() {
    if (pending) return;
    startTransition(async () => {
      const result = await deleteCallListAction({ listId });
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) router.push("/ringlistor");
    });
  }

  return (
    <>
      <div className="view-head" style={{ marginBottom: 14 }}>
        <div>
          <h1>{namn}</h1>
          <p className="lede">
            {createdByNamn ? `Skapad av ${createdByNamn}` : "Ringlista"} ·{" "}
            <span className="mono">{fmtDate(createdAt)}</span> · {fmtNumber(items.length)}{" "}
            bolag
          </p>
        </div>
        {canDelete && (
          <div className="actions">
            <button
              type="button"
              className="btn"
              onClick={() => setConfirmDelete(true)}
              disabled={pending}
            >
              Ta bort listan
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div
          className="card-body"
          style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 14, paddingBottom: 14 }}
        >
          <div className="progress" style={{ flex: 1 }}>
            <span
              style={{
                width: `${items.length === 0 ? 0 : Math.round((antalRingda / items.length) * 100)}%`,
              }}
            />
          </div>
          <strong className="mono" style={{ whiteSpace: "nowrap", fontSize: 13 }}>
            {fmtNumber(antalRingda)} av {fmtNumber(items.length)} avbockade
          </strong>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <EmptyState
              title="Listan är tom"
              description="Alla rader har tagits bort. Skapa en ny lista från bolagslistan."
              action={
                <Link className="btn btn-sm" href="/bolag">
                  Till bolagslistan
                </Link>
              }
            />
          </div>
        </div>
      ) : (
        <div className="table-shell">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>
                    <span className="sr-only">Avbockad</span>
                  </th>
                  <th>Bolagsnamn</th>
                  <th>Ort</th>
                  <th>Telefon</th>
                  <th>Status</th>
                  <th>Ansvarig</th>
                  <th>Avbockad</th>
                  <th style={{ width: 60 }} />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const done = ringd(item);
                  return (
                    <tr
                      key={item.leadId}
                      className={done ? "ringd" : item.leadId === nextLeadId ? "next-call" : undefined}
                    >
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Bocka av ${item.namn}`}
                          checked={done}
                          onChange={() => toggle(item)}
                        />
                      </td>
                      <td className="namn">
                        <Link href={`/bolag/${item.orgnr}`}>{item.namn}</Link>
                        <span className="faint small mono" style={{ marginLeft: 8 }}>
                          {item.orgnr}
                        </span>
                      </td>
                      <td>{item.ort ?? "–"}</td>
                      <td className="mono">
                        {item.telefon ? (
                          <a href={`tel:${item.telefon.replace(/[^\d+]/g, "")}`}>
                            {item.telefon}
                          </a>
                        ) : (
                          "–"
                        )}
                        {item.kontaktNamn && (
                          <span
                            className="faint small"
                            style={{ marginLeft: 6, fontFamily: "var(--font-ui)" }}
                            title={
                              item.kontaktTitel
                                ? `${item.kontaktNamn} (${item.kontaktTitel})`
                                : item.kontaktNamn
                            }
                          >
                            {item.kontaktNamn.split(" ")[0]}
                          </span>
                        )}
                        {item.telefon && item.telefonGoogle && (
                          <span
                            className="faint small"
                            title="Hämtat via Google – kan vara växelnummer"
                            style={{ marginLeft: 6 }}
                          >
                            via Google
                          </span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={item.status} />
                      </td>
                      <td>{item.ownerNamn ?? <span className="faint small">Ej tilldelad</span>}</td>
                      <td className="small faint">
                        {done && item.ringdAt
                          ? `${fmtDateTime(item.ringdAt).slice(5)}${item.ringdAvNamn ? ` · ${item.ringdAvNamn.split(" ")[0]}` : ""}`
                          : done
                            ? "Nyss"
                            : "–"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Ta bort ur listan"
                          aria-label={`Ta bort ${item.namn} ur listan`}
                          onClick={() => remove(item)}
                          disabled={pending}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="small faint" style={{ marginTop: 10 }}>
        Avbockningar syns i bolagets tidslinje och räknas i säljarstatistiken. Nästa
        bolag att ringa är markerat med mässingskanten.
      </p>

      <ConfirmDialog
        open={confirmDelete}
        title={`Ta bort "${namn}"?`}
        body={`Listan med ${fmtNumber(items.length)} bolag försvinner för hela teamet. Bolagen och deras leads påverkas inte.`}
        actionLabel="Ta bort listan"
        destructive
        busy={pending}
        onConfirm={runDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
