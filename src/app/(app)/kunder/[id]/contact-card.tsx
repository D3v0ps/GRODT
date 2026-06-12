"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateCustomerContactAction } from "@/actions/customers";
import { useToast } from "@/components/toast";

/**
 * Teamets kontaktväg till kunden: kontaktperson, numret man faktiskt
 * når dem på och e-post. Redigeras direkt i kortet, allt loggas.
 */
export function ContactCard({
  customerId,
  kontaktperson: initialKontaktperson,
  telefon: initialTelefon,
  epost: initialEpost,
}: {
  customerId: string;
  kontaktperson: string | null;
  telefon: string | null;
  epost: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [kontaktperson, setKontaktperson] = useState(initialKontaktperson ?? "");
  const [telefon, setTelefon] = useState(initialTelefon ?? "");
  const [epost, setEpost] = useState(initialEpost ?? "");

  const hasAny = initialKontaktperson || initialTelefon || initialEpost;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    startTransition(async () => {
      const result = await updateCustomerContactAction({
        customerId,
        kontaktperson: kontaktperson.trim() || undefined,
        telefon: telefon.trim() || undefined,
        epost: epost.trim() || undefined,
      });
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Kontakt</h2>
        {!editing && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setEditing(true)}
          >
            {hasAny ? "Redigera" : "Lägg till"}
          </button>
        )}
      </div>
      <div className="card-body">
        {editing ? (
          <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="field">
              <label htmlFor="kc-person">Kontaktperson</label>
              <input
                className="input"
                id="kc-person"
                placeholder="T.ex. Maria Ek, HR-chef"
                value={kontaktperson}
                onChange={(e) => setKontaktperson(e.target.value)}
                maxLength={120}
              />
            </div>
            <div className="field">
              <label htmlFor="kc-tel">Telefon</label>
              <input
                className="input mono"
                id="kc-tel"
                placeholder="070-123 45 67"
                value={telefon}
                onChange={(e) => setTelefon(e.target.value)}
                maxLength={40}
              />
              <span className="hint">Numret ni faktiskt når kunden på.</span>
            </div>
            <div className="field">
              <label htmlFor="kc-epost">E-post</label>
              <input
                className="input mono"
                id="kc-epost"
                type="email"
                placeholder="maria@bolaget.se"
                value={epost}
                onChange={(e) => setEpost(e.target.value)}
                maxLength={120}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="submit"
                className={`btn btn-primary btn-sm${pending ? " loading" : ""}`}
                disabled={pending}
              >
                Spara
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setEditing(false);
                  setKontaktperson(initialKontaktperson ?? "");
                  setTelefon(initialTelefon ?? "");
                  setEpost(initialEpost ?? "");
                }}
                disabled={pending}
              >
                Avbryt
              </button>
            </div>
          </form>
        ) : hasAny ? (
          <div className="facts" style={{ gridTemplateColumns: "1fr" }}>
            <div className="fact">
              <div className="k">Kontaktperson</div>
              <div className="v">{initialKontaktperson ?? "–"}</div>
            </div>
            <div className="fact">
              <div className="k">Telefon</div>
              <div className="v mono">
                {initialTelefon ? <a href={`tel:${initialTelefon}`}>{initialTelefon}</a> : "–"}
              </div>
            </div>
            <div className="fact">
              <div className="k">E-post</div>
              <div className="v mono">
                {initialEpost ? <a href={`mailto:${initialEpost}`}>{initialEpost}</a> : "–"}
              </div>
            </div>
          </div>
        ) : (
          <p className="small faint">
            Inga kontaktuppgifter ännu – spara numret och personen ni når kunden via.
          </p>
        )}
      </div>
    </div>
  );
}
