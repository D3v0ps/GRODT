"use server";

import { requireAdmin } from "@/lib/auth";
import { createBolagsverketProvider } from "@/lib/providers";
import { checkRateLimit } from "@/lib/rate-limit";

export interface BolagsverketTestResult {
  ok: boolean;
  lines: string[];
}

/** Admin-självtest: token + uppslag + dokumentlista mot Bolagsverket. */
export async function testBolagsverketAction(): Promise<BolagsverketTestResult> {
  try {
    const session = await requireAdmin();
    const limit = checkRateLimit(`bvtest:${session.userId}`, 5, 60_000);
    if (!limit.ok) {
      return { ok: false, lines: [`För många test – vänta ${limit.retryAfterSeconds} s.`] };
    }
    const provider = await createBolagsverketProvider({ withOrgnrSource: false });
    const lines = await provider.selfTest();
    return { ok: true, lines };
  } catch (e) {
    return {
      ok: false,
      lines: [e instanceof Error ? e.message : "Okänt fel vid självtestet."],
    };
  }
}
