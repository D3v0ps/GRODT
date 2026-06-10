import { statusLabel } from "@/lib/constants";

/**
 * Renderar audit log-rader som svenska meningar. Ren funktion – används
 * både i dashboardens flöde, bolagets tidslinje och admin-loggen.
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

/** Kort handlingsetikett till "Handling"-kolumnen i admin-loggen. */
export function actionLabel(action: string): string {
  switch (action) {
    case "status_andrad":
      return "Statusbyte";
    case "tilldelad":
      return "Tilldelning";
    case "anteckning":
      return "Anteckning";
    case "synk":
      return "Synk";
    case "csv_import":
      return "CSV-import";
    case "export":
      return "Export";
    case "anvandare_skapad":
    case "anvandare_inaktiverad":
    case "anvandare_aktiverad":
    case "roll_andrad":
      return "Användare";
    case "installningar_andrade":
      return "Inställningar";
    default:
      return action;
  }
}

/** Detaljtext, t.ex. "Talangpartner Sverige AB: Dialog → Möte". */
export function activityDetail(action: string, payload: Payload): string {
  const namn = str(payload, "namn");
  switch (action) {
    case "status_andrad":
      return `${namn}: ${statusLabel(str(payload, "fran"))} → ${statusLabel(str(payload, "till"))}`;
    case "tilldelad": {
      const owner = str(payload, "ansvarig");
      return owner ? `${namn} → ${owner}` : `${namn}: tilldelning borttagen`;
    }
    case "anteckning":
      return `${namn}: ny anteckning`;
    case "synk":
      return `${str(payload, "trigger") === "cron" ? "Automatisk" : "Manuell"} synk (${str(payload, "source")}) – ${num(payload, "nya")} nya, ${num(payload, "uppdaterade")} uppdaterade${num(payload, "fel") > 0 ? `, ${num(payload, "fel")} fel` : ""}`;
    case "csv_import":
      return `${str(payload, "fil")} – ${num(payload, "nya")} nya, ${num(payload, "uppdaterade")} uppdaterade, ${num(payload, "leads")} leads`;
    case "export":
      return `CSV-export, ${num(payload, "rader")} rader`;
    case "anvandare_skapad":
      return `Skapade konto för ${namn} (${str(payload, "roll") === "admin" ? "Admin" : "Användare"})`;
    case "anvandare_inaktiverad":
      return `Inaktiverade ${namn}`;
    case "anvandare_aktiverad":
      return `Återaktiverade ${namn}`;
    case "roll_andrad":
      return `${namn} → ${str(payload, "roll") === "admin" ? "Admin" : "Användare"}`;
    case "installningar_andrade":
      return str(payload, "beskrivning") || "Uppdaterade filterparametrarna";
    default:
      return JSON.stringify(payload);
  }
}

/** Flödesmening till dashboarden, utan aktörsnamn ("flyttade X till Möte"). */
export function activityFeedText(action: string, payload: Payload): string {
  const namn = str(payload, "namn");
  switch (action) {
    case "status_andrad":
      return `flyttade ${namn} till ${statusLabel(str(payload, "till"))}`;
    case "tilldelad": {
      const owner = str(payload, "ansvarig");
      return owner ? `tilldelade ${namn} till ${owner}` : `tog bort tilldelningen på ${namn}`;
    }
    case "anteckning":
      return `antecknade på ${namn}`;
    case "synk":
      return `körde synk – ${num(payload, "nya")} nya bolag hämtades`;
    case "csv_import":
      return `importerade ${str(payload, "fil")} – ${num(payload, "nya")} nya bolag`;
    case "export":
      return `exporterade bolagslistan till CSV (${num(payload, "rader")} rader)`;
    case "anvandare_skapad":
      return `skapade konto för ${namn}`;
    case "anvandare_inaktiverad":
      return `inaktiverade ${namn}`;
    case "anvandare_aktiverad":
      return `återaktiverade ${namn}`;
    case "roll_andrad":
      return `ändrade rollen för ${namn}`;
    case "installningar_andrade":
      return "uppdaterade inställningarna";
    default:
      return action;
  }
}

/** Tidslinjetext på bolagsdetaljen ("Status ändrad till Dialog"). */
export function activityTimelineText(action: string, payload: Payload): string {
  switch (action) {
    case "status_andrad":
      return `Status ändrad till ${statusLabel(str(payload, "till"))}`;
    case "tilldelad": {
      const owner = str(payload, "ansvarig");
      return owner ? `Tilldelad ${owner}` : "Tilldelning borttagen";
    }
    case "anteckning":
      return "Anteckning tillagd";
    case "synk":
      return str(payload, "ny_lead") === "ja" ? "Hämtad via synk (ny)" : "Uppdaterad via synk";
    case "csv_import":
      return str(payload, "ny_lead") === "ja" ? "Importerad via CSV (ny)" : "Uppdaterad via CSV-import";
    default:
      return activityDetail(action, payload);
  }
}
