"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveNotifyWebhookAction } from "@/actions/settings";
import { useToast } from "@/components/toast";

/**
 * Chattnotiser till teamets kanal: vunna affärer, överlämningar,
 * utdelningar och nya ringlistor postas till en inkommande webhook
 * (Slack, Teams eller Discord). Endast admin kan ändra (RLS).
 */
export function WebhookForm({
  initialUrl,
  initialEnabled,
}: {
  initialUrl: string;
  initialEnabled: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(initialUrl);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await saveNotifyWebhookAction({ url: url.trim(), enabled });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast(result.message, "ok");
      router.refresh();
    });
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <h2>Chattnotiser</h2>
        {initialEnabled ? (
          <span className="pill ok">
            <span className="dot" />
            Aktiva
          </span>
        ) : (
          <span className="pill">
            <span className="dot" style={{ background: "var(--ink-3)" }} />
            Avstängda
          </span>
        )}
      </div>
      <div className="card-body">
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="field">
            <label htmlFor="wh-url">Webhook-URL (Slack, Teams eller Discord)</label>
            <input
              className="input mono"
              id="wh-url"
              type="url"
              placeholder="https://hooks.slack.com/services/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={pending}
            />
            <span className="hint">
              Skapa en inkommande webhook i ert chattverktyg och klistra in adressen.
              Vunna affärer, överlämningar, utdelningar och nya ringlistor postas dit.
            </span>
          </div>
          <label className="switch" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={pending}
            />
            <span className="track" aria-hidden="true" />
            <span style={{ fontSize: 13 }}>Skicka notiser till kanalen</span>
          </label>
          {error && <span className="error-text">{error}</span>}
          <div>
            <button
              type="submit"
              className={`btn btn-primary${pending ? " loading" : ""}`}
              disabled={pending}
            >
              Spara
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
