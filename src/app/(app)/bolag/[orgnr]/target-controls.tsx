"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLeadTargetAction } from "@/actions/leads";
import { IconError, IconInfo } from "@/components/icons";
import { useToast } from "@/components/toast";
import { sniLabel } from "@/lib/constants";

/**
 * Målbildskontroller på bolagssidan. Visar ett tydligt tillstånd:
 *  - utflyttat (off-target): röd banner + "Återställ till pipelinen".
 *  - inom målbild men namnet antyder uthyrning: gul varning + möjlighet
 *    att flytta ut manuellt.
 * Båda valen sätter target_kept så att automatiken respekterar beslutet.
 */
export function TargetControls({
  leadId,
  offTarget,
  offTargetSni,
  likelyStaffing,
}: {
  leadId: string;
  offTarget: boolean;
  offTargetSni: string | null;
  likelyStaffing: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function setTarget(inTarget: boolean) {
    if (pending) return;
    startTransition(async () => {
      const result = await setLeadTargetAction({ leadId, inTarget });
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) router.refresh();
    });
  }

  if (offTarget) {
    return (
      <div className="banner error" style={{ marginBottom: 14 }}>
        <IconError />
        <span style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", width: "100%" }}>
          <span style={{ flex: "1 1 280px" }}>
            <strong>Utanför målbilden:</strong>{" "}
            {offTargetSni
              ? `Bolaget är ${sniLabel(offTargetSni)} enligt Bolagsverket`
              : "Bolagets bransch ligger utanför målbilden"}
            . Leadet är dolt ur listor, pipeline och statistik.
          </span>
          <button
            type="button"
            className={`btn btn-sm${pending ? " loading" : ""}`}
            onClick={() => setTarget(true)}
            disabled={pending}
          >
            Återställ till pipelinen
          </button>
        </span>
      </div>
    );
  }

  if (likelyStaffing) {
    return (
      <div className="banner info" style={{ marginBottom: 14 }}>
        <IconInfo />
        <span style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", width: "100%" }}>
          <span style={{ flex: "1 1 280px" }}>
            <strong>Trolig personaluthyrning:</strong> namnet/beskrivningen antyder
            bemanning snarare än ren arbetsförmedling. Kontrollera SNI – ligger bolaget
            utanför målbilden kan du flytta ut det.
          </span>
          <button
            type="button"
            className={`btn btn-sm${pending ? " loading" : ""}`}
            onClick={() => setTarget(false)}
            disabled={pending}
          >
            Flytta ut ur målbilden
          </button>
        </span>
      </div>
    );
  }

  return null;
}
