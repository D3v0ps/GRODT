import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Sessionshantering + åtkomstskydd i middleware.
 *
 * Prestanda: getClaims() validerar JWT:n lokalt (JWKS cachas) i stället
 * för att fråga Auth-servern på varje request – middleware kostar därmed
 * ~0 ms i normalfallet och förnyar sessionen endast när den gått ut.
 *
 * Aktiv-profil-kontrollen görs i server-lagret ((app)/layout +
 * getSessionProfile på varje sidrendering). Inaktivering spärrar dessutom
 * kontot i Auth (ban), så sessionen kan inte förnyas.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Lokal JWT-validering; förnyar sessionen via refresh token vid behov.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const path = request.nextUrl.pathname;
  const isLoginPage = path === "/login";

  const redirectTo = (pathname: string, search = "") => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = search;
    const redirect = NextResponse.redirect(url);
    // Cookie-uppdateringar (t.ex. förnyad session) måste följa med redirecten.
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie.name, cookie.value);
    });
    return redirect;
  };

  if (!claims) {
    return isLoginPage ? supabaseResponse : redirectTo("/login");
  }

  if (isLoginPage) {
    return redirectTo("/dashboard");
  }

  return supabaseResponse;
}
