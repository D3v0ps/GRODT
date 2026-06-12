"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { enrichMissingContactsAction, type GoogleSweepResult } from "@/actions/google";
import { useToast } from "@/components/toast";
import { fmtNumber } from "@/lib/format";

/**
 * Admin-svep: hämtar telefon/hemsida från Google Places för bolag som
 * saknar uppgifterna (max 100 per körning). Allt som hämtas källmärks
 * "via Google – kan vara växelnummer" och osäkra träffar hoppas över.
 */
export function GoogleSweepCard({
  saknarTelefon,
  configured,
}: {
  saknarTelefon: number;
  configured: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GoogleSweepResult | null>(null);

  function run() {
    if (pending) return;
    startTransition(async () => {
      const outcome = await enrichMissingContactsAction({ limit: 100 });
      setResult(outcome);
      toast(outcome.message, outcome.ok ? "ok" : "err");
      if (outcome.ok) router.refresh();
    });
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <h2>Kontaktuppgifter via Google</h2>
        <span className="small faint">
          {fmtNumber(saknarTelefon)} bolag saknar telefonnummer
        </span>
      </div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="small muted">
          Hämtar telefon och hemsida från bolagens publika Google-profiler för bolag som
          saknar uppgifterna. Numren är ofta <strong>växelnummer</strong> och märks därför
          alltid &quot;via Google&quot; – de skriver aldrig över befintlig data, och bolag
          utan säker namnträff hoppas över.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn btn-primary${pending ? " loading" : ""}`}
            onClick={run}
            disabled={pending || !configured || saknarTelefon === 0}
            title={!configured ? "GOOGLE_PLACES_API_KEY är inte konfigurerad" : undefined}
          >
            Hämta för 100 bolag
          </button>
          {!configured && (
            <span className="small faint">
              Kräver GOOGLE_PLACES_API_KEY i Vercel (eller valvet).
            </span>
          )}
          {pending && (
            <span className="small faint">Söker – tar ungefär en halv minut …</span>
          )}
        </div>
        {result && result.granskade !== undefined && (
          <p className="small muted mono">
            Senaste svepet: {fmtNumber(result.telefon ?? 0)} telefonnummer ·{" "}
            {fmtNumber(result.hemsidor ?? 0)} hemsidor · {fmtNumber(result.utanTraff ?? 0)} utan
            säker träff
          </p>
        )}
      </div>
    </div>
  );
}
