"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Modal enligt designsystemet: backdrop, max 440px, stängs med Esc,
 * klick på backdrop eller Avbryt. Fokus flyttas in vid öppning.
 */
export function Modal({
  open,
  onClose,
  titleId,
  title,
  children,
  footer,
  alert = false,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  title: string;
  children: ReactNode;
  footer: ReactNode;
  alert?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Fokusfälla: Tab cirkulerar inom modalen i stället för att hamna
      // i sidan bakom.
      if (e.key === "Tab") {
        const root = ref.current;
        if (!root) return;
        const focusables = [
          ...root.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ];
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        const inside = active instanceof HTMLElement && root.contains(active);
        if (e.shiftKey && (active === first || !inside)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !inside)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Fokus flyttas in EN gång när modalen öppnas – beroendet får inte
  // inkludera onClose (återskapas per render), annars rycks fokus
  // tillbaka till första fältet vid varje tangenttryckning. Vid stängning
  // återlämnas fokus till elementet som öppnade modalen.
  useEffect(() => {
    if (!open) return;
    restoreRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = ref.current?.querySelector<HTMLElement>(
      "input, select, textarea, button.btn-primary, button.btn-accent, button",
    );
    focusable?.focus();
    return () => {
      restoreRef.current?.focus?.();
      restoreRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop open"
      role={alert ? "alertdialog" : "dialog"}
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" ref={ref}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

/** Bekräftelsedialog: rubrik som fråga, konsekvensbeskrivning, Avbryt + handling. */
export function ConfirmDialog({
  open,
  title,
  body,
  actionLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  actionLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      titleId="confirm-title"
      title={title}
      alert
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            Avbryt
          </button>
          <button
            type="button"
            className={`btn ${destructive ? "btn-danger" : "btn-accent"}${busy ? " loading" : ""}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {actionLabel}
          </button>
        </>
      }
    >
      <p>{body}</p>
    </Modal>
  );
}
