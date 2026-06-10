"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addCustomerNoteAction,
  addCustomerRevenueAction,
  assignControllerAction,
  updateCustomerStatusAction,
} from "@/actions/customers";
import { KundStatusBadge } from "@/components/kund-status-badge";
import { useToast } from "@/components/toast";
import { KUND_STATUSES, type KundStatus } from "@/lib/constants";
import { parseSekInput } from "@/lib/format";

interface UserOption {
  id: string;
  namn: string;
}

export function KundActions({
  customerId,
  status,
  controllerId,
  users,
}: {
  customerId: string;
  status: string;
  controllerId: string | null;
  users: UserOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [currentStatus, setCurrentStatus] = useState(status);
  const [currentController, setCurrentController] = useState(controllerId ?? "");

  function changeStatus(next: string) {
    const prev = currentStatus;
    setCurrentStatus(next);
    startTransition(async () => {
      const result = await updateCustomerStatusAction({
        customerId,
        status: next as KundStatus,
      });
      toast(result.message, result.ok ? "ok" : "err");
      if (!result.ok) setCurrentStatus(prev);
      else router.refresh();
    });
  }

  function changeController(next: string) {
    const prev = currentController;
    setCurrentController(next);
    startTransition(async () => {
      const result = await assignControllerAction({
        customerId,
        controllerId: next === "" ? null : next,
      });
      toast(result.message, result.ok ? "ok" : "err");
      if (!result.ok) setCurrentController(prev);
      else router.refresh();
    });
  }

  return (
    <div className="actions">
      <KundStatusBadge status={currentStatus} />
      <select
        className="select"
        aria-label="Byt kundstatus"
        value={currentStatus}
        disabled={pending}
        onChange={(e) => changeStatus(e.target.value)}
      >
        {KUND_STATUSES.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <select
        className="select"
        aria-label="Tilldela controller"
        value={currentController}
        disabled={pending}
        onChange={(e) => changeController(e.target.value)}
      >
        <option value="">Ingen controller</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.namn}
          </option>
        ))}
      </select>
    </div>
  );
}

export function RevenueForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [beskrivning, setBeskrivning] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    const parsed = parseSekInput(amount);
    if (parsed === null || parsed <= 0) {
      setError("Ange ett belopp i kr, t.ex. 150 000.");
      return;
    }
    startTransition(async () => {
      const result = await addCustomerRevenueAction({
        customerId,
        amountSek: parsed,
        beskrivning: beskrivning.trim() || undefined,
      });
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) {
        setAmount("");
        setBeskrivning("");
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}
    >
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="input mono"
          placeholder="Belopp i kr, t.ex. 150 000"
          aria-label="Belopp i kronor"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={pending}
          style={{ width: 180 }}
          aria-invalid={error ? true : undefined}
        />
        <input
          className="input"
          placeholder="Beskrivning (valfri), t.ex. Rekrytering Q3"
          aria-label="Beskrivning"
          value={beskrivning}
          onChange={(e) => setBeskrivning(e.target.value)}
          disabled={pending}
          style={{ flex: 1 }}
        />
        <button
          className={`btn btn-primary${pending ? " loading" : ""}`}
          type="submit"
          disabled={pending}
        >
          Registrera
        </button>
      </div>
      {error && <span className="error-text">{error}</span>}
    </form>
  );
}

export function KundNoteForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || pending) return;
    startTransition(async () => {
      const result = await addCustomerNoteAction({ customerId, body: trimmed });
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
        placeholder="Skriv en kommentar …"
        aria-label="Ny kommentar"
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
