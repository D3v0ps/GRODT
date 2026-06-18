import { kundStatusLabel, rollLabel, statusLabel } from "@/lib/constants";
import { fmtKr } from "@/lib/format";

/**
 * Renderar audit log-rader som svenska meningar. Ren funktion – används
 * både i dashboardens flöde, bolagets/kundens tidslinje och admin-loggen.
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
    case "lead_skapad":
      return "Nytt lead";
    case "status_andrad":
      return "Statusbyte";
    case "tilldelad":
    case "massutdelning":
      return "Tilldelning";
    case "utanfor_malbild":
    case "ater_malbild":
      return "Målbild";
    case "uppfoljning_satt":
    case "uppfoljning_klar":
      return "Uppföljning";
    case "anteckning":
      return "Anteckning";
    case "kontakt_tillagd":
    case "kontakt_andrad":
    case "kontakt_borttagen":
      return "Kontaktperson";
    case "affarsvarde_satt":
      return "Affärsvärde";
    case "ringlista_skapad":
    case "ringlista_ringd":
    case "ringlista_borttagen":
      return "Ringlista";
    case "synk":
      return "Synk";
    case "google_berikning":
      return "Google-berikning";
    case "csv_import":
      return "CSV-import";
    case "export":
      return "Export";
    case "anvandare_skapad":
    case "anvandare_inaktiverad":
    case "anvandare_aktiverad":
    case "roll_andrad":
    case "losenord_bytt":
    case "losenord_aterstallt":
    case "profilbild_andrad":
      return "Användare";
    case "installningar_andrade":
      return "Inställningar";
    case "kund_overlamnad":
    case "kund_skapad":
    case "kund_status":
    case "kund_controller":
    case "kund_intakt":
    case "kund_intakt_andrad":
    case "kund_intakt_borttagen":
    case "kund_kontakt_andrad":
    case "kund_kommentar":
      return "Kund";
    default:
      return action;
  }
}

/** Detaljtext, t.ex. "Talangpartner Sverige AB: Dialog → Möte". */
export function activityDetail(action: string, payload: Payload): string {
  const namn = str(payload, "namn");
  switch (action) {
    case "lead_skapad": {
      const kalla = str(payload, "kalla");
      if (kalla === "csv") return `${namn || str(payload, "orgnr")} nytt lead via CSV-importen`;
      if (kalla === "bolagsverket") return `${namn} tillagd med data från Bolagsverket`;
      if (kalla === "manuell" || kalla === "") return `${namn} tillagd manuellt`;
      return `${namn || str(payload, "orgnr")} nytt lead via synk (${kalla})`;
    }
    case "status_andrad": {
      const orsak = str(payload, "orsak");
      return `${namn}: ${statusLabel(str(payload, "fran"))} → ${statusLabel(str(payload, "till"))}${orsak ? ` (${orsak})` : ""}`;
    }
    case "tilldelad": {
      const owner = str(payload, "ansvarig");
      return owner ? `${namn} → ${owner}` : `${namn}: tilldelning borttagen`;
    }
    case "massutdelning":
      return `${num(payload, "antal")} leads → ${str(payload, "ansvarig") || "tilldelning borttagen"}`;
    case "utanfor_malbild":
      return `${namn} flyttad ut ur målbilden${str(payload, "sni") ? ` (SNI ${str(payload, "sni")})` : ""}`;
    case "ater_malbild":
      return `${namn} återställd till målbilden`;
    case "uppfoljning_satt":
      return `${namn}: uppföljning ${str(payload, "datum")}${str(payload, "anteckning") ? ` (${str(payload, "anteckning")})` : ""}`;
    case "uppfoljning_klar":
      return `${namn}: uppföljning avklarad`;
    case "anteckning":
      return `${namn}: ny anteckning`;
    case "kontakt_tillagd":
      return `${namn}: kontaktperson ${str(payload, "kontakt")} tillagd`;
    case "kontakt_andrad":
      return `${namn}: kontaktperson ${str(payload, "kontakt")} uppdaterad`;
    case "kontakt_borttagen":
      return `${namn}: kontaktperson ${str(payload, "kontakt")} borttagen`;
    case "affarsvarde_satt": {
      const belopp = num(payload, "belopp");
      return belopp > 0
        ? `${namn}: affärsvärde ${fmtKr(belopp)}`
        : `${namn}: affärsvärde borttaget`;
    }
    case "ringlista_skapad":
      return `Skapade ringlistan "${str(payload, "lista")}" med ${num(payload, "antal")} bolag`;
    case "ringlista_ringd":
      return `${namn}: avbockad i ringlistan "${str(payload, "lista")}"`;
    case "ringlista_borttagen":
      return `Tog bort ringlistan "${str(payload, "lista")}"`;
    case "synk":
      return `${str(payload, "trigger") === "cron" ? "Automatisk" : "Manuell"} synk (${str(payload, "source")}) – ${num(payload, "nya")} nya, ${num(payload, "uppdaterade")} uppdaterade${num(payload, "fel") > 0 ? `, ${num(payload, "fel")} fel` : ""}`;
    case "google_berikning": {
      const antal = num(payload, "antal");
      if (antal > 0) {
        return `Google Places-svep – ${num(payload, "telefon")} telefonnummer, ${num(payload, "hemsidor")} hemsidor av ${antal} bolag`;
      }
      return `${namn}: ${[str(payload, "telefon") && "telefon", str(payload, "hemsida") && "hemsida"].filter(Boolean).join(" + ") || "inget"} hämtat via Google (växel/publik profil)`;
    }
    case "csv_import": {
      const base = `${str(payload, "fil")} – ${num(payload, "nya")} nya, ${num(payload, "uppdaterade")} uppdaterade, ${num(payload, "leads")} leads`;
      return str(payload, "avbruten") === "ja" ? `${base} (avbruten)` : base;
    }
    case "export": {
      const typ = str(payload, "typ");
      return `CSV-export${typ ? ` (${typ})` : ""}, ${num(payload, "rader")} rader`;
    }
    case "anvandare_skapad":
      return `Skapade konto för ${namn} (${rollLabel(str(payload, "roll"))})`;
    case "anvandare_inaktiverad":
      return `Inaktiverade ${namn}`;
    case "anvandare_aktiverad":
      return `Återaktiverade ${namn}`;
    case "roll_andrad":
      return `${namn} → ${rollLabel(str(payload, "roll"))}`;
    case "losenord_bytt":
      return "Bytte sitt lösenord";
    case "losenord_aterstallt":
      return `Återställde lösenordet för ${namn}`;
    case "profilbild_andrad":
      return str(payload, "borttagen") === "ja" ? "Tog bort sin profilbild" : "Bytte profilbild";
    case "installningar_andrade":
      return str(payload, "beskrivning") || "Uppdaterade filterparametrarna";
    case "kund_overlamnad": {
      const controller = str(payload, "controller");
      return controller
        ? `${namn} överlämnad till ${controller}`
        : `${namn} överlämnad (ingen controller vald)`;
    }
    case "kund_skapad":
      return `${namn} tillagd manuellt som kund`;
    case "kund_status":
      return `${namn}: ${kundStatusLabel(str(payload, "fran"))} → ${kundStatusLabel(str(payload, "till"))}`;
    case "kund_controller": {
      const controller = str(payload, "controller");
      return controller ? `${namn} → ${controller}` : `${namn}: controller borttagen`;
    }
    case "kund_intakt":
      return `${namn}: +${fmtKr(num(payload, "belopp"))}${str(payload, "beskrivning") ? ` (${str(payload, "beskrivning")})` : ""}`;
    case "kund_intakt_andrad":
      return `${namn}: intäkt ändrad ${fmtKr(num(payload, "fran_belopp"))} → ${fmtKr(num(payload, "belopp"))}${str(payload, "beskrivning") ? ` (${str(payload, "beskrivning")})` : ""}`;
    case "kund_intakt_borttagen":
      return `${namn}: intäkt borttagen, ${fmtKr(num(payload, "belopp"))}${str(payload, "beskrivning") ? ` (${str(payload, "beskrivning")})` : ""}`;
    case "kund_kontakt_andrad":
      return `${namn}: kontaktuppgifter uppdaterade${str(payload, "kontaktperson") ? ` (${str(payload, "kontaktperson")})` : ""}`;
    case "kund_kommentar":
      return `${namn}: ny kommentar`;
    default:
      return JSON.stringify(payload);
  }
}

