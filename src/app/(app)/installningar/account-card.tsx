"use client";

import { useState, useTransition } from "react";
import { changeOwnPasswordAction } from "@/actions/account";
import { useToast } from "@/components/toast";
import { rollLabel } from "@/lib/constants";

export function AccountCard({
  namn,
  email,
  roll,
}: {
  namn: string;
  email: string;
  roll: string;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    if (password.length < 10) {
      setError("Lösenordet måste vara minst 10 tecken.");
      return;
    }
    if (password !== confirm) {
      setError("Lösenorden matchar inte.");
      return;
    }
    startTransition(async () => {
      const result = await changeOwnPasswordAction({ password });
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) {
        setPassword("");
        setConfirm("");
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <h2>Mitt konto</h2>
        <span className="small faint">
          {email} · {rollLabel(roll)}
        </span>
      </div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p className="small muted">
          Inloggad som <strong>{namn}</strong>. Här byter du ditt eget lösenord –
          administratörer kan återställa andras under Admin.
        </p>
        <form
          onSubmit={onSubmit}
          style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}
        >
          <div className="field" style={{ width: 220 }}>
            <label htmlFor="pw-new">Nytt lösenord</label>
            <input
              className="input"
              id="pw-new"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              aria-invalid={error ? true : undefined}
            />
            <span className="hint">Minst 10 tecken.</span>
          </div>
          <div className="field" style={{ width: 220 }}>
            <label htmlFor="pw-confirm">Upprepa lösenordet</label>
            <input
              className="input"
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={pending}
              aria-invalid={error ? true : undefined}
            />
            <span className="hint">&nbsp;</span>
          </div>
          <div className="field">
            <button
              type="submit"
              className={`btn btn-primary${pending ? " loading" : ""}`}
              disabled={pending || !password}
            >
              Byt lösenord
            </button>
            <span className="hint">&nbsp;</span>
          </div>
        </form>
        {error && <span className="error-text">{error}</span>}
      </div>
    </div>
  );
}
