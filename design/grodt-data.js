/* GRODT – statisk exempeldata (fiktiva bolag, SNI 78.100) */

const ANVANDARE = [
  { id: "AL", namn: "Anna Lindqvist", roll: "Admin", cls: "" },
  { id: "JB", namn: "Johan Berg", roll: "Användare", cls: "a2" },
  { id: "SN", namn: "Sara Nyström", roll: "Användare", cls: "a3" },
  { id: "ED", namn: "Erik Dahl", roll: "Användare", cls: "a4" },
];

const STATUSAR = [
  { key: "ny", label: "Ny" },
  { key: "kontaktad", label: "Kontaktad" },
  { key: "dialog", label: "Dialog" },
  { key: "mote", label: "Möte" },
  { key: "kund", label: "Kund" },
  { key: "forlorad", label: "Förlorad" },
];

/* oms1 = räkenskapsår 2023, oms2 = 2024 (kr). Tröskel: ≥ 5 000 000 för minst ett år. */
const BOLAG = [
  { id: 1, namn: "Nordisk Bemanning AB", orgnr: "556712-4830", ort: "Stockholm", oms1: 18400000, oms2: 21250000, anst: 42, status: "dialog", ansvarig: "AL", trend: [14100000, 16300000, 18400000, 21250000], dagar: 4 },
  { id: 2, namn: "Talangpartner Sverige AB", orgnr: "556903-1177", ort: "Göteborg", oms1: 9650000, oms2: 11020000, anst: 23, status: "mote", ansvarig: "JB", trend: [7200000, 8400000, 9650000, 11020000], dagar: 2 },
  { id: 3, namn: "Rekryteringsgruppen i Malmö AB", orgnr: "556488-2901", ort: "Malmö", oms1: 6230000, oms2: 5870000, anst: 14, status: "kontaktad", ansvarig: "SN", trend: [6900000, 6500000, 6230000, 5870000], dagar: 9 },
  { id: 4, namn: "Kompetensbron Norden AB", orgnr: "559034-6612", ort: "Uppsala", oms1: 3240000, oms2: 8110000, anst: 19, status: "ny", ansvarig: null, trend: [1800000, 2600000, 3240000, 8110000], dagar: 1 },
  { id: 5, namn: "Stafetten Vårdbemanning AB", orgnr: "556830-0945", ort: "Linköping", oms1: 27800000, oms2: 31400000, anst: 88, status: "kund", ansvarig: "AL", trend: [21000000, 24500000, 27800000, 31400000], dagar: 31 },
  { id: 6, namn: "Mälardalens Rekrytering AB", orgnr: "556651-7388", ort: "Västerås", oms1: 5480000, oms2: 6090000, anst: 11, status: "ny", ansvarig: null, trend: [4400000, 4900000, 5480000, 6090000], dagar: 1 },
  { id: 7, namn: "Headfirst Executive AB", orgnr: "559187-2204", ort: "Stockholm", oms1: 12900000, oms2: 14750000, anst: 16, status: "dialog", ansvarig: "ED", trend: [9800000, 11200000, 12900000, 14750000], dagar: 6 },
  { id: 8, namn: "Bemannia Syd AB", orgnr: "556574-9012", ort: "Lund", oms1: 8320000, oms2: 7940000, anst: 27, status: "kontaktad", ansvarig: "JB", trend: [8800000, 8600000, 8320000, 7940000], dagar: 12 },
  { id: 9, namn: "Proffspoolen Skandinavien AB", orgnr: "556922-3456", ort: "Örebro", oms1: 15600000, oms2: 17880000, anst: 51, status: "forlorad", ansvarig: "SN", trend: [13000000, 14200000, 15600000, 17880000], dagar: 44 },
  { id: 10, namn: "Industrikraft Bemanning AB", orgnr: "556799-8821", ort: "Jönköping", oms1: 22150000, oms2: 19980000, anst: 64, status: "mote", ansvarig: "AL", trend: [18400000, 20900000, 22150000, 19980000], dagar: 3 },
  { id: 11, namn: "Vinna Rekrytering AB", orgnr: "559245-0098", ort: "Helsingborg", oms1: 4120000, oms2: 5340000, anst: 9, status: "ny", ansvarig: null, trend: [2900000, 3500000, 4120000, 5340000], dagar: 1 },
  { id: 12, namn: "Akademikerpoolen Sverige AB", orgnr: "556610-4477", ort: "Umeå", oms1: 7780000, oms2: 8430000, anst: 21, status: "dialog", ansvarig: "JB", trend: [6100000, 7000000, 7780000, 8430000], dagar: 8 },
  { id: 13, namn: "Logistikbemanning Väst AB", orgnr: "556843-2210", ort: "Borås", oms1: 11340000, oms2: 12010000, anst: 38, status: "kontaktad", ansvarig: "ED", trend: [9700000, 10500000, 11340000, 12010000], dagar: 15 },
  { id: 14, namn: "Nyckelpersoner i Norr AB", orgnr: "559076-5543", ort: "Luleå", oms1: 6890000, oms2: 7220000, anst: 17, status: "ny", ansvarig: null, trend: [5400000, 6100000, 6890000, 7220000], dagar: 2 },
  { id: 15, namn: "Selektiv Searchgruppen AB", orgnr: "556734-9087", ort: "Stockholm", oms1: 9210000, oms2: 10650000, anst: 13, status: "kund", ansvarig: "SN", trend: [7600000, 8300000, 9210000, 10650000], dagar: 60 },
  { id: 16, namn: "Teknikkompetens Öst AB", orgnr: "556967-1123", ort: "Norrköping", oms1: 13470000, oms2: 15090000, anst: 45, status: "dialog", ansvarig: "AL", trend: [10900000, 12100000, 13470000, 15090000], dagar: 5 },
  { id: 17, namn: "Omsorgspersonal Direkt AB", orgnr: "559118-7765", ort: "Gävle", oms1: 5910000, oms2: 6480000, anst: 24, status: "kontaktad", ansvarig: "JB", trend: [4800000, 5300000, 5910000, 6480000], dagar: 18 },
  { id: 18, namn: "Byggbemanning Mitt AB", orgnr: "556688-3349", ort: "Sundsvall", oms1: 16720000, oms2: 14380000, anst: 57, status: "forlorad", ansvarig: "ED", trend: [15100000, 17800000, 16720000, 14380000], dagar: 52 },
];

