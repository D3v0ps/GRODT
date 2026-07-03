"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { addLeadAction, bulkAssignAction } from "@/actions/leads";
import { createCallListAction } from "@/actions/ringlistor";
import { EmptyState } from "@/components/empty-state";
import { IconDownload, IconFlame, IconMoneyBag, IconPhone, IconSearch } from "@/components/icons";
import { ConfirmDialog, Modal } from "@/components/modal";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/toast";
import { AvatarWithName } from "@/components/avatar";
import { branschKlassLabel, isMalgrupp, LEAD_STATUSES, sniLabel } from "@/lib/constants";
import { fmtKr, fmtNumber, fmtPercent, todayStockholm } from "@/lib/format";
import { likelyStaffing } from "@/lib/target";
import {
  PAGE_SIZE,
  listParamsToQuery,
  type LeadListRow,
  type ListParams,
  type SortKey,
} from "@/lib/list-params";

interface UserOption {
  id: string;
  namn: string;
}

interface Props {
  rows: LeadListRow[];
  total: number;
  params: ListParams;
  /** Fyraårsfönstret som visas som kolumner, t.ex. [2021, 2022, 2023, 2024]. */
  years: [number, number, number, number];
  /** Kvalificeringsåren ur Inställningar – får röd punkt vid ELLER-kvalificering. */
  qualYears: [number, number];
  threshold: number;
  sniCodes: string[];
  orter: string[];
  users: UserOption[];
  /** Antal leads utanför målbilden (dolda om inte toggeln är på). */
  offTargetCount: number;
}

const OMS_SORT_KEYS = ["oms1", "oms2", "oms3", "oms4"] as const;

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: "namn", label: "Bolagsnamn" },
  { key: "ort", label: "Ort" },
];

