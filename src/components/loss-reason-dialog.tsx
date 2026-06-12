"use client";

import { useState } from "react";
import { Modal } from "./modal";

export const LOSS_REASONS = [
  "Pris",
  "Fel timing",
  "Valde konkurrent",
  "Ingen respons",
  "Inget behov",
  "Annat",
] as const;

/**
 * Frågar efter orsak när ett lead markeras som Förlorad – ger er
 * statistik över varför affärer tappas. Bekräfta utan orsak går också.
 */
export function LossReasonDialog({
  open,
  companyName,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  companyName: string;
  busy?: boolean;
  onConfirm: (orsak: string | undefined) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<string>("");
  const [detail, setDetail] = useState("");

  function confirm() {
    const parts = [reason, detail.trim()].filter(Boolean);
    onConfirm(parts.length > 0 ? parts.join(": ") : undefined);
    setReason("");
    setDetail("");
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      titleId="loss-title"
      title="Markera som Förlorad?"
      alert
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            Avbryt
          </button>
          <button
            type="button"
            className={`btn btn-danger${busy ? " loading btn-secondary-spinner" : ""}`}
            onClick={confirm}
            disabled={busy}
          >
            Markera som Förlorad
          </button>
        </>
      }
    >
      <p>
        <strong>{companyName}</strong> flyttas till Förlorad. Ange gärna varför – det
        bygger er statistik över tappade affärer.
      </p>
      <div className="field">
        <label htmlFor="loss-reason">Orsak</label>
        <select
          className="select"
          id="loss-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="">Ingen orsak angiven</option>
          {LOSS_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="loss-detail">Kommentar (valfri)</label>
        <input
          className="input"
          id="loss-detail"
          placeholder="T.ex. valde Randstad, ny upphandling 2027"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          maxLength={200}
        />
      </div>
    </Modal>
  );
}
