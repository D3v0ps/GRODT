"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { importAfLeverantorerAction, type AfImportResult } from "@/actions/af";
import { useToast } from "@/components/toast";
import { fmtNumber } from "@/lib/format";

/**
 * Import av Arbetsförmedlingens leverantörsregister (Rusta och matcha).
 * Varje leverantör är målgruppen per definition: blir lead direkt,
 * klassas som omställning (låga) och kontaktpersonen sparas källmärkt.
 */
export function AfImportCard() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AfImportResult | null>(null);

  function run() {
    if (pending) return;
    startTransition(async () => {
      const outcome = await importAfLeverantorerAction();
      setResult(outcome);
      toast(outcome.message, outcome.ok ? "ok" : "err");
      if (outcome.ok) router.refresh();
    });
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <h2>Leverantörer från Arbetsförmedlingen</h2>
        <span className="small faint">Rusta och matcha (A015) · publikt register</span>
      </div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="small muted">
          Hämtar alla godkända leverantörer inom Rusta och matcha direkt från
          Arbetsförmedlingens register – bolagsnamn, orgnr, kontaktperson med telefon
          och e-post samt hemsida. Leverantörerna är målgruppen per definition: de blir
          leads direkt (oavsett omsättningsfilter), klassas som{" "}
          <strong>omställning</strong> med låga och skyddas från utflyttning.
          Kontaktpersonen läggs på bolagskortet, källmärkt
          &quot;via arbetsformedlingen&quot;. Körningen är idempotent – kör igen när
          registret ändrats, befintliga uppgifter skrivs aldrig över.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn btn-primary${pending ? " loading" : ""}`}
            onClick={run}
            disabled={pending}
          >
            Hämta leverantörer
          </button>
          {pending && (
            <span className="small faint">
              Hämtar registret – tar ett par minuter, lämna fliken öppen …
            </span>
          )}
        </div>
        {result && result.ok && (
          <p className="small muted mono">
            Senaste körningen: {fmtNumber(result.leverantorer ?? 0)} leverantörer ·{" "}
            {fmtNumber(result.nya ?? 0)} nya bolag · {fmtNumber(result.leads ?? 0)} nya
            leads · {fmtNumber(result.kontakter ?? 0)} kontaktpersoner
          </p>
        )}
      </div>
    </div>
  );
}
