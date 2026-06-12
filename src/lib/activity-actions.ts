/**
 * Alla handlingstyper i audit-loggen. Egen modul utan beroenden så att
 * även klientkomponenter (filtermenyer) kan importera listan utan att dra
 * in service role-klienten.
 */
export const ACTIVITY_ACTIONS = [
  "lead_skapad",
  "status_andrad",
  "tilldelad",
  "massutdelning",
  "uppfoljning_satt",
  "uppfoljning_klar",
  "anteckning",
  "kontakt_tillagd",
  "kontakt_andrad",
  "kontakt_borttagen",
  "affarsvarde_satt",
  "ringlista_skapad",
  "ringlista_ringd",
  "ringlista_borttagen",
  "synk",
  "google_berikning",
  "csv_import",
  "export",
  "anvandare_skapad",
  "anvandare_inaktiverad",
  "anvandare_aktiverad",
  "roll_andrad",
  "losenord_bytt",
  "losenord_aterstallt",
  "profilbild_andrad",
  "installningar_andrade",
  "kund_overlamnad",
  "kund_skapad",
  "kund_status",
  "kund_controller",
  "kund_intakt",
  "kund_intakt_andrad",
  "kund_intakt_borttagen",
  "kund_kontakt_andrad",
  "kund_kommentar",
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];
