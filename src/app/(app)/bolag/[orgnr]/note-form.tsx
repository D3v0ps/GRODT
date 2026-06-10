"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addNoteAction } from "@/actions/leads";
import { useToast } from "@/components/toast";

export function NoteForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || pending) return;
    startTransition(async () => {
      const result = await addNoteAction({ leadId, body: trimmed });
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) {
        setBody("");
        router.refresh();
      }
    });
  }

  return (
    <form className="note-form" onSubmit={onSubmit}>
      <input
        className="input"
        placeholder="Skriv en anteckning …"
        aria-label="Ny anteckning"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={pending}
      />
      <button
        className={`btn btn-primary${pending ? " loading" : ""}`}
        type="submit"
        disabled={pending}
      >
        Spara
      </button>
    </form>
  );
}