/** Flödesmening till dashboarden, utan aktörsnamn ("flyttade X till Möte"). */
export function activityFeedText(action: string, payload: Payload): string {
  const namn = str(payload, "namn");
  switch (action) {
    case "lead_skapad": {
      const kalla = str(payload, "kalla");
      if (kalla === "csv") return `importerade ${namn || str(payload, "orgnr")} som nytt lead`;
      return `lade till ${namn || str(payload, "orgnr")} som nytt lead`;
    }
    case "status_andrad":
      return `flyttade ${namn} till ${statusLabel(str(payload, "till"))}`;
    case "tilldelad": {
      const owner = str(payload, "ansvarig");
      return owner ? `tilldelade ${namn} till ${owner}` : `tog bort tilldelningen på ${namn}`;
    }
    case "massutdelning":
      return `delade ut ${num(payload, "antal")} leads till ${str(payload, "ansvarig") || "ingen"}`;
    case "utanfor_malbild":
      return `flyttade ut ${namn} ur målbilden`;
    case "ater_malbild":
      return `återställde ${namn} till målbilden`;
    case "uppfoljning_satt":
      return `satte uppföljning ${str(payload, "datum")} på ${namn}`;
    case "uppfoljning_klar":
      return `bockade av uppföljningen på ${namn}`;
    case "anteckning":
      return `antecknade på ${namn}`;
    case "kontakt_tillagd":
      return `lade till kontaktpersonen ${str(payload, "kontakt")} på ${namn}`;
    case "kontakt_andrad":
      return `uppdaterade kontaktpersonen ${str(payload, "kontakt")} på ${namn}`;
    case "kontakt_borttagen":
      return `tog bort kontaktpersonen ${str(payload, "kontakt")} på ${namn}`;
    case "affarsvarde_satt": {
      const belopp = num(payload, "belopp");
      return belopp > 0
        ? `satte affärsvärdet ${fmtKr(belopp)} på ${namn}`
        : `tog bort affärsvärdet på ${namn}`;
    }
    case "ringlista_skapad":
      return `skapade ringlistan "${str(payload, "lista")}" (${num(payload, "antal")} bolag)`;
    case "ringlista_ringd":
      return `bockade av ${namn} i ringlistan "${str(payload, "lista")}"`;
    case "ringlista_borttagen":
      return `tog bort ringlistan "${str(payload, "lista")}"`;
    case "synk":
      return `körde synk – ${num(payload, "nya")} nya bolag hämtades`;
    case "google_berikning":
      return num(payload, "antal") > 0
        ? `körde Google-svep – kontaktuppgifter till ${num(payload, "telefon")} bolag`
        : `hämtade kontaktuppgifter via Google till ${namn}`;
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
    case "losenord_bytt":
      return "bytte sitt lösenord";
    case "losenord_aterstallt":
      return `återställde lösenordet för ${namn}`;
    case "profilbild_andrad":
      return str(payload, "borttagen") === "ja" ? "tog bort sin profilbild" : "bytte profilbild";
    case "installningar_andrade":
      return "uppdaterade inställningarna";
    case "kund_overlamnad": {
      const controller = str(payload, "controller");
      return controller
        ? `lämnade över ${namn} till ${controller}`
        : `lämnade över ${namn}`;
    }
    case "kund_skapad":
      return `lade till ${namn} som kund`;
    case "kund_status":
      return `satte ${namn} som ${kundStatusLabel(str(payload, "till"))}`;
    case "kund_controller": {
      const controller = str(payload, "controller");
      return controller
        ? `gav ${namn} till ${controller}`
        : `tog bort controllern på ${namn}`;
    }
    case "kund_intakt":
      return `registrerade ${fmtKr(num(payload, "belopp"))} på ${namn}`;
    case "kund_intakt_andrad":
      return `ändrade en intäkt på ${namn} till ${fmtKr(num(payload, "belopp"))}`;
    case "kund_intakt_borttagen":
      return `tog bort en intäkt på ${fmtKr(num(payload, "belopp"))} från ${namn}`;
    case "kund_kontakt_andrad":
      return `uppdaterade kontaktuppgifterna på ${namn}`;
    case "kund_kommentar":
      return `kommenterade på ${namn}`;
    default:
      return action;
  }
}

