import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Sessionshantering + åtkomstskydd i middleware.
 *
 * - Oinloggade användare ser endast /login.
 * - Inloggade som saknar aktiv profil loggas ut direkt (inaktiverat konto
 *   stängs alltså ute på nästa request, oavsett giltig session).
 * - Inloggade som besöker /login skickas till dashboarden.
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

  // VIKTIGT: getUser() validerar mot Supabase Auth – lita aldrig på enbart cookien.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isLoginPage = path === "/login";

  const redirectTo = (pathname: string, search = "") => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = search;
    const redirect = NextResponse.redirect(url);
    // Cookie-uppdateringar (t.ex. utloggning) måste följa med redirecten.
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie.name, cookie.value);
    });
    return redirect;
  };

  if (!user) {
    return isLoginPage ? supabaseResponse : redirectTo("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("aktiv")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.aktiv) {
    await supabase.auth.signOut();
    return redirectTo("/login", "?reason=inaktiverad");
  }

  if (isLoginPage) {
    return redirectTo("/dashboard");
  }

  return supabaseResponse;
}
