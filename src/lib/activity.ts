import type { ActivityAction } from "./activity-actions";
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

export { ACTIVITY_ACTIONS, type ActivityAction } from "./activity-actions";

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
  /** Användar-id, eller "system" för automatiska händelser (actor null). */
  actorId?: string;
  /** Begränsa till en handlingstyp. */
  action?: ActivityAction;
  /** YYYY-MM-DD – begränsar till det svenska dygnet (CET/CEST). */
  date?: string;
  limit?: number;
  offset?: number;
}

/** UTC-offset (±HH:MM) för svensk tid det aktuella dygnet – hanterar sommartid. */
function stockholmOffset(date: string): string {
  const probe = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(probe.getTime())) return "+01:00";
  const part = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    timeZoneName: "longOffset",
  })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value;
  const match = part?.match(/GMT([+-]\d{2}:\d{2})/);
  return match ? match[1] : "+01:00";
}

/** Nästa kalenderdag som YYYY-MM-DD. */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
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
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  let query = admin
    .from("activities")
    .select("id, actor_id, entity_type, entity_id, action, payload, created_at, profiles(namn)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options.entityType) query = query.eq("entity_type", options.entityType);
  if (options.entityId) query = query.eq("entity_id", options.entityId);
  if (options.actorId === "system") query = query.is("actor_id", null);
  else if (options.actorId) query = query.eq("actor_id", options.actorId);
  if (options.action) query = query.eq("action", options.action);
  if (options.date) {
    const offsetSuffix = stockholmOffset(options.date);
    query = query
      .gte("created_at", `${options.date}T00:00:00${offsetSuffix}`)
      .lt("created_at", `${nextDay(options.date)}T00:00:00${offsetSuffix}`);
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