const TROSKEL = 5000000;
const AR1 = "2023";
const AR2 = "2024";
const TOTALT_ANTAL = 1247; /* totalt i databasen (mockup visar urval) */

const AKTIVITETER = [
  { vem: "JB", txt: "flyttade <strong>Talangpartner Sverige AB</strong> till Möte", when: "2026-06-10 09:41" },
  { vem: "AL", txt: "körde synk – <strong>38 nya bolag</strong> hämtades", when: "2026-06-10 08:15" },
  { vem: "SN", txt: "antecknade på <strong>Rekryteringsgruppen i Malmö AB</strong>", when: "2026-06-09 16:22" },
  { vem: "ED", txt: "tilldelades <strong>Headfirst Executive AB</strong>", when: "2026-06-09 14:05" },
  { vem: "AL", txt: "markerade <strong>Stafetten Vårdbemanning AB</strong> som Kund", when: "2026-06-09 11:30" },
  { vem: "JB", txt: "exporterade bolagslistan till CSV (1 247 rader)", when: "2026-06-08 15:48" },
];

const SYNK_HISTORIK = [
  { when: "2026-06-10 08:15", vem: "Anna Lindqvist", hamtade: 1247, nya: 38, uppdaterade: 112, fel: 0, status: "ok" },
  { when: "2026-06-03 08:02", vem: "Anna Lindqvist", hamtade: 1209, nya: 21, uppdaterade: 87, fel: 0, status: "ok" },
  { when: "2026-05-27 08:11", vem: "Johan Berg", hamtade: 1188, nya: 14, uppdaterade: 64, fel: 3, status: "fel", felmsg: "3 bolag kunde inte hämtas – tidsgräns mot API:t (försök igen)" },
  { when: "2026-05-20 08:05", vem: "Anna Lindqvist", hamtade: 1174, nya: 29, uppdaterade: 91, fel: 0, status: "ok" },
  { when: "2026-05-13 08:09", vem: "Sara Nyström", hamtade: 1145, nya: 17, uppdaterade: 73, fel: 0, status: "ok" },
];

const AUDIT_LOG = [
  { when: "2026-06-10 09:41", vem: "Johan Berg", handling: "Statusbyte", detalj: "Talangpartner Sverige AB: Dialog → Möte" },
  { when: "2026-06-10 08:15", vem: "Anna Lindqvist", handling: "Synk", detalj: "Manuell synk – 38 nya, 112 uppdaterade" },
  { when: "2026-06-09 16:22", vem: "Sara Nyström", handling: "Anteckning", detalj: "Rekryteringsgruppen i Malmö AB: ny anteckning" },
  { when: "2026-06-09 14:05", vem: "Anna Lindqvist", handling: "Tilldelning", detalj: "Headfirst Executive AB → Erik Dahl" },
  { when: "2026-06-09 11:30", vem: "Anna Lindqvist", handling: "Statusbyte", detalj: "Stafetten Vårdbemanning AB: Möte → Kund" },
  { when: "2026-06-08 15:48", vem: "Johan Berg", handling: "Export", detalj: "CSV-export, 1 247 rader" },
  { when: "2026-06-08 10:12", vem: "Anna Lindqvist", handling: "Användare", detalj: "Skapade konto för Erik Dahl (Användare)" },
  { when: "2026-06-05 09:33", vem: "Sara Nyström", handling: "Statusbyte", detalj: "Proffspoolen Skandinavien AB: Dialog → Förlorad" },
];

const HISTORIK_DEMO = [
  { txt: "Status ändrad till Dialog", meta: "2026-06-06 10:14 · Anna Lindqvist" },
  { txt: "Status ändrad till Kontaktad", meta: "2026-05-28 13:40 · Anna Lindqvist" },
  { txt: "Tilldelad Anna Lindqvist", meta: "2026-05-27 09:02 · Johan Berg" },
  { txt: "Hämtad via synk (ny)", meta: "2026-05-20 08:05 · Systemet" },
];

/* Hjälpfunktioner */
function fmtKr(n) {
  return n.toLocaleString("sv-SE") + " kr";
}
function fmtMkr(n) {
  return (n / 1000000).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " mkr";
}
function userById(id) {
  return ANVANDARE.find((u) => u.id === id) || null;
}
function statusLabel(key) {
  const s = STATUSAR.find((s) => s.key === key);
  return s ? s.label : key;
}
function badgeHtml(key) {
  return '<span class="badge st-' + key + '"><span class="dot"></span>' + statusLabel(key) + "</span>";
}
function avatarHtml(id, extra) {
  const u = userById(id);
  if (!u) return '<span class="faint small">–</span>';
  return '<span class="avatar ' + u.cls + '" title="' + u.namn + '">' + u.id + "</span>" + (extra ? '<span>' + u.namn + "</span>" : "");
}

window.GRODT_DATA = { ANVANDARE, STATUSAR, BOLAG, TROSKEL, AR1, AR2, TOTALT_ANTAL, AKTIVITETER, SYNK_HISTORIK, AUDIT_LOG, HISTORIK_DEMO, fmtKr, fmtMkr, userById, statusLabel, badgeHtml, avatarHtml };
