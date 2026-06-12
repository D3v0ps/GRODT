"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "./types";

/**
 * Kontaktpersoner per bolag – vem ni faktiskt pratar med. Manuellt
 * inlagda av teamet; när ett berikande API kopplas in skriver det till
 * samma tabell med kalla satt, så att källan alltid syns.
 */

const contactFields = {
  namn: z.string().trim().min(1, "Ange ett namn.").max(120),
  titel: z.string().trim().max(120).optional(),
  telefon: z.string().trim().max(40).optional(),
  epost: z.union([z.literal(""), z.email("Ogiltig e-postadress.")]).optional(),
  anteckning: z.string().trim().max(300).optional(),
};

const addSchema = z.object({ orgnr: z.string().min(1), ...contactFields });
const updateSchema = z.object({ contactId: z.uuid(), ...contactFields });
const deleteSchema = z.object({ contactId: z.uuid() });

async function companyName(orgnr: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("companies")
    .select("namn")
    .eq("orgnr", orgnr)
    .maybeSingle();
  return data?.namn ?? null;
}

export async function addContactAction(
  input: z.infer<typeof addSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = addSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ogiltiga uppgifter." };
    }
    const { orgnr, namn, titel, telefon, epost, anteckning } = parsed.data;

    const bolagsnamn = await companyName(orgnr);
    if (!bolagsnamn) return { ok: false, message: "Bolaget hittades inte." };

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("company_contacts").insert({
      orgnr,
      namn,
      titel: titel || null,
      telefon: telefon || null,
      epost: epost || null,
      anteckning: anteckning || null,
      created_by: session.userId,
    });
    if (error) return { ok: false, message: `Kunde inte spara: ${error.message}` };

    await logActivity({
      actorId: session.userId,
      entityType: "lead",
      entityId: orgnr,
      action: "kontakt_tillagd",
      payload: { orgnr, namn: bolagsnamn, kontakt: namn },
    });
    revalidatePath(`/bolag/${orgnr}`);
    return { ok: true, message: `${namn} tillagd som kontaktperson` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

export async function updateContactAction(
  input: z.infer<typeof updateSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ogiltiga uppgifter." };
    }
    const { contactId, namn, titel, telefon, epost, anteckning } = parsed.data;

    const supabase = await createSupabaseServerClient();
    const { data: existing } = await supabase
      .from("company_contacts")
      .select("id, orgnr, companies(namn)")
      .eq("id", contactId)
      .maybeSingle();
    if (!existing) return { ok: false, message: "Kontaktpersonen hittades inte." };

    const { error } = await supabase
      .from("company_contacts")
      .update({
        namn,
        titel: titel || null,
        telefon: telefon || null,
        epost: epost || null,
        anteckning: anteckning || null,
      })
      .eq("id", contactId);
    if (error) return { ok: false, message: `Kunde inte spara: ${error.message}` };

    const companies = existing.companies as { namn: string } | { namn: string }[] | null;
    const bolagsnamn =
      (Array.isArray(companies) ? companies[0]?.namn : companies?.namn) ?? existing.orgnr;
    await logActivity({
      actorId: session.userId,
      entityType: "lead",
      entityId: existing.orgnr,
      action: "kontakt_andrad",
      payload: { orgnr: existing.orgnr, namn: bolagsnamn, kontakt: namn },
    });
    revalidatePath(`/bolag/${existing.orgnr}`);
    return { ok: true, message: "Kontaktpersonen uppdaterad" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

export async function deleteContactAction(
  input: z.infer<typeof deleteSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = deleteSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Ogiltig förfrågan." };

    const supabase = await createSupabaseServerClient();
    const { data: existing } = await supabase
      .from("company_contacts")
      .select("id, orgnr, namn, companies(namn)")
      .eq("id", parsed.data.contactId)
      .maybeSingle();
    if (!existing) return { ok: false, message: "Kontaktpersonen hittades inte." };

    const { error } = await supabase
      .from("company_contacts")
      .delete()
      .eq("id", parsed.data.contactId);
    if (error) return { ok: false, message: `Kunde inte ta bort: ${error.message}` };

    const companies = existing.companies as { namn: string } | { namn: string }[] | null;
    const bolagsnamn =
      (Array.isArray(companies) ? companies[0]?.namn : companies?.namn) ?? existing.orgnr;
    await logActivity({
      actorId: session.userId,
      entityType: "lead",
      entityId: existing.orgnr,
      action: "kontakt_borttagen",
      payload: { orgnr: existing.orgnr, namn: bolagsnamn, kontakt: existing.namn },
    });
    revalidatePath(`/bolag/${existing.orgnr}`);
    return { ok: true, message: `${existing.namn} borttagen` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}
