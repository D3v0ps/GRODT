"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { triggerSyncAction } from "@/actions/sync";
import { IconSync } from "@/components/icons";
import { useToast } from "@/components/toast";

export function SyncButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [statusText, setStatusText] = useState("");

  function run() {
    if (pending || disabled) return;
    setStatusText("Hämtar bolag från datakällan …");
    startTransition(async () => {
      const result = await triggerSyncAction();
      setStatusText("");
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) router.refresh();
    });
  }

  return (
    <>
      <span className="small faint" aria-live="polite">
        {statusText}
      </span>
      <button
        type="button"
        className={`btn btn-accent${pending ? " loading" : ""}`}
        onClick={run}
        disabled={pending || disabled}
        title={disabled ? "Ingen API-leverantör är konfigurerad (DATA_PROVIDER)" : undefined}
      >
        <IconSync />
        Hämta bolag nu
      </button>
    </>
  );
}
