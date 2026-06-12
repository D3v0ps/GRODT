"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createManualCustomerAction } from "@/actions/customers";
import { AvatarWithName } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { IconDownload, IconSearch } from "@/components/icons";
import { KundStatusBadge } from "@/components/kund-status-badge";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { KUND_STATUSES } from "@/lib/constants";
import { fmtDate, fmtKr, fmtNumber } from "@/lib/format";
import {
  KUNDER_PAGE_SIZE,
  kundParamsToQuery,
  type CustomerListRow,
  type KundListParams,
  type KundSortKey,
} from "@/lib/customer-params";

interface UserOption {
  id: string;
  namn: string;
}

interface Props {
  rows: CustomerListRow[];
  total: number;
  params: KundListParams;
  controllers: UserOption[];
}

export function KunderTable({ rows, total, params, controllers }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState(params.sok);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [orgnr, setOrgnr] = useState("");
  const [namn, setNamn] = useState("");
  const [ort, setOrt] = useState("");
  const [controllerId, setControllerId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setSearch(params.sok);
  }, [params.sok]);

  function navigate(next: Partial<KundListParams>, resetPage = true) {
    const merged: Partial<KundListParams> = { ...params, ...next };
    if (resetPage) merged.sida = 1;
    router.push(`/kunder?${kundParamsToQuery(merged).toString()}`);
  }

  function onSearchChange(value: string) {
    setSearch(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => navigate({ sok: value }), 300);
  }

  function sortHref(key: KundSortKey): string {
    const dir = params.sort === key && params.dir === "asc" ? "desc" : "asc";
    return `/kunder?${kundParamsToQuery({ ...params, sort: key, dir, sida: 1 }).toString()}`;
  }

  function sortArrow(key: KundSortKey): string {
    if (params.sort !== key) return "";
    return params.dir === "asc" ? "▲" : "▼";
  }

  function ariaSort(key: KundSortKey): "ascending" | "descending" | undefined {
    if (params.sort !== key) return undefined;
    return params.dir === "asc" ? "ascending" : "descending";
  }

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await createManualCustomerAction({
        orgnr: orgnr.trim(),
        namn: namn.trim(),
        ort: ort.trim() || undefined,
        controllerId: controllerId || null,
      });
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      toast(result.message, "ok");
      setAddOpen(false);
      setOrgnr("");
      setNamn("");
      setOrt("");
      setControllerId("");
      router.refresh();
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / KUNDER_PAGE_SIZE));
  const page = Math.min(params.sida, totalPages);
  const start = (page - 1) * KUNDER_PAGE_SIZE;
  const hasFilters = params.sok !== "" || params.status || params.controller;

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Kunder</h1>
          <p className="lede">
            Vunna bolag som lämnats över från sälj. Här följer ni upp arbetet och
            intäkterna per kund.
          </p>
        </div>
        <div className="actions">
          <a
            className="btn"
            href={`/api/export/kunder${kundParamsToQuery({ ...params, sida: 1 }).size > 0 ? `?${kundParamsToQuery({ ...params, sida: 1 }).toString()}` : ""}`}
          >
            <IconDownload />
            Kunder CSV
          </a>
          <a className="btn" href="/api/export/intakter">
            <IconDownload />
            Intäkter CSV
          </a>
          <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
            Lägg till kund
          </button>
        </div>
      </div>

      <div className="table-shell">
        <div className="table-toolbar">
          <span className="search">
            <IconSearch />
            <input
              className="input"
              type="search"
              placeholder="Sök kund, orgnr eller ort …"
              aria-label="Sök kund"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </span>
          <select
            className="select"
            aria-label="Filtrera på status"
            value={params.status ?? ""}
            onChange={(e) =>
              navigate({ status: (e.target.value || undefined) as KundListParams["status"] })
            }
          >
            <option value="">Alla statusar</option>
            {KUND_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            className="select"
            aria-label="Filtrera på controller"
            value={params.controller ?? ""}
            onChange={(e) => navigate({ controller: e.target.value || undefined })}
          >
            <option value="">Alla controllers</option>
            {controllers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.namn}
              </option>
            ))}
          </select>
          <span className="spacer" />
          <span className="result-count">{fmtNumber(total)} kunder</span>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="sortable" aria-sort={ariaSort("namn")}>
                  <Link href={sortHref("namn")}>
                    Kund<span className="sort-arrow">{sortArrow("namn")}</span>
                  </Link>
                </th>
                <th>Orgnr</th>
                <th>Status</th>
                <th>Säljare</th>
                <th>Controller</th>
                <th className="num sortable" aria-sort={ariaSort("intjanat")}>
                  <Link href={sortHref("intjanat")}>
                    Intjänat<span className="sort-arrow">{sortArrow("intjanat")}</span>
                  </Link>
                </th>
                <th className="sortable" aria-sort={ariaSort("overlamnad")}>
                  <Link href={sortHref("overlamnad")}>
                    Överlämnad<span className="sort-arrow">{sortArrow("overlamnad")}</span>
                  </Link>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ height: "auto", whiteSpace: "normal" }}>
                    {hasFilters ? (
                      <EmptyState
                        title="Inga kunder matchar filtren"
                        description="Prova att bredda sökningen eller rensa ett filter."
                        action={
                          <Link className="btn btn-sm" href="/kunder">
                            Rensa alla filter
                          </Link>
                        }
                      />
                    ) : (
                      <EmptyState
                        title="Inga kunder ännu"
                        description="När en säljare vunnit ett bolag lämnas det över här – eller lägg till en befintlig kund manuellt."
                        action={
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setAddOpen(true)}
                          >
                            Lägg till kund
                          </button>
                        }
                      />
                    )}
                  </td>
                </tr>
              ) : (
                rows.map((row) => <KundRow key={row.customer_id} row={row} />)
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <span>
            {rows.length === 0
              ? ""
              : `Visar ${fmtNumber(start + 1)}–${fmtNumber(start + rows.length)} av ${fmtNumber(total)}`}
          </span>
          <span className="pages">
            {totalPages > 1 &&
              Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    totalPages <= 9 || p === 1 || p === totalPages || Math.abs(p - page) <= 2,
                )
                .map((p, i, arr) => (
                  <span key={p} style={{ display: "inline-flex", gap: 4 }}>
                    {i > 0 && arr[i - 1] !== p - 1 && <span className="gap">…</span>}
                    <Link
                      className={p === page ? "current" : undefined}
                      aria-label={`Sida ${p}`}
                      aria-current={p === page ? "page" : undefined}
                      href={`/kunder?${kundParamsToQuery({ ...params, sida: p }).toString()}`}
                    >
                      {p}
                    </Link>
                  </span>
                ))}
          </span>
        </div>
      </div>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        titleId="nk-title"
        title="Lägg till kund"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setAddOpen(false)}>
              Avbryt
            </button>
            <button
              type="submit"
              form="add-customer-form"
              className={`btn btn-primary${pending ? " loading" : ""}`}
              disabled={pending}
            >
              Lägg till
            </button>
          </>
        }
      >
        <form
          id="add-customer-form"
          onSubmit={submitAdd}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div className="field">
            <label htmlFor="nk-orgnr">Organisationsnummer</label>
            <input
              className="input mono"
              id="nk-orgnr"
              required
              placeholder="556712-4830"
              value={orgnr}
              onChange={(e) => setOrgnr(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="nk-namn">Bolagsnamn</label>
            <input
              className="input"
              id="nk-namn"
              required
              placeholder="Bolaget AB"
              value={namn}
              onChange={(e) => setNamn(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="nk-ort">Ort</label>
            <input
              className="input"
              id="nk-ort"
              placeholder="Stockholm"
              value={ort}
              onChange={(e) => setOrt(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="nk-controller">Controller</label>
            <select
              className="select"
              id="nk-controller"
              value={controllerId}
              onChange={(e) => setControllerId(e.target.value)}
            >
              <option value="">Ingen ännu</option>
              {controllers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.namn}
                </option>
              ))}
            </select>
          </div>
          {formError && (
            <div className="field">
              <span className="error-text">{formError}</span>
            </div>
          )}
          <p className="small faint">
            Finns bolaget redan i bolagslistan kopplas kunden dit; annars skapas det
            (källa: manuell). Allt loggas.
          </p>
        </form>
      </Modal>
    </>
  );
}

function KundRow({ row }: { row: CustomerListRow }) {
  const router = useRouter();

  function open() {
    router.push(`/kunder/${row.customer_id}`);
  }

  return (
    <tr
      className="clickable"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter") open();
      }}
    >
      <td className="namn">{row.namn}</td>
      <td className="org mono">{row.orgnr}</td>
      <td>
        <KundStatusBadge status={row.status} />
      </td>
      <td>
        {row.saljare_id && row.saljare_namn ? (
          <AvatarWithName id={row.saljare_id} namn={row.saljare_namn} />
        ) : (
          <span className="faint small">–</span>
        )}
      </td>
      <td>
        {row.controller_id && row.controller_namn ? (
          <AvatarWithName id={row.controller_id} namn={row.controller_namn} />
        ) : (
          <span className="faint small">Ej tilldelad</span>
        )}
      </td>
      <td className="num">{row.intjanat > 0 ? fmtKr(row.intjanat) : "–"}</td>
      <td className="mono small">{fmtDate(row.overlamnad_at)}</td>
    </tr>
  );
}