export function BolagTable({
  rows,
  total,
  params,
  years,
  qualYears,
  threshold,
  sniCodes,
  orter,
  users,
  offTargetCount,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(params.sok);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOwner, setBulkOwner] = useState("");
  const [confirmUnassign, setConfirmUnassign] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addOrgnr, setAddOrgnr] = useState("");
  const [addNamn, setAddNamn] = useState("");
  const [addOrt, setAddOrt] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [rlOpen, setRlOpen] = useState(false);
  const [rlNamn, setRlNamn] = useState("");
  const [rlScope, setRlScope] = useState<"markerade" | "filter">("filter");
  const [rlError, setRlError] = useState<string | null>(null);

  useEffect(() => {
    // Skriv inte över pågående inmatning – det är bara extern navigering
    // (t.ex. "Rensa alla filter") som ska återställa sökfältet. Utan
    // vakten raderas slutet av söktexten när ett äldre sidsvar hinner
    // ikapp en snabb skrivning.
    if (debounce.current === null && document.activeElement !== searchRef.current) {
      setSearch(params.sok);
    }
  }, [params.sok]);

  // Rensa markeringen när listan byter innehåll (sida/filter).
  useEffect(() => {
    setSelected(new Set());
  }, [rows]);

  function toggleSelected(leadId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.lead_id));

  function toggleAll() {
    setSelected(allOnPageSelected ? new Set() : new Set(rows.map((r) => r.lead_id)));
  }

  function runBulkAssign() {
    // Kräver ett uttryckligt val – ingen tyst "ta bort tilldelning" som
    // default, och borttagning bekräftas separat.
    if (pending || selected.size === 0 || bulkOwner === "") return;
    if (bulkOwner === "__remove" && !confirmUnassign) {
      setConfirmUnassign(true);
      return;
    }
    setConfirmUnassign(false);
    startTransition(async () => {
      const result = await bulkAssignAction({
        leadIds: [...selected],
        ownerId: bulkOwner === "__remove" ? null : bulkOwner,
      });
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) {
        setSelected(new Set());
        setBulkOwner("");
        router.refresh();
      }
    });
  }

  function openRinglista(scope: "markerade" | "filter") {
    setRlScope(selected.size > 0 ? scope : "filter");
    setRlNamn(`Ringlista ${todayStockholm()}`);
    setRlError(null);
    setRlOpen(true);
  }

  function submitRinglista(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setRlError(null);
    startTransition(async () => {
      const result = await createCallListAction(
        rlScope === "markerade" && selected.size > 0
          ? {
              namn: rlNamn,
              // Markeringsordningen följer tabellens aktuella sortering.
              leadIds: rows.filter((r) => selected.has(r.lead_id)).map((r) => r.lead_id),
            }
          : {
              namn: rlNamn,
              filter: Object.fromEntries(listParamsToQuery({ ...params, sida: 1 })),
            },
      );
      if (!result.ok) {
        setRlError(result.message);
        return;
      }
      toast(result.message, "ok");
      setRlOpen(false);
      setSelected(new Set());
      if (result.listId) router.push(`/ringlistor/${result.listId}`);
    });
  }

  function submitAddLead(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setAddError(null);
    startTransition(async () => {
      const result = await addLeadAction({
        orgnr: addOrgnr.trim(),
        namn: addNamn.trim() || undefined,
        ort: addOrt.trim() || undefined,
      });
      if (!result.ok) {
        setAddError(result.message);
        return;
      }
      toast(result.message, "ok");
      setAddOpen(false);
      setAddOrgnr("");
      setAddNamn("");
      setAddOrt("");
      router.refresh();
    });
  }

  function navigate(next: Partial<ListParams>, resetPage = true) {
    const merged: Partial<ListParams> = { ...params, ...next };
    if (resetPage) merged.sida = 1;
    router.push(`/bolag?${listParamsToQuery(merged).toString()}`);
  }

  function onSearchChange(value: string) {
    setSearch(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      debounce.current = null;
      navigate({ sok: value });
    }, 300);
  }

  function sortHref(key: SortKey): string {
    const dir = params.sort === key && params.dir === "asc" ? "desc" : "asc";
    const q = listParamsToQuery({ ...params, sort: key, dir, sida: 1 });
    return `/bolag?${q.toString()}`;
  }

  function sortArrow(key: SortKey): string {
    if (params.sort !== key) return "";
    return params.dir === "asc" ? "▲" : "▼";
  }

  function ariaSort(key: SortKey): "ascending" | "descending" | undefined {
    if (params.sort !== key) return undefined;
    return params.dir === "asc" ? "ascending" : "descending";
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.sida, totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const exportQuery = listParamsToQuery({ ...params, sida: 1 }).toString();
  const hasFilters =
    params.sok !== "" || params.status || params.ort || params.ansvarig || params.oms;

  const pageNumbers = buildPageWindow(page, totalPages);

  return (
    <>
      <div className="view-head" style={{ marginBottom: 20 }}>
        <div>
          <h1>Bolag</h1>
          <p className="lede">
            Målbild: {sniCodes.map((c) => sniLabel(c)).join(" · ")} · nettoomsättning ≥{" "}
            {fmtKr(threshold)} för minst ett av åren {qualYears[0]}/{qualYears[1]}
          </p>
        </div>
        <div className="actions">
          {(total > 0 || selected.size > 0) && (
            <button type="button" className="btn" onClick={() => openRinglista("markerade")}>
              <IconPhone />
              Spara som ringlista
            </button>
          )}
          <a className="btn" href={`/api/export/csv${exportQuery ? `?${exportQuery}` : ""}`}>
            <IconDownload />
            Exportera CSV
          </a>
          <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
            Lägg till bolag
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div
          className="banner info"
          style={{ marginBottom: 14, alignItems: "center", gap: 12 }}
        >
          <strong style={{ whiteSpace: "nowrap" }}>{selected.size} markerade</strong>
          <select
            className="select"
            aria-label="Tilldela markerade till"
            value={bulkOwner}
            onChange={(e) => setBulkOwner(e.target.value)}
            style={{ maxWidth: 220 }}
          >
            <option value="">Välj säljare …</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.namn}
              </option>
            ))}
            <option value="__remove">Ta bort tilldelning</option>
          </select>
          <button
            type="button"
            className={`btn btn-primary btn-sm${pending ? " loading" : ""}`}
            onClick={runBulkAssign}
            disabled={pending || bulkOwner === ""}
          >
            Tilldela
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => openRinglista("markerade")}
            disabled={pending}
          >
            Spara som ringlista
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setSelected(new Set())}
            disabled={pending}
          >
            Avmarkera alla
          </button>
        </div>
      )}

      <div className="table-shell">
        <div className="table-toolbar">
          <span className="search">
            <IconSearch />
            <input
              ref={searchRef}
              className="input"
              type="search"
              placeholder="Sök bolag, orgnr eller ort …"
              aria-label="Sök bolag"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </span>
          <select
            className="select"
            aria-label="Filtrera på status"
            value={params.status ?? ""}
            onChange={(e) =>
              navigate({ status: (e.target.value || undefined) as ListParams["status"] })
            }
          >
            <option value="">Alla statusar</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            className="select"
            aria-label="Filtrera på ort"
            value={params.ort ?? ""}
            onChange={(e) => navigate({ ort: e.target.value || undefined })}
          >
            <option value="">Alla orter</option>
            {orter.map((ort) => (
              <option key={ort} value={ort}>
                {ort}
              </option>
            ))}
          </select>
          <select
            className="select"
            aria-label="Filtrera på omsättning"
            value={params.oms ? String(params.oms) : ""}
            onChange={(e) =>
              navigate({ oms: e.target.value ? Number(e.target.value) : undefined })
            }
          >
            <option value="">Omsättning: alla</option>
            <option value="5">≥ 5 mkr</option>
            <option value="10">≥ 10 mkr</option>
            <option value="20">≥ 20 mkr</option>
          </select>
          <select
            className="select"
            aria-label="Filtrera på tillväxt"
            value={params.vaxt !== undefined ? String(params.vaxt) : ""}
            onChange={(e) =>
              navigate({ vaxt: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          >
            <option value="">Tillväxt: alla</option>
            <option value="0.1">Växer</option>
            <option value="10">≥ 10 %</option>
            <option value="25">≥ 25 %</option>
          </select>
          <select
            className="select"
            aria-label="Filtrera på ansvarig"
            value={params.ansvarig ?? ""}
            onChange={(e) => navigate({ ansvarig: e.target.value || undefined })}
          >
            <option value="">Alla ansvariga</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.namn}
              </option>
            ))}
          </select>
          {(offTargetCount > 0 || params.utanfor) && (
            <label
              className="malbild-toggle"
              title="Bolag vars SNI ligger utanför målbilden (t.ex. personaluthyrning) döljs som standard"
            >
              <input
                type="checkbox"
                checked={params.utanfor ?? false}
                onChange={(e) => navigate({ utanfor: e.target.checked ? true : undefined })}
              />
              Visa utanför målbild
              {offTargetCount > 0 && <span className="faint"> ({fmtNumber(offTargetCount)})</span>}
            </label>
          )}
          <span className="spacer" />
          <span className="result-count">{fmtNumber(total)} bolag</span>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 34 }}>
                  <input
                    type="checkbox"
                    aria-label="Markera alla på sidan"
                    checked={allOnPageSelected}
                    onChange={toggleAll}
                  />
                </th>
                {COLUMNS.slice(0, 1).map((c) => (
                  <th key={c.key} className="sortable" aria-sort={ariaSort(c.key)}>
                    <Link href={sortHref(c.key)}>
                      {c.label}
                      <span className="sort-arrow">{sortArrow(c.key)}</span>
                    </Link>
                  </th>
                ))}
                <th>Orgnr</th>
                {COLUMNS.slice(1).map((c) => (
                  <th key={c.key} className="sortable" aria-sort={ariaSort(c.key)}>
                    <Link href={sortHref(c.key)}>
                      {c.label}
                      <span className="sort-arrow">{sortArrow(c.key)}</span>
                    </Link>
                  </th>
                ))}
                {years.map((year, index) => (
                  <th
                    key={year}
                    className="num sortable"
                    aria-sort={ariaSort(OMS_SORT_KEYS[index])}
                  >
                    <Link href={sortHref(OMS_SORT_KEYS[index])}>
                      Omsättning {year}
                      <span className="sort-arrow">{sortArrow(OMS_SORT_KEYS[index])}</span>
                    </Link>
                  </th>
                ))}
                <th className="num sortable" aria-sort={ariaSort("tillvaxt")}>
                  <Link href={sortHref("tillvaxt")}>
                    Tillväxt
                    <span className="sort-arrow">{sortArrow("tillvaxt")}</span>
                  </Link>
                </th>
                <th className="num sortable" aria-sort={ariaSort("anst")}>
                  <Link href={sortHref("anst")}>
                    Anställda
                    <span className="sort-arrow">{sortArrow("anst")}</span>
                  </Link>
                </th>
                <th>Status</th>
                <th>Ansvarig</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ height: "auto", whiteSpace: "normal" }}>
                    {hasFilters ? (
                      <EmptyState
                        title="Inga bolag matchar filtren"
                        description="Prova att bredda sökningen eller rensa ett filter – radarn hittar inget i det här svepet."
                        action={
                          <Link className="btn btn-sm" href="/bolag">
                            Rensa alla filter
                          </Link>
                        }
                      />
                    ) : (
                      <EmptyState
                        title="Radarn har inte hittat några bolag ännu"
                        description="Importera din CSV-fil eller kör en synk under Import & synk för att fylla listan."
                        action={
                          <Link className="btn btn-sm" href="/synk">
                            Till Import &amp; synk
                          </Link>
                        }
                      />
                    )}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <BolagRow
                    key={row.lead_id}
                    row={row}
                    years={years}
                    qualYears={qualYears}
                    threshold={threshold}
                    sniCodes={sniCodes}
                    selected={selected.has(row.lead_id)}
                    onToggleSelected={() => toggleSelected(row.lead_id)}
                  />
                ))
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
              pageNumbers.map((p, i) =>
                p === null ? (
                  <span key={`gap-${i}`} className="gap">
                    …
                  </span>
                ) : (
                  <Link
                    key={p}
                    className={p === page ? "current" : undefined}
                    aria-label={`Sida ${p}`}
                    aria-current={p === page ? "page" : undefined}
                    href={`/bolag?${listParamsToQuery({ ...params, sida: p }).toString()}`}
                  >
                    {p}
                  </Link>
                ),
              )}
          </span>
        </div>
      </div>

      <p className="small faint" style={{ marginTop: 10 }}>
        Mässingspunkten <span className="qual-mark" style={{ margin: "0 2px" }} /> markerar
        året som kvalificerar bolaget när det andra året ligger under tröskeln. Dämpade
        belopp ligger under {fmtKr(threshold)}.
      </p>

      <ConfirmDialog
        open={confirmUnassign}
        title="Ta bort tilldelningen?"
        body={`${selected.size} markerade leads blir utan ansvarig säljare och hamnar bland de otilldelade.`}
        actionLabel="Ta bort tilldelning"
        destructive
        busy={pending}
        onConfirm={runBulkAssign}
        onCancel={() => setConfirmUnassign(false)}
      />

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        titleId="al-title"
        title="Lägg till bolag"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setAddOpen(false)}>
              Avbryt
            </button>
            <button
              type="submit"
              form="add-lead-form"
              className={`btn btn-primary${pending ? " loading" : ""}`}
              disabled={pending}
            >
              Lägg till som lead
            </button>
          </>
        }
      >
        <form
          id="add-lead-form"
          onSubmit={submitAddLead}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div className="field">
            <label htmlFor="al-orgnr">Organisationsnummer</label>
            <input
              className="input mono"
              id="al-orgnr"
              required
              placeholder="556712-4830"
              value={addOrgnr}
              onChange={(e) => setAddOrgnr(e.target.value)}
            />
            <span className="hint">
              Namn, ort, SNI och bokslut hämtas automatiskt från Bolagsverket.
            </span>
          </div>
          <div className="field">
            <label htmlFor="al-namn">Bolagsnamn (valfritt)</label>
            <input
              className="input"
              id="al-namn"
              placeholder="Fylls i automatiskt"
              value={addNamn}
              onChange={(e) => setAddNamn(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="al-ort">Ort (valfri)</label>
            <input
              className="input"
              id="al-ort"
              placeholder="Fylls i automatiskt"
              value={addOrt}
              onChange={(e) => setAddOrt(e.target.value)}
            />
          </div>
          {addError && (
            <div className="field">
              <span className="error-text">{addError}</span>
            </div>
          )}
          <p className="small faint">
            Bolaget läggs in som lead med status Ny och tilldelas dig.
          </p>
        </form>
      </Modal>

      <Modal
        open={rlOpen}
        onClose={() => setRlOpen(false)}
        titleId="rl-title"
        title="Spara som ringlista"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setRlOpen(false)}>
              Avbryt
            </button>
            <button
              type="submit"
              form="ringlista-form"
              className={`btn btn-primary${pending ? " loading" : ""}`}
              disabled={pending}
            >
              Skapa ringlista
            </button>
          </>
        }
      >
        <form
          id="ringlista-form"
          onSubmit={submitRinglista}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div className="field">
            <label htmlFor="rl-namn">Namn på listan</label>
            <input
              className="input"
              id="rl-namn"
              required
              maxLength={80}
              value={rlNamn}
              onChange={(e) => setRlNamn(e.target.value)}
            />
          </div>
          <fieldset className="field" style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="small" style={{ fontWeight: 600, color: "var(--ink-2)" }}>
              Vilka bolag?
            </legend>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input
                type="radio"
                name="rl-scope"
                checked={rlScope === "markerade"}
                disabled={selected.size === 0}
                onChange={() => setRlScope("markerade")}
              />
              Markerade rader ({fmtNumber(selected.size)})
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input
                type="radio"
                name="rl-scope"
                checked={rlScope === "filter"}
                onChange={() => setRlScope("filter")}
              />
              Hela det aktiva filtret ({fmtNumber(total)} bolag{total > 500 ? ", de 500 första tas med" : ""})
            </label>
          </fieldset>
          {rlError && (
            <div className="field">
              <span className="error-text">{rlError}</span>
            </div>
          )}
          <p className="small faint">
            Listan delas med hela teamet. Avregistrerade bolag hoppas över när hela
            filtret sparas.
          </p>
        </form>
      </Modal>
    </>
  );
}

