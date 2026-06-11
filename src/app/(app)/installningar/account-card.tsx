"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  changeOwnPasswordAction,
  removeAvatarAction,
  updateAvatarAction,
} from "@/actions/account";
import { useToast } from "@/components/toast";
import { rollLabel } from "@/lib/constants";
import { avatarClass, initials } from "@/lib/format";

const AVATAR_TARGET_PX = 512;

/** Skalar ner bilden i webbläsaren till max 512 px JPEG innan uppladdning. */
async function downscaleImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, AVATAR_TARGET_PX / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Kunde inte behandla bilden."))),
      "image/jpeg",
      0.86,
    );
  });
}

export function AccountCard({
  userId,
  namn,
  email,
  roll,
  avatarUrl: initialAvatarUrl,
}: {
  userId: string;
  namn: string;
  email: string;
  roll: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onAvatarChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || avatarBusy) return;
    if (!file.type.startsWith("image/")) {
      toast("Välj en bildfil (JPEG, PNG eller WebP).", "err");
      return;
    }
    setAvatarBusy(true);
    try {
      const blob = await downscaleImage(file);
      const formData = new FormData();
      formData.set("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
      const result = await updateAvatarAction(formData);
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) {
        setAvatarUrl(result.avatarUrl ?? null);
        router.refresh();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kunde inte behandla bilden.", "err");
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onAvatarRemove() {
    if (avatarBusy) return;
    setAvatarBusy(true);
    const result = await removeAvatarAction();
    toast(result.message, result.ok ? "info" : "err");
    if (result.ok) {
      setAvatarUrl(null);
      router.refresh();
    }
    setAvatarBusy(false);
  }

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
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="avatar avatar-img"
              src={avatarUrl}
              alt={`Profilbild för ${namn}`}
              style={{ width: 64, height: 64 }}
            />
          ) : (
            <span
              className={`avatar ${avatarClass(userId)}`.trim()}
              style={{ width: 64, height: 64, fontSize: 24 }}
            >
              {initials(namn)}
            </span>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className={`btn btn-sm${avatarBusy ? " loading btn-secondary-spinner" : ""}`}
                onClick={() => fileRef.current?.click()}
                disabled={avatarBusy}
              >
                {avatarUrl ? "Byt profilbild" : "Ladda upp profilbild"}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={onAvatarRemove}
                  disabled={avatarBusy}
                >
                  Ta bort
                </button>
              )}
            </div>
            <span className="hint">
              JPEG, PNG eller WebP. Skalas automatiskt ner till {AVATAR_TARGET_PX} px.
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={onAvatarChosen}
              aria-label="Välj profilbild"
            />
          </div>
        </div>
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
