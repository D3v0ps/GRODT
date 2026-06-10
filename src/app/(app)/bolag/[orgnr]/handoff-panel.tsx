"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { handoffCustomerAction } from "@/actions/customers";
import { IconInfo } from "@/components/icons";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";

interface UserOption {
  id: string;
  namn: string;
}

/**
 * Visas på bolagskortet när leadet står som Kund: antingen en länk till
 * kundkortet, eller knappen som lämnar över bolaget till en controller.
 */
export function HandoffPanel({
  orgnr,
  customerId,
  controllers,
}: {
  orgnr: string;
  customerId: string | null;
  controllers: UserOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [controllerId, setControllerId] = useState("");
  const [kommentar, setKommentar] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  if (customerId) {
    return (
      <div className="banner info" style={{ marginBottom: 14 }}>
        <IconInfo />
        <span>
          Bolaget är överlämnat och finns som kund.{" "}
          <Link href={`/kunder/${customerId}`}>Öppna kundkortet</Link> för intäkter,
          kommentarer och kundstatus.
        </span>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await handoffCustomerAction({
        orgnr,
        controllerId: controllerId || null,
        kommentar: kommentar.trim() || undefined,
      });
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      toast(result.message, "ok");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="banner info" style={{ marginBottom: 14, alignItems: "center" }}>
        <IconInfo />
        <span style={{ flex: 1 }}>
          Affären är vunnen men bolaget är inte överlämnat ännu. Lämna över till en
          controller så hamnar det under Kunder med intäktsspårning.
        </span>
        <button
          type="button"
          className="btn btn-accent btn-sm"
          onClick={() => setOpen(true)}
          style={{ flex: "none" }}
        >
          Lämna över till controller
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        titleId="ho-title"
        title="Lämna över till controller"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Avbryt
            </button>
            <button
              type="submit"
              form="handoff-form"
              className={`btn btn-accent${pending ? " loading" : ""}`}
              disabled={pending}
            >
              Lämna över
            </button>
          </>
        }
      >
        <form
          id="handoff-form"
          onSubmit={submit}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <p>
            Bolaget blir kund och flyttas till Kunder-vyn. Du står som säljaren som
            vann affären.
          </p>
          <div className="field">
            <label htmlFor="ho-controller">Controller</label>
            <select
              className="select"
              id="ho-controller"
              value={controllerId}
              onChange={(e) => setControllerId(e.target.value)}
            >
              <option value="">Välj senare</option>
              {controllers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.namn}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ho-kommentar">Kommentar till controllern (valfri)</label>
            <input
              className="input"
              id="ho-kommentar"
              placeholder="T.ex. avtal klart, start v. 34 …"
              value={kommentar}
              onChange={(e) => setKommentar(e.target.value)}
            />
          </div>
          {formError && (
            <div className="field">
              <span className="error-text">{formError}</span>
            </div>
          )}
        </form>
      </Modal>
    </>
  );
}
