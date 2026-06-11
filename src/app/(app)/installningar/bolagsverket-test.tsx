"use client";

import { useState, useTransition } from "react";
import { testBolagsverketAction } from "@/actions/bolagsverket";
import { IconError } from "@/components/icons";
import { useToast } from "@/components/toast";

/** Admin-knapp i Datakälla-kortet: verifierar Bolagsverket-anslutningen live. */
export function BolagsverketTest() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; lines: string[] } | null>(null);

  function run() {
    if (pending) return;
    startTransition(async () => {
      const outcome = await testBolagsverketAction();
      setResult(outcome);
      toast(
        outcome.ok ? "Bolagsverket svarar – anslutningen fungerar" : "Självtestet misslyckades",
        outcome.ok ? "ok" : "err",
      );
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <button
          type="button"
          className={`btn btn-sm${pending ? " loading btn-secondary-spinner" : ""}`}
          onClick={run}
          disabled={pending}
        >
          Testa Bolagsverket-anslutningen
        </button>
      </div>
      {result &&
        (result.ok ? (
          <div className="banner info">
            <span>
              {result.lines.map((line, i) => (
                <span key={i}>
                  {line}
                  <br />
                </span>
              ))}
            </span>
          </div>
        ) : (
          <div className="banner error">
            <IconError />
            <span>
              {result.lines.map((line, i) => (
                <span key={i}>
                  {line}
                  <br />
                </span>
              ))}
            </span>
          </div>
        ))}
    </div>
  );
}
