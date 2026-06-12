"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireAdmin, requireUser } from "@/lib/auth";
import {
  getGooglePlacesApiKey,
  searchPlaceContact,
} from "@/lib/providers/google-places";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./types";

/**
 * Google Places-berikning av telefon/hemsida. Regler:
 *  - fyller ENDAST tomma fält (CSV-/manuell data skrivs aldrig över)
 *  - allt som hämtas källmärks med telefon_kalla/hemsida_kalla = 'google'
 *    och visas i UI:t som "via Google – kan vara växelnummer"
 *  - osäkra namnmatchningar sparas inte alls
 */

interface CompanyContactRow {
  orgnr: string;
  namn: string;
  ort: string | null;
  telefon: string | null;
  hemsida: string | null;
}

async function enrichOne(
  apiKey: string,
  company: CompanyContactRow,
  actorId: string,
): Promise<{ telefon: string | null; hemsida: string | null } | null> {
  const match = await searchPlaceContact(apiKey, company.namn, company.ort);
  if (!match) return null;

  const newTelefon = !company.telefon && match.telefon ? match.telefon : null;
  const newHemsida = !company.hemsida && match.hemsida ? match.hemsida : null;
  if (!newTelefon && !newHemsida) return null;

  const admin = createSupabaseAdminClient();
  const update: Record<string, string> = {};
  if (newTelefon) {
    update.telefon = newTelefon;
    update.telefon_kalla = "google";
  }
  if (newHemsida) {
    update.hemsida = newHemsida;
    update.hemsida_kalla = "google";
  }
  const { error } = await admin.from("companies").update(update).eq("orgnr", company.orgnr);
  if (error) throw new Error(error.message);

  await logActivity({
    actorId,
    entityType: "lead",
    entityId: company.orgnr,
    action: "google_berikning",
    payload: {
      orgnr: company.orgnr,
      namn: company.namn,
      telefon: newTelefon ?? "",
      hemsida: newHemsida ?? "",
      matchad_profil: match.matchedName,
    },
  });
  return { telefon: newTelefon, hemsida: newHemsida };
}

const singleSchema = z.object({ orgnr: z.string().min(1) });

/** "Hämta från Google"-knappen på bolagskortet. */
export async function enrichCompanyContactAction(
  input: z.infer<typeof singleSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = singleSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Ogiltig förfrågan." };

    const limit = checkRateLimit(`google:${session.userId}`, 20, 60_000);
    if (!limit.ok) {
      return { ok: false, message: `För många uppslag – vänta ${limit.retryAfterSeconds} s.` };
    }
    const apiKey = await getGooglePlacesApiKey();
    if (!apiKey) {
      return {
        ok: false,
        message:
          "Google Places är inte konfigurerat – lägg GOOGLE_PLACES_API_KEY i Vercel (eller valvet).",
      };
    }

    const admin = createSupabaseAdminClient();
    const { data: company } = await admin
      .from("companies")
      .select("orgnr, namn, ort, telefon, hemsida")
      .eq("orgnr", parsed.data.orgnr)
      .maybeSingle();
    if (!company) return { ok: false, message: "Bolaget hittades inte." };
    if (company.telefon && company.hemsida) {
      return { ok: true, message: "Telefon och hemsida finns redan – inget hämtades." };
    }

    const result = await enrichOne(apiKey, company, session.userId);
    if (!result) {
      return {
        ok: false,
        message:
          "Ingen säker träff på Google (namnmatchningen höll inte, eller profilen saknar kontaktuppgifter).",
      };
    }

    revalidatePath(`/bolag/${company.orgnr}`);
    revalidatePath("/bolag");
    const parts = [
      result.telefon && `telefon ${result.telefon}`,
      result.hemsida && "hemsida",
    ].filter(Boolean);
    return {
      ok: true,
      message: `Hämtat via Google: ${parts.join(" + ")} (växel/publik profil)`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

const sweepSchema = z.object({
  limit: z.number().int().min(1).max(100).default(100),
});

export interface GoogleSweepResult extends ActionResult {
  granskade?: number;
  telefon?: number;
  hemsidor?: number;
  utanTraff?: number;
}

/** Admin-svep: fyll telefon/hemsida för bolag som saknar (max 100/körning). */
export async function enrichMissingContactsAction(
  input: z.infer<typeof sweepSchema>,
): Promise<GoogleSweepResult> {
  try {
    const session = await requireAdmin();
    const parsed = sweepSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Ogiltig förfrågan." };

    const limit = checkRateLimit("google:sweep", 2, 5 * 60_000);
    if (!limit.ok) {
      return { ok: false, message: `Ett svep kördes nyss – vänta ${limit.retryAfterSeconds} s.` };
    }
    const apiKey = await getGooglePlacesApiKey();
    if (!apiKey) {
      return {
        ok: false,
        message:
          "Google Places är inte konfigurerat – lägg GOOGLE_PLACES_API_KEY i Vercel (eller valvet).",
      };
    }

    const admin = createSupabaseAdminClient();
    const { data: companies, error } = await admin
      .from("companies")
      .select("orgnr, namn, ort, telefon, hemsida")
      .is("telefon", null)
      .is("avregistrerad_datum", null)
      .order("namn")
      .limit(parsed.data.limit);
    if (error) return { ok: false, message: error.message };
    if (!companies || companies.length === 0) {
      return { ok: true, message: "Alla bolag har redan telefonnummer.", granskade: 0 };
    }

    let telefon = 0;
    let hemsidor = 0;
    let utanTraff = 0;
    for (const company of companies) {
      try {
        const result = await enrichOne(apiKey, company, session.userId);
        if (result?.telefon) telefon++;
        if (result?.hemsida) hemsidor++;
        if (!result) utanTraff++;
      } catch (e) {
        // Kvotfel avbryter svepet snyggt; övriga fel räknas som utan träff.
        if (e instanceof Error && e.message.includes("kvoten")) {
          return {
            ok: false,
            message: `Google-kvoten nåddes efter ${telefon + utanTraff} bolag – kör igen senare.`,
            granskade: telefon + utanTraff,
            telefon,
            hemsidor,
            utanTraff,
          };
        }
        utanTraff++;
      }
      // Lugn takt mot Places-kvoten.
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    await logActivity({
      actorId: session.userId,
      entityType: "synk",
      entityId: "google-svep",
      action: "google_berikning",
      payload: { antal: companies.length, telefon, hemsidor, utan_traff: utanTraff },
    });
    revalidatePath("/bolag");
    return {
      ok: true,
      message: `Google-svep klart: ${telefon} telefonnummer och ${hemsidor} hemsidor av ${companies.length} bolag (${utanTraff} utan säker träff).`,
      granskade: companies.length,
      telefon,
      hemsidor,
      utanTraff,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}
