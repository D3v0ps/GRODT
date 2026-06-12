"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { KUND_STATUS_KEYS, kundStatusLabel } from "@/lib/constants";
import { fmtKr, normalizeOrgnr } from "@/lib/format";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "./types";

function revalidateCustomerViews(orgnr?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/kunder");
  revalidatePath("/bolag");
  if (orgnr) revalidatePath(`/bolag/${orgnr}`);
}

interface CustomerRow {
  id: string;
  orgnr: string;
  status: string;
  controller_id: string | null;
  namn: string;
}

async function fetchCustomer(customerId: string): Promise<CustomerRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("customers")
    .select("id, orgnr, status, controller_id, companies(namn)")
    .eq("id", customerId)
    .maybeSingle();
  if (!data) return null;
  const companies = data.companies as { namn: string } | { namn: string }[] | null;
  const namn = Array.isArray(companies) ? companies[0]?.namn : companies?.namn;
  return {
    id: data.id,
    orgnr: data.orgnr,
    status: data.status,
    controller_id: data.controller_id,
    namn: namn ?? data.orgnr,
  };
}

/* ------------------------------------------------------------------ */
/* Överlämning: säljare → controller                                    */
/* ------------------------------------------------------------------ */

const handoffSchema = z.object({
  orgnr: z.string().min(1),
  controllerId: z.uuid().nullable(),
  kommentar: z.string().trim().max(4000).optional(),
});

