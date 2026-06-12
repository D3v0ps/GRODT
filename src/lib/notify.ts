import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Notiser i två kanaler:
 *  - Teamets chatt-webhook (Slack/Teams/Discord) för lagviktiga händelser
 *    – vunna affärer, överlämningar, utdelningar. Konfigureras av admin
 *    under Inställningar och skickas från logActivity.
 *  - Personliga notiser i appen ("du fick ett lead") – rader i
 *    notifications-tabellen som klockan i sidomenyn visar.
 * Ingen av kanalerna får någonsin fälla själva mutationen.
 */

type Payload = Record<string, unknown>;

function str(payload: Payload, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

function num(payload: Payload, key: string): number {
  const value = payload[key];
  return typeof value === "number" ? value : 0;
}

/**
 * Chattmeddelande för en loggad händelse, eller null när händelsen inte
 * hör hemma i teamkanalen. Ren funktion – avsiktligt snäv lista så att
 * kanalen inte blir brus.
 */
export function webhookText(
  action: string,
  payload: Payload,
  actorNamn: string,
): string | null {
  const namn = str(payload, "namn");
  switch (action) {
    case "status_andrad":
      return str(payload, "till") === "kund"
        ? `🎉 ${actorNamn} vann affären ${namn}!`
        : null;
    case "kund_overlamnad": {
      const controller = str(payload, "controller");
      return controller
        ? `${actorNamn} lämnade över ${namn} till ${controller}`
        : `${actorNamn} lämnade över ${namn} till controllers`;
    }
    case "tilldelad": {
      const ansvarig = str(payload, "ansvarig");
      return ansvarig ? `${actorNamn} tilldelade ${namn} till ${ansvarig}` : null;
    }
    case "massutdelning": {
      const ansvarig = str(payload, "ansvarig");
      return ansvarig
        ? `${actorNamn} delade ut ${num(payload, "antal")} leads till ${ansvarig}`
        : null;
    }
    case "uppfoljning_satt": {
      // Bara när påminnelsen läggs på någon annan – egna att göra-rader
      // är inte lagnyheter.
      const ansvarig = str(payload, "ansvarig");
      return ansvarig
        ? `${actorNamn} satte uppföljning ${str(payload, "datum")} på ${namn} → ${ansvarig}`
        : null;
    }
    case "ringlista_skapad":
      return `${actorNamn} skapade ringlistan "${str(payload, "lista")}" (${num(payload, "antal")} bolag)`;
    default:
      return null;
  }
}

const webhookSettingSchema = z.object({
  url: z.url(),
  enabled: z.boolean(),
});

export interface WebhookSetting {
  url: string;
  enabled: boolean;
}

/** Webhook-inställningen ur app_settings (admin-skriven). */
export async function getNotifyWebhook(): Promise<WebhookSetting | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "notify_webhook")
    .maybeSingle();
  const parsed = webhookSettingSchema.safeParse(data?.value);
  return parsed.success ? parsed.data : null;
}

/**
 * Skickar ett meddelande till teamkanalen. Discord vill ha {content},
 * Slack och Teams accepterar {text}. Kort timeout – ett trögt chattverktyg
 * får inte bromsa appen.
 */
export async function sendTeamWebhook(text: string): Promise<void> {
  try {
    const setting = await getNotifyWebhook();
    if (!setting?.enabled || !setting.url) return;
    const body = setting.url.includes("discord.com")
      ? { content: text }
      : { text };
    await fetch(setting.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
  } catch (e) {
    console.error("Webhook-notisen kunde inte skickas:", e instanceof Error ? e.message : e);
  }
}

/** Personlig notis till en användare – visas i klockan i sidomenyn. */
export async function notifyUser(
  userId: string,
  text: string,
  href?: string,
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("notifications").insert({
      user_id: userId,
      text,
      href: href ?? null,
    });
    if (error) console.error("Notisen kunde inte sparas:", error.message);
  } catch (e) {
    console.error("Notisen kunde inte sparas:", e instanceof Error ? e.message : e);
  }
}