function BolagRow({
  row,
  years,
  qualYears,
  threshold,
  sniCodes,
  selected,
  onToggleSelected,
}: {
  row: LeadListRow;
  years: [number, number, number, number];
  qualYears: [number, number];
  threshold: number;
  sniCodes: string[];
  selected: boolean;
  onToggleSelected: () => void;
}) {
  const router = useRouter();
  const values = [row.oms1, row.oms2, row.oms3, row.oms4];
  const underTitle = `Under tröskel ${fmtKr(threshold)}`;
  const markTitle = "Kvalificerande år (når tröskeln)";
  // Punkt på kvalificeringsåret när det andra kvalificeringsåret ligger
  // under tröskeln (ELLER-logiken synliggjord). Visas bara när båda
  // kvalificeringsåren faktiskt syns i fönstret – annars går jämförelsen
  // inte att göra.
  const qualVisible = qualYears.every((y) => years.includes(y));
  const qualValue = (year: number) => values[years.indexOf(year)] ?? null;
  const qualOver = (year: number) => {
    const v = qualValue(year);
    return v !== null && v >= threshold;
  };
  const showQualMark = (year: number) => {
    if (!qualVisible) return false;
    if (year !== qualYears[0] && year !== qualYears[1]) return false;
    const other = year === qualYears[0] ? qualYears[1] : qualYears[0];
    return qualOver(year) && !qualOver(other);
  };
  const sniMismatch =
    row.sni_kod !== null &&
    sniCodes.length > 0 &&
    !sniCodes.some((c) => c.replace(/\D/g, "") === row.sni_kod!.replace(/\D/g, ""));
  const growth = row.oms_tillvaxt_pct === null ? null : Number(row.oms_tillvaxt_pct);
  // Vad bolaget faktiskt gör – så säljaren ser det utan att klicka in.
  // Prioritet: verksamhetsbeskrivningen, annars branschklassen, annars SNI.
  const branschRad =
    row.verksamhet?.trim() ||
    branschKlassLabel(row.bransch_klass) ||
    (row.sni_kod ? sniLabel(row.sni_kod) : null);

  function open() {
    router.push(`/bolag/${row.orgnr}`);
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
      <td onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          aria-label={`Markera ${row.namn}`}
          checked={selected}
          onChange={onToggleSelected}
        />
      </td>
      <td className="namn">
        <span className="namn-rad">
          {row.namn}
          {!row.avregistrerad && !row.off_target_at && isMalgrupp(row.bransch_klass) && (
            <span
              className="flame-wrap"
              title={`AI-bedömd: ${branschKlassLabel(row.bransch_klass)} – rätt målgrupp`}
            >
              <IconFlame />
              <span className="sr-only">
                Bedömd målgrupp: {branschKlassLabel(row.bransch_klass)}
              </span>
            </span>
          )}
          {!row.avregistrerad && row.af_leverantor && (
            <span
              className="flame-wrap"
              title={`Godkänd Rusta och matcha-leverantör hos Arbetsförmedlingen${row.af_rating ? ` – betyg ${row.af_rating} av 5` : ""}. Upphandlad och betald av staten – het att jaga.`}
            >
              <IconMoneyBag />
              <span className="sr-only">Rusta och matcha-leverantör</span>
            </span>
          )}
          {row.avregistrerad && (
            <span className="badge st-fel" title="Avregistrerat hos Bolagsverket">
              <span className="dot" />
              Avreg.
            </span>
          )}
          {row.off_target_at && (
            <span
              className="badge st-forlorad"
              title={`Utanför målbilden${row.off_target_sni ? ` – SNI ${row.off_target_sni}` : ""}. Dolt ur listor och pipeline som standard.`}
            >
              <span className="dot" />
              {branschKlassLabel(row.bransch_klass) ?? "Utanför målbild"}
            </span>
          )}
          {!row.avregistrerad &&
            !row.off_target_at &&
            (row.bransch_klass === "personaluthyrning" || row.bransch_klass === "annat") && (
              <span
                className="badge st-forlorad"
                title="Bedömt utanför målbilden men behållet i pipelinen (manuellt val)"
              >
                <span className="dot" />
                {branschKlassLabel(row.bransch_klass)}
              </span>
            )}
          {!row.avregistrerad &&
            !row.off_target_at &&
            !row.bransch_klass &&
            sniMismatch && (
              <span
                className="badge st-forlorad"
                title={`Bolagets SNI är ${row.sni_kod} enligt Bolagsverket – utanför målbilden men behållet`}
              >
                <span className="dot" />
                SNI {row.sni_kod}
              </span>
            )}
          {!row.avregistrerad &&
            !row.off_target_at &&
            !row.bransch_klass &&
            !sniMismatch &&
            likelyStaffing(row.namn, row.verksamhet) && (
              <span
                className="badge st-kontaktad"
                title="Namnet/beskrivningen antyder personaluthyrning – kontrollera innan ni satsar"
              >
                <span className="dot" />
                Trolig uthyrning
              </span>
            )}
        </span>
        {branschRad && (
          <span className="bransch-sub" title={row.verksamhet ?? undefined}>
            {branschRad}
          </span>
        )}
      </td>
      <td className="org mono">{row.orgnr}</td>
      <td>{row.ort ?? "–"}</td>
      {years.map((year, index) => {
        const value = values[index];
        const under = value === null || value < threshold;
        return (
          <td
            key={year}
            className={`num${under ? " under" : ""}`}
            title={under && value !== null ? underTitle : undefined}
          >
            {value === null ? "–" : fmtKr(value)}
            {showQualMark(year) && <span className="qual-mark" title={markTitle} />}
          </td>
        );
      })}
      <td
        className="num"
        style={growth !== null && growth > 0 ? { color: "var(--ok)", fontWeight: 600 } : undefined}
        title={
          row.anst1 !== null && row.anst2 !== null
            ? `Anställda: ${row.anst1} → ${row.anst2}`
            : undefined
        }
      >
        {growth === null ? "–" : fmtPercent(growth, { sign: true })}
      </td>
      <td className="num">{row.antal_anstallda ?? "–"}</td>
      <td>
        <StatusBadge status={row.status} />
      </td>
      <td>
        {row.owner_id && row.owner_namn ? (
          <AvatarWithName id={row.owner_id} namn={row.owner_namn} />
        ) : (
          <span className="faint small">Ej tilldelad</span>
        )}
      </td>
    </tr>
  );
}

/** 1 … 4 5 [6] 7 8 … 12 – kompakt fönster runt aktuell sida. */
function buildPageWindow(page: number, totalPages: number): (number | null)[] {
  if (totalPages <= 9) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, totalPages]);
  for (let p = page - 2; p <= page + 2; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
}
