import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Skyddar allt utom:
     * - /api/cron (skyddas med CRON_SECRET i route-handlern)
     * - Next.js statiska filer och bilder
     * - favicon och vanliga statiska tillgångar
     */
    "/((?!api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
