import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Global audit log. VARJE mutation (statusbyte, tilldelning, anteckning,
 * synk, CSV-import, export, användar- och inställningsändring) skriver en
 * rad här. Skrivs endast server-side via service role – det finns ingen
 * insert-policy för vanliga användare.
 */

export type ActivityEntityType =
  | "lead"
  | "kund"
  | "anvandare"
  | "installningar"
  | "synk";

export type ActivityAction =
  | "lead_skapad"
  | "status_andrad"
  | "tilldelad"
  | "massutdelning"
  | "uppfoljning_satt"
  | "uppfoljning_klar"
  | "anteckning"
  | "synk"
  | "google_berikning"
  | "csv_import"
  | "export"
  | "anvandare_skapad"
  | "anvandare_inaktiverad"
  | "anvandare_aktiverad"
  | "roll_andrad"
  | "losenord_bytt"
  | "losenord_aterstallt"
  | "profilbild_andrad"
  | "installningar_andrade"
  | "kund_overlamnad"
  | "kund_skapad"
  | "kund_status"
  | "kund_controller"
  | "kund_intakt"
  | "kund_intakt_andrad"
  | "kund_intakt_borttagen"
  | "kund_kontakt_andrad"
  | "kund_kommentar";

export interface ActivityInput {
  actorId: string | null;
  entityType: ActivityEntityType;
  entityId: string;
  action: ActivityAction;
  payload?: Record<string, unknown>;
}

export async function logActivity(input: ActivityInput): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("activities").insert({
    actor_id: input.actorId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    payload: input.payload ?? {},
  });
  if (error) {
    // Loggning får aldrig fälla själva mutationen – men gör felet synligt.
    console.error("Kunde inte skriva audit log:", error.message);
  }
}

export interface ActivityRow {
  id: number;
  actor_id: string | null;
  actor_namn: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
}

interface FetchActivitiesOptions {
  entityType?: ActivityEntityType;
  entityId?: string;
  actorId?: string;
  /** YYYY-MM-DD – begränsar till den dagen (svensk tid ungefärligt: UTC-dygn). */
  date?: string;
  limit?: number;
}

/**
 * Hämtar aktiviteter via service role. Anropas endast från server-kod som
 * själv avgör vad användaren får se (bolagstidslinje för alla inloggade,
 * hela loggen endast för admin).
 */
export async function fetchActivities(
  options: FetchActivitiesOptions,
): Promise<ActivityRow[]> {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from("activities")
    .select("id, actor_id, entity_type, entity_id, action, payload, created_at, profiles(namn)")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);

  if (options.entityType) query = query.eq("entity_type", options.entityType);
  if (options.entityId) query = query.eq("entity_id", options.entityId);
  if (options.actorId) query = query.eq("actor_id", options.actorId);
  if (options.date) {
    query = query
      .gte("created_at", `${options.date}T00:00:00+02:00`)
      .lt("created_at", `${options.date}T23:59:59.999+02:00`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Kunde inte läsa audit log:", error.message);
    return [];
  }
  return (data ?? []).map((row) => {
    const profiles = row.profiles as { namn: string } | { namn: string }[] | null;
    const actorNamn = Array.isArray(profiles) ? profiles[0]?.namn : profiles?.namn;
    return {
      id: row.id,
      actor_id: row.actor_id,
      actor_namn: actorNamn ?? null,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      action: row.action,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      created_at: row.created_at,
    };
  });
}
