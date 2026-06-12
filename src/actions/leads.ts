"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { LEAD_STATUS_KEYS, statusLabel } from "@/lib/constants";
import { normalizeOrgnr } from "@/lib/format";
import { createBolagsverketProvider } from "@/lib/providers";
import type { CompanyDetails, YearFinancials } from "@/lib/providers/types";
import { getSyncFilter } from "@/lib/settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { importCompany } from "@/lib/sync/engine";
import { SupabaseSyncStore } from "@/lib/sync/supabase-store";
import type { ActionResult } from "./types";

const statusSchema = z.object({
  leadId: z.uuid(),
  status: z.enum(LEAD_STATUS_KEYS),
  /** Anges när status sätts till Förlorad – sparas för statistik. */
  orsak: z.string().trim().max(300).optional(),
});

const assignSchema = z.object({
  leadId: z.uuid(),
  ownerId: z.uuid().nullable(),
});

interface LeadRow {
  id: string;
  orgnr: string;
  status: string;
  owner_id: string | null;
  namn: string;
}

async function fetchLead(leadId: string): Promise<LeadRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("leads")
    .select("id, orgnr, status, owner_id, companies(namn)")
    .eq("id", leadId)
    .maybeSingle();
  if (!data) return null;
  const companies = data.companies as { namn: string } | { namn: string }[] | null;
  const namn = Array.isArray(companies) ? companies[0]?.namn : companies?.namn;
  return {
    id: data.id,
    orgnr: data.orgnr,
    status: data.status,
    owner_id: data.owner_id,
    namn: namn ?? data.orgnr,
  };
}

function revalidateLeadViews(orgnr: string) {
  revalidatePath("/dashboard");
  revalidatePath("/bolag");
  revalidatePath(`/bolag/${orgnr}`);
  revalidatePath("/pipeline");
}

