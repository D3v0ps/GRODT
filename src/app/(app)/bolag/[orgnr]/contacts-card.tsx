"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addContactAction,
  deleteContactAction,
  updateContactAction,
} from "@/actions/contacts";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";

export interface ContactRow {
  id: string;
  namn: string;
  titel: string | null;
  telefon: string | null;
  epost: string | null;
  anteckning: string | null;
  kalla: string | null;
}

interface FormState {
  namn: string;
  titel: string;
  telefon: string;
  epost: string;
  anteckning: string;
}

const EMPTY_FORM: FormState = { namn: "", titel: "", telefon: "", epost: "", anteckning: "" };

export function ContactsCard({
  orgnr,
  contacts,
}: {
  orgnr: string;
  contacts: ContactRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  // null = stängt, "ny" = lägg till, annars id på kontakten som redigeras.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ContactRow | null>(null);

  function openForm(contact?: ContactRow) {
    setFormError(null);
    if (contact) {
      setEditing(contact.id);
      setForm({
        namn: contact.namn,
        titel: contact.titel ?? "",
        telefon: contact.telefon ?? "",
        epost: contact.epost ?? "",
        anteckning: contact.anteckning ?? "",
      });
    } else {
      setEditing("ny");
      setForm(EMPTY_FORM);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || editing === null) return;
    setFormError(null);
    const fields = {
      namn: form.namn.trim(),
      titel: form.titel.trim() || undefined,
      telefon: form.telefon.trim() || undefined,
      epost: form.epost.trim() || undefined,
      anteckning: form.anteckning.trim() || undefined,
    };
    startTransition(async () => {
      const result =
        editing === "ny"
          ? await addContactAction({ orgnr, ...fields })
          : await updateContactAction({ contactId: editing, ...fields });
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      toast(result.message, "ok");
      setEditing(null);
      router.refresh();
    });
  }

  function runDelete() {
    if (!toDelete || pending) return;
    startTransition(async () => {
      const result = await deleteContactAction({ contactId: toDelete.id });
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) {
        setToDelete(null);
        router.refresh();
      }
    });
  }

  const field = (key: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="card">
      <div className="card-head">
        <h2>Kontaktpersoner</h2>
        {editing === null && (
          <button type="button" className="btn btn-sm" onClick={() => openForm()}>
            Lägg till
          </button>
        )}
      </div>
      <div className="card-body">
        {contacts.length === 0 && editing === null ? (
          <EmptyState
            title="Inga kontaktpersoner ännu"
            description="Lägg till vem ni pratar med – namn, titel och direktnummer syns även i ringlistorna."
          />
        ) : (
          <div className="kontakt-lista">
            {contacts.map((contact) =>
              editing === contact.id ? null : (
                <div className="kontakt" key={contact.id}>
                  <div className="k-rad">
                    <strong>{contact.namn}</strong>
                    {contact.titel && <span className="faint"> · {contact.titel}</span>}
                    {contact.kalla && (
                      <span className="badge st-kontaktad" style={{ marginLeft: 8 }}>
                        <span className="dot" />
                        via {contact.kalla}
                      </span>
                    )}
                    <span className="spacer" />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => openForm(contact)}
                      disabled={pending}
                    >
                      Ändra
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label={`Ta bort ${contact.namn}`}
                      onClick={() => setToDelete(contact)}
                      disabled={pending}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="k-detalj mono">
                    {contact.telefon ? (
                      <a href={`tel:${contact.telefon.replace(/[^\d+]/g, "")}`}>
                        {contact.telefon}
                      </a>
                    ) : (
                      <span className="faint">Telefon saknas</span>
                    )}
                    {contact.epost && (
                      <>
                        {" · "}
                        <a href={`mailto:${contact.epost}`}>{contact.epost}</a>
                      </>
                    )}
                  </div>
                  {contact.anteckning && (
                    <div className="k-detalj faint">{contact.anteckning}</div>
                  )}
                </div>
              ),
            )}
          </div>
        )}

        {editing !== null && (
          <form
            onSubmit={submit}
            style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input"
                placeholder="Namn"
                aria-label="Namn"
                required
                value={form.namn}
                onChange={(e) => field("namn", e.target.value)}
                style={{ flex: 1 }}
              />
              <input
                className="input"
                placeholder="Titel, t.ex. VD"
                aria-label="Titel"
                value={form.titel}
                onChange={(e) => field("titel", e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input mono"
                placeholder="Telefon"
                aria-label="Telefon"
                value={form.telefon}
                onChange={(e) => field("telefon", e.target.value)}
                style={{ flex: 1 }}
              />
              <input
                className="input mono"
                type="email"
                placeholder="E-post"
                aria-label="E-post"
                value={form.epost}
                onChange={(e) => field("epost", e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
            <input
              className="input"
              placeholder="Anteckning, t.ex. 'nås bäst efter lunch'"
              aria-label="Anteckning"
              value={form.anteckning}
              onChange={(e) => field("anteckning", e.target.value)}
            />
            {formError && <span className="error-text">{formError}</span>}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="submit"
                className={`btn btn-primary btn-sm${pending ? " loading" : ""}`}
                disabled={pending}
              >
                {editing === "ny" ? "Lägg till kontakt" : "Spara ändringar"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEditing(null)}
                disabled={pending}
              >
                Avbryt
              </button>
            </div>
          </form>
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title={`Ta bort ${toDelete?.namn ?? ""}?`}
        body="Kontaktpersonen försvinner från bolaget och ringlistorna. Borttagningen loggas i tidslinjen."
        actionLabel="Ta bort"
        destructive
        busy={pending}
        onConfirm={runDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