/** Tidslinjetext på bolags-/kundkortet ("Status ändrad till Dialog"). */
export function activityTimelineText(action: string, payload: Payload): string {
  switch (action) {
    case "lead_skapad": {
      const kalla = str(payload, "kalla");
      if (kalla === "csv") return "Nytt lead via CSV-importen";
      if (kalla === "bolagsverket") return "Tillagd – berikad från Bolagsverket";
      if (kalla === "manuell" || kalla === "") return "Tillagd manuellt";
      return `Nytt lead via synk (${kalla})`;
    }
    case "status_andrad": {
      const orsak = str(payload, "orsak");
      return `Status ändrad till ${statusLabel(str(payload, "till"))}${orsak ? ` – ${orsak}` : ""}`;
    }
    case "tilldelad": {
      const owner = str(payload, "ansvarig");
      return owner ? `Tilldelad ${owner}` : "Tilldelning borttagen";
    }
    case "massutdelning":
      return `Tilldelad ${str(payload, "ansvarig")} (massutdelning)`;
    case "utanfor_malbild":
      return `Flyttad ut ur målbilden${str(payload, "sni") ? ` – SNI ${str(payload, "sni")}` : ""}`;
    case "ater_malbild":
      return "Återställd till målbilden";
    case "uppfoljning_satt":
      return `Uppföljning satt till ${str(payload, "datum")}${str(payload, "anteckning") ? ` – ${str(payload, "anteckning")}` : ""}`;
    case "uppfoljning_klar":
      return "Uppföljning avklarad";
    case "anteckning":
      return "Anteckning tillagd";
    case "kontakt_tillagd":
      return `Kontaktperson tillagd: ${str(payload, "kontakt")}`;
    case "kontakt_andrad":
      return `Kontaktperson uppdaterad: ${str(payload, "kontakt")}`;
    case "kontakt_borttagen":
      return `Kontaktperson borttagen: ${str(payload, "kontakt")}`;
    case "affarsvarde_satt": {
      const belopp = num(payload, "belopp");
      return belopp > 0
        ? `Affärsvärde satt till ${fmtKr(belopp)}`
        : "Affärsvärde borttaget";
    }
    case "ringlista_ringd":
      return `Avbockad i ringlistan "${str(payload, "lista")}"`;
    case "synk":
      return str(payload, "ny_lead") === "ja" ? "Hämtad via synk (ny)" : "Uppdaterad via synk";
    case "google_berikning":
      return `Kontaktuppgifter hämtade via Google${str(payload, "telefon") ? ` – ${str(payload, "telefon")} (växel/publik profil)` : ""}`;
    case "csv_import":
      return str(payload, "ny_lead") === "ja" ? "Importerad via CSV (ny)" : "Uppdaterad via CSV-import";
    case "kund_overlamnad": {
      const controller = str(payload, "controller");
      return controller ? `Överlämnad till ${controller}` : "Överlämnad till controllers";
    }
    case "kund_skapad":
      return "Tillagd manuellt som kund";
    case "kund_status":
      return `Kundstatus ändrad till ${kundStatusLabel(str(payload, "till"))}`;
    case "kund_controller": {
      const controller = str(payload, "controller");
      return controller ? `Controller: ${controller}` : "Controller borttagen";
    }
    case "kund_intakt":
      return `Intäkt registrerad: ${fmtKr(num(payload, "belopp"))}`;
    case "kund_intakt_andrad":
      return `Intäkt ändrad: ${fmtKr(num(payload, "fran_belopp"))} → ${fmtKr(num(payload, "belopp"))}`;
    case "kund_intakt_borttagen":
      return `Intäkt borttagen: ${fmtKr(num(payload, "belopp"))}`;
    case "kund_kontakt_andrad":
      return "Kontaktuppgifter uppdaterade";
    case "kund_kommentar":
      return "Kommentar tillagd";
    default:
      return activityDetail(action, payload);
  }
}
