"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createUserAction,
  setUserActiveAction,
  setUserRoleAction,
} from "@/actions/admin";
import { AvatarWithName } from "@/components/avatar";
import { ConfirmDialog, Modal } from "@/components/modal";
import { useToast } from "@/components/toast";

export interface AdminUserRow {
  id: string;
  namn: string;
  email: string;
  roll: "admin" | "user";
  aktiv: boolean;
}

export function AdminUsers({
  users,
  currentUserId,
}: {
  users: AdminUserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [namn, setNamn] = useState("");
  const [email, setEmail] = useState("");
  const [roll, setRoll] = useState<"admin" | "user">("user");
  const [formError, setFormError] = useState<string | null>(null);

  const [tempPassword, setTempPassword] = useState<{ namn: string; password: string } | null>(null);
  const [confirmUser, setConfirmUser] = useState<AdminUserRow | null>(null);

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await createUserAction({ namn: namn.trim(), email: email.trim(), roll });
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      toast(result.message, "ok");
      setCreateOpen(false);
      setNamn("");
      setEmail("");
      setRoll("user");
      if (result.tempPassword) {
        setTempPassword({ namn: namn.trim(), password: result.tempPassword });
      }
      router.refresh();
    });
  }

  function toggleActive(user: AdminUserRow) {
    startTransition(async () => {
      const result = await setUserActiveAction({ userId: user.id, aktiv: !user.aktiv });
      toast(result.message, result.ok ? "info" : "err");
      setConfirmUser(null);
      if (result.ok) router.refresh();
    });
  }

  function changeRole(user: AdminUserRow, nextRoll: "admin" | "user") {
    startTransition(async () => {
      const result = await setUserRoleAction({ userId: user.id, roll: nextRoll });
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) router.refresh();
    });
  }

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Admin</h1>
          <p className="lede">Användarhantering och global audit log.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            Skapa konto
          </button>
        </div>
      </div>

      <div className="table-shell" style={{ marginBottom: 14 }}>
        <div className="table-toolbar">
          <strong style={{ fontSize: 13 }}>Användare</strong>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Namn</th>
                <th>E-post</th>
                <th>Roll</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <AvatarWithName id={user.id} namn={user.namn} />
                  </td>
                  <td className="mono small">{user.email}</td>
                  <td>
                    <select
                      className="select"
                      aria-label={`Roll för ${user.namn}`}
                      value={user.roll}
                      disabled={pending || user.id === currentUserId}
                      onChange={(e) => changeRole(user, e.target.value as "admin" | "user")}
                      style={{ padding: "4px 8px", fontSize: 12 }}
                    >
                      <option value="user">Användare</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    {user.aktiv ? (
                      <span className="pill ok">
                        <span className="dot" />
                        Aktiv
                      </span>
                    ) : (
                      <span className="pill err">
                        <span className="dot" />
                        Inaktiverad
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {user.aktiv ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        disabled={pending || user.id === currentUserId}
                        title={
                          user.id === currentUserId
                            ? "Du kan inte inaktivera ditt eget konto"
                            : undefined
                        }
                        onClick={() => setConfirmUser(user)}
                      >
                        Inaktivera
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={pending}
                        onClick={() => toggleActive(user)}
                      >
                        Återaktivera
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        titleId="mu-title"
        title="Skapa konto"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setCreateOpen(false)}>
              Avbryt
            </button>
            <button
              type="submit"
              form="create-user-form"
              className={`btn btn-primary${pending ? " loading" : ""}`}
              disabled={pending}
            >
              Skapa konto
            </button>
          </>
        }
      >
        <form
          id="create-user-form"
          onSubmit={submitCreate}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div className="field">
            <label htmlFor="nu-namn">Namn</label>
            <input
              className="input"
              id="nu-namn"
              required
              placeholder="För- och efternamn"
              value={namn}
              onChange={(e) => setNamn(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="nu-email">E-post</label>
            <input
              className="input"
              id="nu-email"
              type="email"
              required
              placeholder="namn@grodt.se"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="nu-roll">Roll</label>
            <select
              className="select"
              id="nu-roll"
              value={roll}
              onChange={(e) => setRoll(e.target.value as "admin" | "user")}
            >
              <option value="user">Användare</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {formError && (
            <div className="field">
              <span className="error-text">{formError}</span>
            </div>
          )}
          <p className="small faint">
            Ett tillfälligt lösenord genereras och visas en gång – dela det säkert med
            användaren. Ingen självregistrering finns.
          </p>
        </form>
      </Modal>

      <Modal
        open={tempPassword !== null}
        onClose={() => setTempPassword(null)}
        titleId="pw-title"
        title="Konto skapat"
        footer={
          <button type="button" className="btn btn-primary" onClick={() => setTempPassword(null)}>
            Klart – lösenordet är delat
          </button>
        }
      >
        <p>
          Tillfälligt lösenord för <strong>{tempPassword?.namn}</strong>. Det visas bara
          den här gången – kopiera och dela det säkert:
        </p>
        <p className="mono" style={{ fontSize: 15, padding: "8px 10px", background: "var(--line-soft)", borderRadius: 6 }}>
          {tempPassword?.password}
        </p>
      </Modal>

      <ConfirmDialog
        open={confirmUser !== null}
        title="Inaktivera konto?"
        body={`${confirmUser?.namn ?? ""} förlorar åtkomst direkt. Kontot kan återaktiveras senare och all historik behålls.`}
        actionLabel="Inaktivera"
        destructive
        busy={pending}
        onConfirm={() => confirmUser && toggleActive(confirmUser)}
        onCancel={() => setConfirmUser(null)}
      />
    </>
  );
}
