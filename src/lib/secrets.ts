import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Hemligheter med två nivåer:
 *   1. Miljövariabler (Vercel) – har alltid företräde.
 *   2. Supabase Vault (krypterat i databasen) – reservväg, läses via
 *      get_secret() som endast service role får anropa.
 *
 * Värden cachas per serverinstans i 5 minuter.
 */

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { value: string | null; expiresAt: number }>();

export async function getSecret(name: string): Promise<string | null> {
  const hit = cache.get(name);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  let value: string | null = null;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("get_secret", { secret_name: name });
    if (!error && typeof data === "string" && data.length > 0) {
      value = data;
    }
  } catch {
    value = null;
  }
  cache.set(name, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Miljövariabel om satt, annars valvet. */
export async function getSecretWithEnvOverride(
  envName: string,
  vaultName: string,
): Promise<string | null> {
  const fromEnv = process.env[envName];
  if (fromEnv && fromEnv.trim() !== "") return fromEnv;
  return getSecret(vaultName);
}
