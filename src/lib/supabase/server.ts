import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requiredEnv } from "@/lib/env";

/** Användarbunden klient för server components, actions och route handlers. RLS gäller. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll anropad från en server component – middleware
            // uppdaterar sessionen, så detta kan ignoreras.
          }
        },
      },
    },
  );
}
