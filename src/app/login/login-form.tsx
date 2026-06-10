"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("reason") === "inaktiverad"
      ? "Kontot är inaktiverat. Kontakta administratören."
      : null,
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!email.trim() || !email.includes("@") || !password) {
      setError("Fel e-post eller lösenord. Försök igen.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setLoading(false);
      setError("Fel e-post eller lösenord. Försök igen.");
      return;
    }
    // Middleware kontrollerar aktiv profil och släpper in (eller ut igen).
    router.push("/dashboard");
    router.refresh();
  }

  const invalid = error !== null && error.startsWith("Fel e-post");

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor="login-email">E-post</label>
        <input
          className="input"
          type="email"
          id="login-email"
          placeholder="namn@grodt.se"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={invalid || undefined}
        />
      </div>
      <div className="field">
        <label htmlFor="login-pass">Lösenord</label>
        <input
          className="input"
          type="password"
          id="login-pass"
          placeholder="••••••••"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={invalid || undefined}
        />
        {error && (
          <span className="error-text" id="login-error">
            {error}
          </span>
        )}
      </div>
      <button
        className={`btn btn-accent${loading ? " loading" : ""}`}
        type="submit"
        disabled={loading}
        style={{ width: "100%", padding: 10 }}
      >
        Logga in
      </button>
    </form>
  );
}
