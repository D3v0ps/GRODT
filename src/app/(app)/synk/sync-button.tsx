"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { triggerSyncAction } from "@/actions/sync";
import { IconSync } from "@/components/icons";
import { useToast } from "@/components/toast";
import { fmtNumber } from "@/lib/format";

/** Skyddsräcke: max så här många kedjade svep per knapptryck (~12 × 40 bolag). */
const MAX_SVEP = 12;

/**
 * "Hämta bolag nu" med kedjade svep: Vercels tidsgräns tillåter ~40
 * bolag per körning, så knappen kör automatiskt svep efter svep tills
 * berikningskön är tom (eller något går snett). Samma mönster som
 * CSV-importens batchning – lämna fliken öppen så sköter den resten.
 */
export function SyncButton({
  disabled,
  queueCount = 0,
}: {
  disabled: boolean;
  /** Antal bolag i berikningskön vid sidladdning (aldrig synkade). */
  queueCount?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const [statusText, setStatusText] = useState("");
  const stopRef = useRef(false);

  async function run() {
    if (running || disabled) return;
    setRunning(true);
    stopRef.current = false;

    let prevKvar = Number.POSITIVE_INFINITY;
    try {
      for (let svep = 1; svep <= MAX_SVEP; svep++) {
        setStatusText(
          svep === 1
            ? "Svep 1 pågår – hämtar bolagsdata och bokslut …"
            : `Svep ${svep} pågår – ${fmtNumber(prevKvar)} bolag kvar i kön …`,
        );
        const result = await triggerSyncAction();
        router.refresh();

        const kvar = result.kvar ?? 0;
        if (!result.ok && kvar >= prevKvar) {
          // Hård stopp: pågående körning, rate limit eller providerfel
          // utan framsteg – kedja inte vidare i blindo.
          toast(result.message, "err");
          break;
        }
        if (kvar === 0) {
          toast(
            svep === 1
              ? result.message
              : `Berikningskön är tom – ${svep} svep körda. ${result.message}`,
            result.ok ? "ok" : "err",
          );
          break;
        }
        if (kvar >= prevKvar) {
          // Inget framsteg trots ok-svar – stanna hellre än att loopa.
          toast(`${result.message} · ${fmtNumber(kvar)} bolag kvar i kön`, "err");
          break;
        }
        prevKvar = kvar;
        if (stopRef.current) {
          toast(`Stoppad – ${fmtNumber(kvar)} bolag kvar i kön`, "info");
          break;
        }
        if (svep === MAX_SVEP) {
          toast(
            `${MAX_SVEP} svep körda – ${fmtNumber(kvar)} bolag kvar. Klicka igen för att fortsätta.`,
            "info",
          );
          break;
        }
        // Kort andhämtning mellan svepen (håller även rate limit-marginal).
        await new Promise((resolve) => setTimeout(resolve, 4000));
      }
    } finally {
      setStatusText("");
      setRunning(false);
      router.refresh();
    }
  }

  return (
    <>
      <span className="small faint" aria-live="polite">
        {statusText}
      </span>
      {running && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            stopRef.current = true;
            setStatusText("Stoppar efter pågående svep …");
          }}
        >
          Stoppa
        </button>
      )}
      <button
        type="button"
        className={`btn btn-accent${running ? " loading" : ""}`}
        onClick={run}
        disabled={running || disabled}
        title={disabled ? "Ingen API-leverantör är konfigurerad (DATA_PROVIDER)" : undefined}
      >
        <IconSync />
        Hämta bolag nu
        {queueCount > 0 && !running && ` (${fmtNumber(queueCount)} i kö)`}
      </button>
    </>
  );
}