export async function updateLeadStatusAction(
  input: z.infer<typeof statusSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Ogiltig förfrågan." };
    const { leadId, status, orsak } = parsed.data;

    const lead = await fetchLead(leadId);
    if (!lead) return { ok: false, message: "Leadet hittades inte." };
    if (lead.status === status) {
      return { ok: true, message: `Status är redan ${statusLabel(status)}` };
    }

    const supabase = await createSupabaseServerClient();
    // Kund/Förlorad avslutar leadet – då ska ingen påminnelse ligga kvar
    // i att göra-listan.
    const terminal = status === "kund" || status === "forlorad";
    const { error } = await supabase
      .from("leads")
      .update({
        status,
        forlust_orsak: status === "forlorad" ? orsak || null : null,
        ...(terminal
          ? { follow_up_at: null, follow_up_note: null, follow_up_user: null }
          : {}),
      })
      .eq("id", leadId);
    if (error) return { ok: false, message: `Kunde inte byta status: ${error.message}` };

    await logActivity({
      actorId: session.userId,
      entityType: "lead",
      entityId: lead.orgnr,
      action: "status_andrad",
      payload: {
        orgnr: lead.orgnr,
        namn: lead.namn,
        fran: lead.status,
        till: status,
        ...(status === "forlorad" && orsak ? { orsak } : {}),
      },
    });
    revalidateLeadViews(lead.orgnr);
    return { ok: true, message: `${lead.namn} flyttad till ${statusLabel(status)}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

export async function assignLeadAction(
  input: z.infer<typeof assignSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = assignSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Ogiltig förfrågan." };
    const { leadId, ownerId } = parsed.data;

    const lead = await fetchLead(leadId);
    if (!lead) return { ok: false, message: "Leadet hittades inte." };
    if (lead.owner_id === ownerId) return { ok: true, message: "Ingen ändring." };

    const supabase = await createSupabaseServerClient();

    let ownerNamn: string | null = null;
    if (ownerId) {
      const { data: owner } = await supabase
        .from("profiles")
        .select("namn, aktiv")
        .eq("id", ownerId)
        .maybeSingle();
      if (!owner?.aktiv) return { ok: false, message: "Användaren är inte aktiv." };
      ownerNamn = owner.namn;
    }

    const { error } = await supabase
      .from("leads")
      .update({ owner_id: ownerId })
      .eq("id", leadId);
    if (error) return { ok: false, message: `Kunde inte tilldela: ${error.message}` };

    await logActivity({
      actorId: session.userId,
      entityType: "lead",
      entityId: lead.orgnr,
      action: "tilldelad",
      payload: { orgnr: lead.orgnr, namn: lead.namn, ansvarig: ownerNamn ?? "" },
    });
    revalidateLeadViews(lead.orgnr);
    return {
      ok: true,
      message: ownerNamn ? `Tilldelad ${ownerNamn}` : "Tilldelning borttagen",
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

/* ------------------------------------------------------------------ */
/* Lägg till bolag manuellt (enskild lead)                              */
/* ------------------------------------------------------------------ */

const addLeadSchema = z.object({
  orgnr: z.string().min(1),
  namn: z.string().trim().max(200).optional(),
  ort: z.string().trim().max(80).optional(),
});

/**
 * Säljaren hittar själv ett bolag: ange orgnr så hämtas namn, ort, SNI,
 * verksamhetsbeskrivning och bokslut automatiskt från Bolagsverket
 * (om källan är konfigurerad). Bolaget läggs alltid in som lead med
 * status Ny och tilldelas den som lade till det.
 */
export async function addLeadAction(
  input: z.infer<typeof addLeadSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = addLeadSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Ogiltig förfrågan." };
    const orgnr = normalizeOrgnr(parsed.data.orgnr);
    if (!orgnr) return { ok: false, message: "Ogiltigt organisationsnummer." };

    const admin = createSupabaseAdminClient();
    const { data: existingLead } = await admin
      .from("leads")
      .select("id")
      .eq("orgnr", orgnr)
      .maybeSingle();
    if (existingLead) {
      return { ok: false, message: `${orgnr} finns redan i bolagslistan.` };
    }

    // Försök berika från Bolagsverket; faller tillbaka på manuella fält.
    let details: CompanyDetails | null = null;
    let financials: YearFinancials[] = [];
    let kalla = "manuell";
    try {
      const provider = await createBolagsverketProvider({ withOrgnrSource: false });
      details = await provider.getCompany(orgnr);
      financials = await provider.getFinancials(orgnr);
      kalla = "bolagsverket";
    } catch {
      details = null;
    }

    if (!details) {
      const namn = parsed.data.namn?.trim();
      if (!namn) {
        return {
          ok: false,
          message:
            "Kunde inte hämta bolaget från Bolagsverket – fyll i bolagsnamnet så läggs det in manuellt.",
        };
      }
      details = {
        orgnr,
        namn,
        ort: parsed.data.ort?.trim() || null,
        sniKod: null,
        adress: null,
        antalAnstallda: null,
        hemsida: null,
        telefon: null,
      };
    }

    // Stoppa avregistrerade bolag INNAN något skrivs till databasen.
    if (details.avregistreradDatum) {
      return {
        ok: false,
        message: `${details.namn} är avregistrerat hos Bolagsverket (${details.avregistreradDatum}) – inget lead skapades.`,
      };
    }

    const settings = await getSyncFilter(admin);
    // Lead-skapandet audit-loggas av storen med användaren som aktör.
    const store = new SupabaseSyncStore(admin, session.userId);
    const outcome = await importCompany(store, settings, {
      details,
      financials,
      kalla,
      leadMode: "always",
    });

    // Den som lägger till bolaget blir ansvarig direkt.
    if (outcome.leadCreated) {
      await admin.from("leads").update({ owner_id: session.userId }).eq("orgnr", orgnr);
    }
    revalidateLeadViews(orgnr);
    return {
      ok: true,
      message:
        kalla === "bolagsverket"
          ? `${details.namn} tillagd med data från Bolagsverket${financials.length > 0 ? ` (${financials.length} års bokslut)` : ""}`
          : `${details.namn} tillagd`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

/* ------------------------------------------------------------------ */
/* Uppföljningar (att göra-listan)                                      */
/* ------------------------------------------------------------------ */

const followUpSchema = z.object({
  leadId: z.uuid(),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum anges som ÅÅÅÅ-MM-DD."),
  anteckning: z.string().trim().max(300).optional(),
  /** Vem som ska följa upp – default den som sätter påminnelsen. */
  userId: z.uuid().optional(),
});

export async function setFollowUpAction(
  input: z.infer<typeof followUpSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = followUpSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ogiltig uppföljning." };
    }
    const { leadId, datum, anteckning } = parsed.data;
    const followUpUser = parsed.data.userId ?? session.userId;

    const lead = await fetchLead(leadId);
    if (!lead) return { ok: false, message: "Leadet hittades inte." };

    const supabase = await createSupabaseServerClient();

    // Påminnelser till någon annan: kontrollera att personen finns och är aktiv.
    let ansvarigNamn = "";
    if (followUpUser !== session.userId) {
      const { data: assignee } = await supabase
        .from("profiles")
        .select("namn, aktiv")
        .eq("id", followUpUser)
        .maybeSingle();
      if (!assignee?.aktiv) {
        return { ok: false, message: "Personen som ska följa upp är inte en aktiv användare." };
      }
      ansvarigNamn = assignee.namn;
    }

    const { error } = await supabase
      .from("leads")
      .update({
        follow_up_at: datum,
        follow_up_note: anteckning ?? null,
        follow_up_user: followUpUser,
      })
      .eq("id", leadId);
    if (error) return { ok: false, message: `Kunde inte spara: ${error.message}` };

    await logActivity({
      actorId: session.userId,
      entityType: "lead",
      entityId: lead.orgnr,
      action: "uppfoljning_satt",
      payload: {
        orgnr: lead.orgnr,
        namn: lead.namn,
        datum,
        anteckning: anteckning ?? "",
        ansvarig: ansvarigNamn,
      },
    });
    revalidateLeadViews(lead.orgnr);
    return { ok: true, message: `Uppföljning satt till ${datum}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

const clearFollowUpSchema = z.object({
  leadId: z.uuid(),
  /** true = avklarad (loggas som klar), false = bara borttagen. */
  klar: z.boolean(),
});

export async function clearFollowUpAction(
  input: z.infer<typeof clearFollowUpSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = clearFollowUpSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Ogiltig förfrågan." };
    const { leadId, klar } = parsed.data;

    const lead = await fetchLead(leadId);
    if (!lead) return { ok: false, message: "Leadet hittades inte." };

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("leads")
      .update({ follow_up_at: null, follow_up_note: null, follow_up_user: null })
      .eq("id", leadId);
    if (error) return { ok: false, message: `Kunde inte uppdatera: ${error.message}` };

    if (klar) {
      await logActivity({
        actorId: session.userId,
        entityType: "lead",
        entityId: lead.orgnr,
        action: "uppfoljning_klar",
        payload: { orgnr: lead.orgnr, namn: lead.namn },
      });
    }
    revalidateLeadViews(lead.orgnr);
    return { ok: true, message: klar ? "Uppföljning avklarad" : "Uppföljning borttagen" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

/* ------------------------------------------------------------------ */
/* Massutdelning                                                        */
/* ------------------------------------------------------------------ */

const bulkAssignSchema = z.object({
  leadIds: z.array(z.uuid()).min(1).max(500),
  ownerId: z.uuid().nullable(),
});

export async function bulkAssignAction(
  input: z.infer<typeof bulkAssignSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = bulkAssignSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Ogiltig förfrågan." };
    const { leadIds, ownerId } = parsed.data;

    const supabase = await createSupabaseServerClient();
    let ownerNamn: string | null = null;
    if (ownerId) {
      const { data: owner } = await supabase
        .from("profiles")
        .select("namn, aktiv")
        .eq("id", ownerId)
        .maybeSingle();
      if (!owner?.aktiv) return { ok: false, message: "Användaren är inte aktiv." };
      ownerNamn = owner.namn;
    }

    // Hämta namnen för loggen innan uppdateringen.
    const { data: affected } = await supabase
      .from("leads")
      .select("id, orgnr, companies(namn)")
      .in("id", leadIds);
    const { error } = await supabase
      .from("leads")
      .update({ owner_id: ownerId })
      .in("id", leadIds);
    if (error) return { ok: false, message: `Kunde inte tilldela: ${error.message}` };

    // En sammanfattande rad + en rad per lead (bolagets egen tidslinje).
    const admin = (await import("@/lib/supabase/admin")).createSupabaseAdminClient();
    const rows = (affected ?? []).map((lead) => {
      const companies = lead.companies as { namn: string } | { namn: string }[] | null;
      const namn = (Array.isArray(companies) ? companies[0]?.namn : companies?.namn) ?? lead.orgnr;
      return {
        actor_id: session.userId,
        entity_type: "lead",
        entity_id: lead.orgnr,
        action: "tilldelad",
        payload: { orgnr: lead.orgnr, namn, ansvarig: ownerNamn ?? "" },
      };
    });
    if (rows.length > 0) {
      await admin.from("activities").insert(rows);
    }
    await logActivity({
      actorId: session.userId,
      entityType: "lead",
      entityId: "massutdelning",
      action: "massutdelning",
      payload: { antal: leadIds.length, ansvarig: ownerNamn ?? "" },
    });

    revalidatePath("/bolag");
    revalidatePath("/pipeline");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message: ownerNamn
        ? `${leadIds.length} leads tilldelade ${ownerNamn}`
        : `Tilldelningen borttagen för ${leadIds.length} leads`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

const noteSchema = z.object({
  leadId: z.uuid(),
  body: z.string().trim().min(1, "Anteckningen är tom.").max(4000),
});

export async function addNoteAction(
  input: z.infer<typeof noteSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = noteSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ogiltig anteckning." };
    }
    const { leadId, body } = parsed.data;

    const lead = await fetchLead(leadId);
    if (!lead) return { ok: false, message: "Leadet hittades inte." };

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("notes").insert({
      lead_id: leadId,
      author_id: session.userId,
      body,
    });
    if (error) return { ok: false, message: `Kunde inte spara: ${error.message}` };

    await logActivity({
      actorId: session.userId,
      entityType: "lead",
      entityId: lead.orgnr,
      action: "anteckning",
      payload: { orgnr: lead.orgnr, namn: lead.namn },
    });
    revalidatePath(`/bolag/${lead.orgnr}`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Anteckning sparad" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}
