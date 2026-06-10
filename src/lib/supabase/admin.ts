import { createClient } from "@supabase/supabase-js";
import { requiredEnv } from "@/lib/env";

/**
 * Service role-klient. Kringgår RLS och får ENDAST användas server-side:
 * audit-loggen, synk-/importskrivningar och admin-API:t för konton.
 */
export function createSupabaseAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("Service role-klienten får aldrig användas i klientkod.");
  }
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
