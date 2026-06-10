"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";

export function DsDemos() {
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [skeletonVisible, setSkeletonVisible] = useState(false);

  return (
    <>
      <div className="ds-section">
        <h2>Toast, dialog &amp; laddning</h2>
        <div className="ds-row">
          <button type="button" className="btn" onClick={() => toast("Ändringen sparades", "ok")}>
            Visa toast: lyckat
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => toast("Kunde inte nå API:t – försök igen", "err")}
          >
            Visa toast: fel
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => toast("Export pågår i bakgrunden", "info")}
          >
            Visa toast: info
          </button>
          <button type="button" className="btn" onClick={() => setConfirmOpen(true)}>
            Visa bekräftelsedialog
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setSkeletonVisible((v) => !v)}
          >
            Växla laddningstillstånd
          </button>
        </div>
        {skeletonVisible && (
          <div className="card" style={{ marginTop: 14 }}>
            <div
              className="card-body"
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <span className="skeleton" style={{ width: "40%" }} />
              <span className="skeleton" style={{ width: "90%" }} />
              <span className="skeleton" style={{ width: "75%" }} />
              <span className="skeleton" style={{ width: "85%" }} />
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Ta bort anteckning?"
        body="Anteckningen tas bort permanent. Detta loggas i aktivitetsloggen."
        actionLabel="Ta bort"
        destructive
        onConfirm={() => {
          setConfirmOpen(false);
          toast("Anteckning borttagen", "info");
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
