"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { IconError, IconUpload } from "@/components/icons";
import { useToast } from "@/components/toast";
import {
  decodeCsvBuffer,
  parseCompanyCsv,
  type CsvParseOutcome,
} from "@/lib/csv-import";
import { fmtNumber } from "@/lib/format";
import { BULK_BATCH_SIZE } from "@/lib/sync/bulk";

const MAX_FILE_BYTES = 250 * 1024 * 1024; // tolkningen sker i webbläsaren
const MAX_VISIBLE_ERRORS = 8;
const LARGE_IMPORT_WARNING = 50_000;

type Phase = "idle" | "parsing" | "ready" | "importing" | "done";

interface Progress {
  sent: number;
  total: number;
  created: number;
  updated: number;
  leads: number;
}

/**
 * CSV-import byggd för stora filer (100+ MB): filen läses och tolkas helt
 * i webbläsaren, kan filtreras på SNI-koderna från Inställningar redan vid
 * tolkningen, och laddas sedan upp i omgångar om 500 bolag till
 * /api/import/batch – samma pipeline som API-synken med omsättningsfilter,
 * dedupe på orgnr och audit-loggning.
 */
export function CsvImportCard({ sniCodes }: { sniCodes: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const rawTextRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<CsvParseOutcome | null>(null);
  const [sniOnly, setSniOnly] = useState(true);
  const [allaLeads, setAllaLeads] = useState(false);
  const [progress, setProgress] = useState<Progress>({ sent: 0, total: 0, created: 0, updated: 0, leads: 0 });
  const [fatalError, setFatalError] = useState<string | null>(null);

  function reset() {
    rawTextRef.current = null;
    setParsed(null);
    setPhase("idle");
    setFatalError(null);
    setProgress({ sent: 0, total: 0, created: 0, updated: 0, leads: 0 });
    if (fileRef.current) fileRef.current.value = "";
    setFileName(null);
  }

  function parseWith(text: string, useSniFilter: boolean) {
    return parseCompanyCsv(text, {
      sniFilter: useSniFilter && sniCodes.length > 0 ? sniCodes : undefined,
    });
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setParsed(null);
    setFatalError(null);
    if (!file) {
      setFileName(null);
      setPhase("idle");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileName(null);
      setFatalError("Filen är större än 250 MB. Dela upp den eller filtrera bort kolumner du inte behöver.");
      return;
    }
    setFileName(file.name);
    setPhase("parsing");
    // Låt UI:t rita "Analyserar …" innan den tunga tolkningen börjar.
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const text = decodeCsvBuffer(await file.arrayBuffer());
      rawTextRef.current = text;
      setParsed(parseWith(text, sniOnly));
      setPhase("ready");
    } catch (err) {
      setFatalError(err instanceof Error ? err.message : "Kunde inte läsa filen.");
      setPhase("idle");
    }
  }

  async function onToggleSni(checked: boolean) {
    setSniOnly(checked);
    if (rawTextRef.current && phase === "ready") {
      setPhase("parsing");
      await new Promise((resolve) => setTimeout(resolve, 30));
      setParsed(parseWith(rawTextRef.current, checked));
      setPhase("ready");
    }
  }

  async function postJson(body: unknown): Promise<Record<string, unknown>> {
    const res = await fetch("/api/import/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : `HTTP ${res.status}`);
    }
    return data;
  }

  async function runImport() {
    if (!parsed || parsed.rows.length === 0 || phase === "importing") return;
    const leadMode: "qualified" | "always" =
      allaLeads || !parsed.hasRevenueData ? "always" : "qualified";
    const rows = parsed.rows;

    setPhase("importing");
    setFatalError(null);
    setProgress({ sent: 0, total: rows.length, created: 0, updated: 0, leads: 0 });

    let runId: string;
    try {
      const started = await postJson({ action: "start", fileName: fileName ?? "import.csv" });
      runId = String(started.runId);
    } catch (err) {
      setFatalError(`Kunde inte starta importen: ${err instanceof Error ? err.message : err}`);
      setPhase("ready");
      return;
    }

    const totals = { fetched: 0, created: 0, updated: 0, leadsCreated: 0 };
    for (let offset = 0; offset < rows.length; offset += BULK_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + BULK_BATCH_SIZE);
      let attempt = 0;
      for (;;) {
        try {
          const result = await postJson({ action: "batch", runId, leadMode, rows: batch });
          totals.fetched += batch.length;
          totals.created += Number(result.created ?? 0);
          totals.updated += Number(result.updated ?? 0);
          totals.leadsCreated += Number(result.leadsCreated ?? 0);
          setProgress({
            sent: Math.min(offset + batch.length, rows.length),
            total: rows.length,
            created: totals.created,
            updated: totals.updated,
            leads: totals.leadsCreated,
          });
          break;
        } catch (err) {
          attempt++;
          if (attempt > 2) {
            const message = err instanceof Error ? err.message : String(err);
            await postJson({ action: "abort", runId, message }).catch(() => {});
            setFatalError(
              `Importen avbröts vid bolag ${fmtNumber(offset)} av ${fmtNumber(rows.length)}: ${message}. Redan importerade bolag ligger kvar – det är säkert att köra om samma fil.`,
            );
            setPhase("ready");
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
        }
      }
    }

    try {
      await postJson({
        action: "finish",
        runId,
        fileName: fileName ?? "import.csv",
        leadMode,
        totals,
        radfel: parsed.errors
          .slice(0, 50)
          .map((e) => (e.row > 0 ? `Rad ${e.row}: ${e.message}` : e.message)),
      });
    } catch {
      // Körningen är redan genomförd – stale-vakten städar loggposten.
    }

    setPhase("done");
    toast(
      `Import slutförd – ${fmtNumber(totals.created)} nya bolag, ${fmtNumber(totals.updated)} uppdaterade, ${fmtNumber(totals.leadsCreated)} leads`,
      "ok",
    );
    router.refresh();
  }

  const importCount = parsed?.rows.length ?? 0;
  const percent = progress.total === 0 ? 0 : Math.round((progress.sent / progress.total) * 100);

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <h2>Importera CSV</h2>
        <span className="small faint">Stora filer OK – tolkas i webbläsaren, laddas upp i omgångar</span>
      </div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="field">
          <label htmlFor="csv-fil">CSV-fil med bolag</label>
          <input
            ref={fileRef}
            className="input"
            type="file"
            id="csv-fil"
            accept=".csv,text/csv"
            onChange={onFileChange}
            disabled={phase === "parsing" || phase === "importing"}
          />
          <span className="hint">
            Kolumner som känns igen: Orgnr, Bolagsnamn, Ort, Adress, Anställda, Hemsida,
            Telefon, SNI samt omsättning/resultat per år – t.ex. &quot;Omsättning 2023&quot;
            eller &quot;Omsättning 2023 (tkr)&quot;. Belopp i tkr räknas om till kr.
          </span>
        </div>

        {phase === "parsing" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="small muted">Analyserar filen – stora filer kan ta en stund …</span>
            <span className="skeleton" style={{ width: "60%" }} />
            <span className="skeleton" style={{ width: "40%" }} />
          </div>
        )}

        {parsed && phase !== "parsing" && (
          <div className="banner info">
            <span>
              <strong>{fmtNumber(importCount)} bolag redo att importeras</strong>
              {parsed.rowsFilteredBySni > 0 &&
                ` · ${fmtNumber(parsed.rowsFilteredBySni)} rader utanför SNI-filtret hoppas över`}
              {parsed.errors.length > 0 && ` · ${fmtNumber(parsed.errors.length)} radfel`}
              <br />
              <span className="small">
                {parsed.hasRevenueData
                  ? `Omsättningsdata hittad (år ${parsed.yearsFound.join(", ")}) – tröskelfiltret avgör vilka som blir leads.`
                  : "Ingen omsättningsdata i filen – alla giltiga rader blir leads."}
                {importCount > LARGE_IMPORT_WARNING &&
                  " OBS: stor import – överväg SNI-filtret för att slippa irrelevanta bolag."}
              </span>
            </span>
          </div>
        )}

        <label
          style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, cursor: "pointer" }}
        >
          <span className="switch">
            <input
              type="checkbox"
              checked={sniOnly}
              onChange={(e) => onToggleSni(e.target.checked)}
              disabled={phase === "parsing" || phase === "importing"}
            />
            <span className="track" />
          </span>
          Importera endast rader med SNI {sniCodes.join(", ")}
          {parsed && !parsed.sniColumnFound && (
            <span className="faint small">(filen saknar SNI-kolumn – alla rader tas med)</span>
          )}
        </label>

        <label
          style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, cursor: "pointer" }}
        >
          <span className="switch">
            <input
              type="checkbox"
              checked={allaLeads}
              onChange={(e) => setAllaLeads(e.target.checked)}
              disabled={phase === "parsing" || phase === "importing"}
            />
            <span className="track" />
          </span>
          Skapa leads för alla rader (hoppa över omsättningsfiltret)
        </label>

        {phase === "importing" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${percent}%` }} />
            </div>
            <span className="small muted mono">
              {fmtNumber(progress.sent)} / {fmtNumber(progress.total)} bolag · {percent} % ·{" "}
              {fmtNumber(progress.created)} nya · {fmtNumber(progress.updated)} uppdaterade ·{" "}
              {fmtNumber(progress.leads)} leads
            </span>
            <span className="small faint">Lämna fliken öppen tills importen är klar.</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            className={`btn btn-primary${phase === "importing" ? " loading" : ""}`}
            onClick={runImport}
            disabled={phase !== "ready" || importCount === 0}
          >
            <IconUpload />
            {importCount > 0 ? `Importera ${fmtNumber(importCount)} bolag` : "Importera CSV"}
          </button>
          {(phase === "ready" || phase === "done") && fileName && (
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Välj annan fil
            </button>
          )}
        </div>

        {fatalError && (
          <div className="banner error">
            <IconError />
            <span>
              <strong>Importfel:</strong> {fatalError}
            </span>
          </div>
        )}

        {parsed && parsed.errors.length > 0 && (
          <div className="banner error">
            <IconError />
            <span>
              <strong>{fmtNumber(parsed.errors.length)} rader hoppas över:</strong>
              <br />
              {parsed.errors.slice(0, MAX_VISIBLE_ERRORS).map((err, i) => (
                <span key={i}>
                  {err.row > 0 ? `Rad ${err.row}: ` : ""}
                  {err.message}
                  <br />
                </span>
              ))}
              {parsed.errors.length > MAX_VISIBLE_ERRORS &&
                `… och ${fmtNumber(parsed.errors.length - MAX_VISIBLE_ERRORS)} till.`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
