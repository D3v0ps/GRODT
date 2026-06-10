"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { LEAD_STATUS_KEYS, statusLabel } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "./types";

const statusSchema = z.object({
  leadId: z.uuid(),
  status: z.enum(LEAD_STATUS_KEYS),
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
    const { leadId, status } = parsed.data;

    const lead = await fetchLead(leadId);
    if (!lead) return { ok: false, message: "Leadet hittades inte." };
    if (lead.status === status) {
      return { ok: true, message: `Status är redan ${statusLabel(status)}` };
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("leads")
      .update({ status })
      .eq("id", leadId);
    if (error) return { ok: false, message: `Kunde inte byta status: ${error.message}` };

    await logActivity({
      actorId: session.userId,
      entityType: "lead",
      entityId: lead.orgnr,
      action: "status_andrad",
      payload: { orgnr: lead.orgnr, namn: lead.namn, fran: lead.status, till: status },
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
