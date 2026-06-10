"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { importCsvAction, type CsvImportActionResult } from "@/actions/sync";
import { IconError, IconUpload } from "@/components/icons";
import { useToast } from "@/components/toast";

const MAX_VISIBLE_ERRORS = 8;

/**
 * CSV-import: ladda upp en fil med bolag (och ev. omsättning per år) så
 * importeras den genom samma pipeline som API-synken – inklusive
 * omsättningsfiltret, dedupe på orgnr och audit-loggning.
 */
export function CsvImportCard() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const [allaLeads, setAllaLeads] = useState(false);
  const [result, setResult] = useState<CsvImportActionResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fileInput = fileRef.current;
    if (!fileInput?.files?.length) {
      toast("Välj en CSV-fil att importera.", "err");
      return;
    }
    const formData = new FormData();
    formData.set("file", fileInput.files[0]);
    formData.set("leadMode", allaLeads ? "always" : "auto");

    startTransition(async () => {
      const outcome = await importCsvAction(formData);
      setResult(outcome);
      toast(outcome.message, outcome.ok ? "ok" : "err");
      if (outcome.ok || (outcome.fetched ?? 0) > 0) {
        router.refresh();
      }
    });
  }

  const rowErrors = result?.rowErrors ?? [];

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <h2>Importera CSV</h2>
        <span className="small faint">Max 5 MB · ; eller , som avgränsare</span>
      </div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <form
          onSubmit={onSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div className="field">
            <label htmlFor="csv-fil">CSV-fil med bolag</label>
            <input
              ref={fileRef}
              className="input"
              type="file"
              id="csv-fil"
              accept=".csv,text/csv"
              onChange={(e) => {
                setFileName(e.target.files?.[0]?.name ?? null);
                setResult(null);
              }}
              disabled={pending}
            />
            <span className="hint">
              Kolumner som känns igen: Orgnr, Bolagsnamn, Ort, Adress, Anställda, Hemsida,
              Telefon samt omsättning/resultat per år – t.ex. &quot;Omsättning 2023&quot; eller
              &quot;Omsättning 2023 (tkr)&quot;. Belopp i tkr räknas om till kr.
            </span>
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <span className="switch">
              <input
                type="checkbox"
                checked={allaLeads}
                onChange={(e) => setAllaLeads(e.target.checked)}
                disabled={pending}
              />
              <span className="track" />
            </span>
            Skapa leads för alla rader (hoppa över omsättningsfiltret)
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="submit"
              className={`btn btn-primary${pending ? " loading" : ""}`}
              disabled={pending || !fileName}
            >
              <IconUpload />
              Importera CSV
            </button>
            <span className="small faint">
              {pending
                ? "Importerar …"
                : allaLeads
                  ? "Alla giltiga rader blir leads."
                  : "Omsättningsfiltret avgör vilka rader som blir leads. Saknar filen siffror blir alla rader leads."}
            </span>
          </div>
        </form>

        {rowErrors.length > 0 && (
          <div className="banner error">
            <IconError />
            <span>
              <strong>{rowErrors.length} rader kunde inte importeras:</strong>
              <br />
              {rowErrors.slice(0, MAX_VISIBLE_ERRORS).map((err, i) => (
                <span key={i}>
                  {err.row > 0 ? `Rad ${err.row}: ` : ""}
                  {err.message}
                  <br />
                </span>
              ))}
              {rowErrors.length > MAX_VISIBLE_ERRORS &&
                `… och ${rowErrors.length - MAX_VISIBLE_ERRORS} till.`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
