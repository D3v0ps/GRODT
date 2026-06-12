"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { parseListParams, rpcArgs, type LeadListRow } from "@/lib/list-params";
import { getSyncFilter, tableYearWindow } from "@/lib/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "./types";

/** Tak per lista – en ringlista ska gå att beta av, inte vara ett arkiv. */
const MAX_ITEMS = 500;

const createSchema = z.object({
  namn: z.string().trim().min(1, "Ge listan ett namn.").max(80, "Max 80 tecken."),
  /** Uttryckligen markerade leads (kryssrutorna i bolagslistan). */
  leadIds: z.array(z.uuid()).max(MAX_ITEMS).optional(),
  /** Aktiva bolagsfilter när hela filtret sparas som lista. */
  filter: z.record(z.string(), z.string()).optional(),
});

export interface CreateCallListResult extends ActionResult {
  listId?: string;
}

/**
 * Skapar en ringlista från markerade rader eller hela det aktiva filtret.
 * Filtervägen kör samma list_leads-RPC som bolagslistan, i samma
 * sortering, och hoppar över avregistrerade bolag – de ska ingen ringa.
 */
export async function createCallListAction(
  input: z.infer<typeof createSchema>,
): Promise<CreateCallListResult> {
  try {
    const session = await requireUser();
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ogiltig förfrågan." };
    }
    const { namn } = parsed.data;
    const supabase = await createSupabaseServerClient();

    let leadIds = parsed.data.leadIds ?? [];
    let totaltIFiltret = 0;
    if (leadIds.length === 0) {
      const params = parseListParams(parsed.data.filter ?? {});
      const settings = await getSyncFilter(supabase);
      const { data, error } = await supabase.rpc(
        "list_leads",
        rpcArgs(params, tableYearWindow(settings), MAX_ITEMS, 0),
      );
      if (error) return { ok: false, message: `Kunde inte hämta bolagen: ${error.message}` };
      const rows = (data ?? []) as LeadListRow[];
      leadIds = rows.filter((row) => !row.avregistrerad).map((row) => row.lead_id);
      totaltIFiltret = rows[0]?.total_count ? Number(rows[0].total_count) : rows.length;
    }
    if (leadIds.length === 0) {
      return { ok: false, message: "Inga bolag att lägga i listan." };
    }

    const { data: list, error: listError } = await supabase
      .from("call_lists")
      .insert({ namn, created_by: session.userId })
      .select("id")
      .single();
    if (listError || !list) {
      return {
        ok: false,
        message: `Kunde inte skapa listan: ${listError?.message ?? "okänt fel"}`,
      };
    }

    const items = leadIds.map((leadId, index) => ({
      list_id: list.id,
      lead_id: leadId,
      position: index,
    }));
    const { error: itemsError } = await supabase.from("call_list_items").insert(items);
    if (itemsError) {
      // Lämna ingen tom lista efter ett halvlyckat skapande.
      await supabase.from("call_lists").delete().eq("id", list.id);
      return { ok: false, message: `Kunde inte fylla listan: ${itemsError.message}` };
    }

    await logActivity({
      actorId: session.userId,
      entityType: "ringlista",
      entityId: list.id,
      action: "ringlista_skapad",
      payload: { lista: namn, antal: leadIds.length },
    });
    revalidatePath("/ringlistor");
    return {
      ok: true,
      listId: list.id,
      message:
        totaltIFiltret > MAX_ITEMS
          ? `Ringlistan "${namn}" skapad med de första ${leadIds.length} av ${totaltIFiltret} bolagen (max ${MAX_ITEMS})`
          : `Ringlistan "${namn}" skapad med ${leadIds.length} bolag`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

const toggleSchema = z.object({
  listId: z.uuid(),
  leadId: z.uuid(),
  /** true = ringd/avbockad, false = återställ. */
  ringd: z.boolean(),
});

export async function toggleCalledAction(
  input: z.infer<typeof toggleSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = toggleSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Ogiltig förfrågan." };
    const { listId, leadId, ringd } = parsed.data;

    const supabase = await createSupabaseServerClient();
    const { data: item } = await supabase
      .from("call_list_items")
      .select("id, call_lists(namn), leads(orgnr, companies(namn))")
      .eq("list_id", listId)
      .eq("lead_id", leadId)
      .maybeSingle();
    if (!item) return { ok: false, message: "Raden hittades inte i listan." };

    const { error } = await supabase
      .from("call_list_items")
      .update({
        called_at: ringd ? new Date().toISOString() : null,
        called_by: ringd ? session.userId : null,
      })
      .eq("list_id", listId)
      .eq("lead_id", leadId);
    if (error) return { ok: false, message: `Kunde inte uppdatera: ${error.message}` };

    const lista = pickNamn(item.call_lists) ?? "";
    const lead = Array.isArray(item.leads) ? item.leads[0] : item.leads;
    const orgnr = lead?.orgnr ?? leadId;
    const bolagsnamn = pickNamn(lead?.companies ?? null) ?? orgnr;

    // Avbockningen syns i bolagets tidslinje; återställning loggas inte
    // (samma mönster som uppföljningar).
    if (ringd) {
      await logActivity({
        actorId: session.userId,
        entityType: "lead",
        entityId: orgnr,
        action: "ringlista_ringd",
        payload: { orgnr, namn: bolagsnamn, lista },
      });
    }
    revalidatePath("/ringlistor");
    revalidatePath(`/ringlistor/${listId}`);
    return { ok: true, message: ringd ? `${bolagsnamn} avbockad` : `${bolagsnamn} återställd` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

const removeSchema = z.object({
  listId: z.uuid(),
  leadId: z.uuid(),
});

export async function removeFromCallListAction(
  input: z.infer<typeof removeSchema>,
): Promise<ActionResult> {
  try {
    await requireUser();
    const parsed = removeSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Ogiltig förfrågan." };
    const { listId, leadId } = parsed.data;

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("call_list_items")
      .delete()
      .eq("list_id", listId)
      .eq("lead_id", leadId);
    if (error) return { ok: false, message: `Kunde inte ta bort: ${error.message}` };

    revalidatePath("/ringlistor");
    revalidatePath(`/ringlistor/${listId}`);
    return { ok: true, message: "Borttagen ur listan" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

const deleteSchema = z.object({ listId: z.uuid() });

export async function deleteCallListAction(
  input: z.infer<typeof deleteSchema>,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = deleteSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Ogiltig förfrågan." };
    const { listId } = parsed.data;

    const supabase = await createSupabaseServerClient();
    const { data: list } = await supabase
      .from("call_lists")
      .select("id, namn, created_by")
      .eq("id", listId)
      .maybeSingle();
    if (!list) return { ok: false, message: "Listan hittades inte." };
    // RLS stoppar också, men ge ett begripligt svar i stället för 0 rader.
    if (list.created_by !== session.userId && session.roll !== "admin") {
      return {
        ok: false,
        message: "Endast den som skapade listan eller en admin kan ta bort den.",
      };
    }

    const { error } = await supabase.from("call_lists").delete().eq("id", listId);
    if (error) return { ok: false, message: `Kunde inte ta bort: ${error.message}` };

    await logActivity({
      actorId: session.userId,
      entityType: "ringlista",
      entityId: listId,
      action: "ringlista_borttagen",
      payload: { lista: list.namn },
    });
    revalidatePath("/ringlistor");
    return { ok: true, message: `Ringlistan "${list.namn}" borttagen` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Något gick fel." };
  }
}

/** Supabase returnerar relationer som objekt eller array beroende på join. */
function pickNamn(value: { namn: string } | { namn: string }[] | null): string | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0]?.namn ?? null) : value.namn;
}