export async function handoffCustomerAction(
  input: z.infer<typeof handoffSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = handoffSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Ogiltig förfrågan." };
    const { controllerId, kommentar } = parsed.data;

    const supabase = await createSupabaseServerClient();
    const { data: lead } = await supabase
      .from("leads")
      .select("id, status, orgnr, companies(namn)")
      .eq("orgnr", parsed.data.orgnr)
      .maybeSingle();
    if (!lead) return { ok: false, message: "Bolaget har inget lead att lämna över." };
    const companies = lead.companies as { namn: string } | { namn: string }[] | null;
    const namn = (Array.isArray(companies) ? companies[0]?.namn : companies?.namn) ?? lead.orgnr;

    let controllerNamn: string | null = null;
    if (controllerId) {
      const { data: controller } = await supabase
        .from("profiles")
        .select("namn, aktiv")
        .eq("id", controllerId)
        .maybeSingle();
      if (!controller?.aktiv) return { ok: false, message: "Controllern är inte aktiv." };
      controllerNamn = controller.namn;
    }

    // Vunnet bolag ska stå som Kund i pipelinen.
    if (lead.status !== "kund") {
      await supabase.from("leads").update({ status: "kund" }).eq("id", lead.id);
      await logActivity({
        actorId: session.userId,
        entityType: "lead",
        entityId: lead.orgnr,
        action: "status_andrad",
        payload: { orgnr: lead.orgnr, namn, fran: lead.status, till: "kund" },
      });
    }

    const { data: customer, error } = await supabase
      .from("customers")
      .insert({
        orgnr: lead.orgnr,
        lead_id: lead.id,
        saljare_id: session.userId,
        controller_id: controllerId,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        return { ok: false, message: `${namn} är redan överlämnad.` };
      }
      return { ok: false, message: `Kunde inte lämna över: ${error.message}` };
    }

    if (kommentar) {
      await supabase.from("customer_notes").insert({
        customer_id: customer.id,
        author_id: session.userId,
        body: kommentar,
      });
    }

    await logActivity({
      actorId: session.userId,
      entityType: "kund",
      entityId: lead.orgnr,
      action: "kund_overlamnad",
      payload: { orgnr: lead.orgnr, namn, controller: controllerNamn ?? "" },
    });
    revalidateCustomerViews(lead.orgnr);
    return {
      ok: true,
      message: controllerNamn
        ? `${namn} överlämnad till ${controllerNamn}`
        : `${namn} överlämnad till controllers`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

/* ------------------------------------------------------------------ */
/* Manuellt tillagd kund                                                */
/* ------------------------------------------------------------------ */

const manualSchema = z.object({
  orgnr: z.string().min(1),
  namn: z.string().trim().min(2, "Ange bolagsnamn.").max(200),
  ort: z.string().trim().max(80).optional(),
  controllerId: z.uuid().nullable(),
});

export async function createManualCustomerAction(
  input: z.infer<typeof manualSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = manualSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ogiltiga uppgifter." };
    }
    const orgnr = normalizeOrgnr(parsed.data.orgnr);
    if (!orgnr) return { ok: false, message: "Ogiltigt organisationsnummer." };
    const { namn, ort, controllerId } = parsed.data;

    // companies/leads skrivs server-side – validerat och audit-loggat här.
    const admin = createSupabaseAdminClient();
    const { data: existingCustomer } = await admin
      .from("customers")
      .select("id")
      .eq("orgnr", orgnr)
      .maybeSingle();
    if (existingCustomer) {
      return { ok: false, message: "Bolaget finns redan som kund." };
    }

    const { data: existingCompany } = await admin
      .from("companies")
      .select("orgnr")
      .eq("orgnr", orgnr)
      .maybeSingle();
    if (!existingCompany) {
      const { error } = await admin.from("companies").insert({
        orgnr,
        namn,
        ort: ort || null,
        kalla: "manuell",
      });
      if (error) return { ok: false, message: `Kunde inte skapa bolaget: ${error.message}` };
    }

    const { data: lead, error: leadError } = await admin
      .from("leads")
      .upsert({ orgnr, status: "kund" }, { onConflict: "orgnr" })
      .select("id")
      .single();
    if (leadError) return { ok: false, message: `Kunde inte skapa lead: ${leadError.message}` };

    const { error: customerError } = await admin.from("customers").insert({
      orgnr,
      lead_id: lead.id,
      saljare_id: session.userId,
      controller_id: controllerId,
    });
    if (customerError) {
      return { ok: false, message: `Kunde inte skapa kunden: ${customerError.message}` };
    }

    await logActivity({
      actorId: session.userId,
      entityType: "kund",
      entityId: orgnr,
      action: "kund_skapad",
      payload: { orgnr, namn },
    });
    revalidateCustomerViews(orgnr);
    return { ok: true, message: `${namn} tillagd som kund` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

/* ------------------------------------------------------------------ */
/* Status, controller, intäkter, kommentarer                            */
/* ------------------------------------------------------------------ */

const statusSchema = z.object({
  customerId: z.uuid(),
  status: z.enum(KUND_STATUS_KEYS),
});

export async function updateCustomerStatusAction(
  input: z.infer<typeof statusSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Ogiltig förfrågan." };
    const { customerId, status } = parsed.data;

    const customer = await fetchCustomer(customerId);
    if (!customer) return { ok: false, message: "Kunden hittades inte." };
    if (customer.status === status) {
      return { ok: true, message: `Status är redan ${kundStatusLabel(status)}` };
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("customers")
      .update({ status })
      .eq("id", customerId);
    if (error) return { ok: false, message: `Kunde inte byta status: ${error.message}` };

    await logActivity({
      actorId: session.userId,
      entityType: "kund",
      entityId: customer.orgnr,
      action: "kund_status",
      payload: { orgnr: customer.orgnr, namn: customer.namn, fran: customer.status, till: status },
    });
    revalidateCustomerViews(customer.orgnr);
    return { ok: true, message: `${customer.namn} är nu ${kundStatusLabel(status)}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

const controllerSchema = z.object({
  customerId: z.uuid(),
  controllerId: z.uuid().nullable(),
});

export async function assignControllerAction(
  input: z.infer<typeof controllerSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = controllerSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Ogiltig förfrågan." };
    const { customerId, controllerId } = parsed.data;

    const customer = await fetchCustomer(customerId);
    if (!customer) return { ok: false, message: "Kunden hittades inte." };
    if (customer.controller_id === controllerId) return { ok: true, message: "Ingen ändring." };

    const supabase = await createSupabaseServerClient();
    let controllerNamn: string | null = null;
    if (controllerId) {
      const { data: controller } = await supabase
        .from("profiles")
        .select("namn, aktiv")
        .eq("id", controllerId)
        .maybeSingle();
      if (!controller?.aktiv) return { ok: false, message: "Användaren är inte aktiv." };
      controllerNamn = controller.namn;
    }

    const { error } = await supabase
      .from("customers")
      .update({ controller_id: controllerId })
      .eq("id", customerId);
    if (error) return { ok: false, message: `Kunde inte tilldela: ${error.message}` };

    await logActivity({
      actorId: session.userId,
      entityType: "kund",
      entityId: customer.orgnr,
      action: "kund_controller",
      payload: { orgnr: customer.orgnr, namn: customer.namn, controller: controllerNamn ?? "" },
    });
    revalidateCustomerViews(customer.orgnr);
    return {
      ok: true,
      message: controllerNamn ? `Controller: ${controllerNamn}` : "Controller borttagen",
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

const revenueSchema = z.object({
  customerId: z.uuid(),
  amountSek: z
    .number()
    .int()
    .positive("Beloppet måste vara större än 0 kr."),
  beskrivning: z.string().trim().max(300).optional(),
  datum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum anges som ÅÅÅÅ-MM-DD.")
    .optional(),
});

export async function addCustomerRevenueAction(
  input: z.infer<typeof revenueSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = revenueSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ogiltigt belopp." };
    }
    const { customerId, amountSek, beskrivning, datum } = parsed.data;

    const customer = await fetchCustomer(customerId);
    if (!customer) return { ok: false, message: "Kunden hittades inte." };

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("customer_revenues").insert({
      customer_id: customerId,
      amount_sek: amountSek,
      beskrivning: beskrivning || null,
      datum: datum ?? undefined,
      created_by: session.userId,
    });
    if (error) return { ok: false, message: `Kunde inte spara intäkten: ${error.message}` };

    await logActivity({
      actorId: session.userId,
      entityType: "kund",
      entityId: customer.orgnr,
      action: "kund_intakt",
      payload: {
        orgnr: customer.orgnr,
        namn: customer.namn,
        belopp: amountSek,
        beskrivning: beskrivning ?? "",
      },
    });
    revalidateCustomerViews(customer.orgnr);
    return { ok: true, message: `${fmtKr(amountSek)} registrerat på ${customer.namn}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

const updateRevenueSchema = z.object({
  revenueId: z.uuid(),
  amountSek: z.number().int().positive("Beloppet måste vara större än 0 kr."),
  beskrivning: z.string().trim().max(300).optional(),
  datum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum anges som ÅÅÅÅ-MM-DD."),
});

interface RevenueRow {
  id: string;
  customer_id: string;
  amount_sek: number;
  beskrivning: string | null;
  customer: { orgnr: string; namn: string } | null;
}

async function fetchRevenue(revenueId: string): Promise<RevenueRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("customer_revenues")
    .select("id, customer_id, amount_sek, beskrivning, customers(orgnr, companies(namn))")
    .eq("id", revenueId)
    .maybeSingle();
  if (!data) return null;
  const customers = data.customers as
    | { orgnr: string; companies: { namn: string } | { namn: string }[] | null }
    | { orgnr: string; companies: { namn: string } | { namn: string }[] | null }[]
    | null;
  const customer = Array.isArray(customers) ? customers[0] : customers;
  const companies = customer?.companies;
  const namn = Array.isArray(companies) ? companies[0]?.namn : companies?.namn;
  return {
    id: data.id,
    customer_id: data.customer_id,
    amount_sek: Number(data.amount_sek),
    beskrivning: data.beskrivning,
    customer: customer ? { orgnr: customer.orgnr, namn: namn ?? customer.orgnr } : null,
  };
}

/** Rätta en felregistrerad intäkt – tillåts för den som skapade posten samt admin (RLS). */
export async function updateCustomerRevenueAction(
  input: z.infer<typeof updateRevenueSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = updateRevenueSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ogiltiga uppgifter." };
    }
    const { revenueId, amountSek, beskrivning, datum } = parsed.data;

    const existing = await fetchRevenue(revenueId);
    if (!existing) return { ok: false, message: "Intäktsposten hittades inte." };

    const supabase = await createSupabaseServerClient();
    const { data: updated, error } = await supabase
      .from("customer_revenues")
      .update({
        amount_sek: amountSek,
        beskrivning: beskrivning || null,
        datum,
      })
      .eq("id", revenueId)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, message: `Kunde inte spara: ${error.message}` };
    if (!updated) {
      return {
        ok: false,
        message: "Du kan bara redigera intäkter du själv registrerat (admin kan redigera alla).",
      };
    }

    await logActivity({
      actorId: session.userId,
      entityType: "kund",
      entityId: existing.customer?.orgnr ?? revenueId,
      action: "kund_intakt_andrad",
      payload: {
        orgnr: existing.customer?.orgnr ?? "",
        namn: existing.customer?.namn ?? "",
        fran_belopp: existing.amount_sek,
        belopp: amountSek,
        beskrivning: beskrivning ?? "",
      },
    });
    revalidateCustomerViews(existing.customer?.orgnr);
    return { ok: true, message: `Intäkten ändrad till ${fmtKr(amountSek)}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

const deleteRevenueSchema = z.object({ revenueId: z.uuid() });

/** Ta bort en felregistrerad intäkt – samma behörighet som redigering. */
export async function deleteCustomerRevenueAction(
  input: z.infer<typeof deleteRevenueSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = deleteRevenueSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Ogiltig förfrågan." };

    const existing = await fetchRevenue(parsed.data.revenueId);
    if (!existing) return { ok: false, message: "Intäktsposten hittades inte." };

    const supabase = await createSupabaseServerClient();
    const { data: deleted, error } = await supabase
      .from("customer_revenues")
      .delete()
      .eq("id", parsed.data.revenueId)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, message: `Kunde inte ta bort: ${error.message}` };
    if (!deleted) {
      return {
        ok: false,
        message: "Du kan bara ta bort intäkter du själv registrerat (admin kan ta bort alla).",
      };
    }

    await logActivity({
      actorId: session.userId,
      entityType: "kund",
      entityId: existing.customer?.orgnr ?? parsed.data.revenueId,
      action: "kund_intakt_borttagen",
      payload: {
        orgnr: existing.customer?.orgnr ?? "",
        namn: existing.customer?.namn ?? "",
        belopp: existing.amount_sek,
        beskrivning: existing.beskrivning ?? "",
      },
    });
    revalidateCustomerViews(existing.customer?.orgnr);
    return { ok: true, message: `Intäkten på ${fmtKr(existing.amount_sek)} är borttagen` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

const contactSchema = z.object({
  customerId: z.uuid(),
  kontaktperson: z.string().trim().max(120).optional(),
  telefon: z.string().trim().max(40).optional(),
  epost: z.union([z.literal(""), z.email("Ogiltig e-postadress.")]).optional(),
});

/** Teamets verifierade kontaktväg till kunden ("numret man når dem på"). */
export async function updateCustomerContactAction(
  input: z.infer<typeof contactSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = contactSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ogiltiga uppgifter." };
    }
    const { customerId, kontaktperson, telefon, epost } = parsed.data;

    const customer = await fetchCustomer(customerId);
    if (!customer) return { ok: false, message: "Kunden hittades inte." };

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("customers")
      .update({
        kontaktperson: kontaktperson || null,
        kontakt_telefon: telefon || null,
        kontakt_epost: epost || null,
      })
      .eq("id", customerId);
    if (error) return { ok: false, message: `Kunde inte spara: ${error.message}` };

    await logActivity({
      actorId: session.userId,
      entityType: "kund",
      entityId: customer.orgnr,
      action: "kund_kontakt_andrad",
      payload: {
        orgnr: customer.orgnr,
        namn: customer.namn,
        kontaktperson: kontaktperson ?? "",
      },
    });
    revalidateCustomerViews(customer.orgnr);
    return { ok: true, message: "Kontaktuppgifterna sparade" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

const noteSchema = z.object({
  customerId: z.uuid(),
  body: z.string().trim().min(1, "Kommentaren är tom.").max(4000),
});

export async function addCustomerNoteAction(
  input: z.infer<typeof noteSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = noteSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ogiltig kommentar." };
    }
    const { customerId, body } = parsed.data;

    const customer = await fetchCustomer(customerId);
    if (!customer) return { ok: false, message: "Kunden hittades inte." };

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("customer_notes").insert({
      customer_id: customerId,
      author_id: session.userId,
      body,
    });
    if (error) return { ok: false, message: `Kunde inte spara: ${error.message}` };

    await logActivity({
      actorId: session.userId,
      entityType: "kund",
      entityId: customer.orgnr,
      action: "kund_kommentar",
      payload: { orgnr: customer.orgnr, namn: customer.namn },
    });
    revalidateCustomerViews(customer.orgnr);
    return { ok: true, message: "Kommentar sparad" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}
