"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { enrichCompanyContactAction } from "@/actions/google";
import { useToast } from "@/components/toast";

/** Hämtar telefon/hemsida från Google Places när fälten är tomma. */
export function GoogleEnrichButton({ orgnr }: { orgnr: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function run() {
    if (pending) return;
    startTransition(async () => {
      const result = await enrichCompanyContactAction({ orgnr });
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) router.refresh();
    });
  }

  return (
    <button
      type="button"
      className={`btn btn-sm${pending ? " loading btn-secondary-spinner" : ""}`}
      onClick={run}
      disabled={pending}
      title="Söker upp bolagets publika företagsprofil – numret är ofta en växel"
    >
      Hämta från Google
    </button>
  );
}
