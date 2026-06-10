# DESIGN_SPEC – GRODT

Handoff-dokument för implementationen. Mockupen (`GRODT.html` + `grodt.css` + `grodt-data.js` + `grodt-app.js`) är källan till sanning för utseende; detta dokument sammanfattar systemet.

**Produkt:** GRODT – internt leadverktyg för svenska bolag inom rekrytering/bemanning (SNI 78.100).
**Känsla:** Linear/Notion – datatätt men lugnt, snabbt, professionellt. Hela gränssnittet på svenska. Inga emojis.
**Signaturelement – Radarn:** ett svep-motiv som återkommer i logotyp, tomma tillstånd, synk-laddning och – viktigast – **tröskellinjen 5 MSEK** som visualiseras i omsättningsdiagram (streckad röd linje) och i tabellen (belopp under tröskeln dämpas; en röd punkt markerar det kvalificerande året när bara ett av åren når tröskeln).

---

## 1. Design tokens

### 1.1 Färg

| Token | Namn | Hex | Användning |
|---|---|---|---|
| `--ink` | Bläck | `#1E252B` | Primärtext, sidopanel, primärknappar |
| `--ink-2` | | `#46525C` | Sekundärtext |
| `--ink-3` | | `#75828C` | Tertiärtext, placeholders |
| `--ink-soft` | | `#2A333B` | Hover/aktiv yta i sidopanelen |
| `--line` | Linje | `#DDE4E9` | Kantlinjer |
| `--line-soft` | | `#EAEFF3` | Radavskiljare, svaga ytor |
| `--bg` | Dis | `#F8FAFC` | Appbakgrund |
| `--surface` | Yta | `#FFFFFF` | Kort, tabeller, fält |
| `--accent` | Signalröd | `#FF0C01` | ENDAST signaturmoment: aktiv nav-markör, radarblip, tröskellinje, kvalificeringspunkt. Aldrig brödtext på vitt (klarar ej AA). |
| `--accent-deep` | Djupröd | `#D40A01` | Textsäker röd: accentknappar, sorteringspil. Kontrast 5,5:1 på vitt. |
| `--blue` | Duvblå | `#6BA2B9` | Diagramstaplar, avatarer, dekor |
| `--blue-deep` | Fjordblå | `#33718C` | Länkar och blå text (AA-säker, 5,4:1) |
| `--blue-tint` | | `#EAF2F6` | Infoytor, parameterchips |
| `--error` | | `#C2230F` | Felmeddelanden, destruktiva handlingar |
| `--error-bg` | | `#FCEDEA` | Felbakgrund |
| `--ok` | | `#1E6F3E` | Positiv text (t.ex. +38) |

**Regel:** Signalröd `#FF0C01` är varumärkets puls men doseras snålt – max ett rött signaturmoment per vy utöver nav-markören. All röd text i brödtextstorlek använder `--accent-deep` eller `--error`.

### 1.2 Statusfärger (badges)

Varje status har text + punkt + tonad bakgrund. Text-på-tint klarar AA. Färg är aldrig ensam bärare – etiketten finns alltid.

| Status | Text | Bakgrund | Punkt |
|---|---|---|---|
| Ny | `#2C657C` | `#EAF2F6` | `#4E8CA6` |
| Kontaktad | `#8A5800` | `#FBF1DE` | `#C8861A` |
| Dialog | `#574A92` | `#EFEDF8` | `#7B6DC2` |
| Möte | `#0F6E66` | `#E4F3F1` | `#1E9C90` |
| Kund | `#1E6F3E` | `#E6F3EA` | `#2E9A57` |
| Förlorad | `#5B6770` | `#EEF1F4` | `#93A0AA` |

### 1.3 Typografi

| Roll | Typsnitt | Vikt/storlek |
|---|---|---|
| Display (vytitlar) | Montserrat | 700 · 21px · letter-spacing −1 % · line-height 1.25 |
| Rubrik i kort | Montserrat | 700 · 14–16px |
| Brödtext/UI | Montserrat | 400–600 · 13–14px / 1.5 |
| Kolumnrubriker | Montserrat | 700 · 11px · versaler · +5 % spärrning |
| **Data** (belopp, orgnr, datum, KPI:er) | IBM Plex Mono | 400–600 · `font-variant-numeric: tabular-nums` |
| Wordmark | Montserrat | 800 · +12 % spärrning · VERSALER |

**Svenska format:** belopp `5 000 000 kr` (`toLocaleString("sv-SE")`, hårt mellanslag), datum `YYYY-MM-DD`, mkr med decimalkomma (`8,1 mkr`). Tal är alltid högerställda i tabeller.

### 1.4 Spacing, radius, skuggor

- Spacing på 4px-bas: 4 / 8 / 12 / 16 / 20 / 28 / 32.
- Radius: `--radius-s: 6px` (knappar, fält, chips), `--radius-m: 10px` (kort, tabellskal), `--radius-l: 14px` (modaler, login), `999px` (badges, piller).
- Skuggor: `--shadow-s` 0 1 2 / 6 % (kort), `--shadow-m` 0 4 16 / 10 % (toast), `--shadow-l` 0 16 48 / 18 % (modal, login).
- Sidopanel: 224px fast bredd, bakgrund Bläck.
- Innehåll: max-bredd 1320px, padding 28/32px (16px på mobil).

---

## 2. Komponentinventering

Alla komponenter finns levande i vyn **Designsystem** i mockupen.

### Knappar (`.btn`)
- **Primär** `.btn-primary`: Bläck-fyllning, vit text. Hover: `#303B44`.
- **Accent** `.btn-accent`: Djupröd fyllning. Reserverad för signaturhandlingar: "Logga in", "Hämta bolag nu", bekräfta i destruktiv dialog.
- **Sekundär** `.btn`: vit yta, Linje-kant. Hover: Dis-bakgrund.
- **Ghost** `.btn-ghost`: transparent, hover ger svag yta.
- **Destruktiv** `.btn-danger`: vit yta, röd text/kant. Hover: felbakgrund.
- Tillstånd: hover (ovan) · fokus (2px Bläck-outline, offset 2px; vit outline på mörk yta) · disabled (45 % opacitet, `cursor: not-allowed`) · loading (`.loading`: text döljs, 14px spinner).
- Mått: 7×14px padding, 13px/600, radius 6px. `.btn-sm`: 4×10px, 12px.

### Tabell (`table.data` i `.table-shell`) — hjälten
- Radhöjd **40px**, 13px text, vita rader, avskiljare `--line-soft`.
- Rubrikrad: 11px versaler, bakgrund `#FBFCFD`, sorterbara kolumner med pil i Djupröd och `aria-sort`.
- Tal högerställda i IBM Plex Mono med tabellsiffror; belopp under tröskeln får klass `.under` (dämpad färg + title-förklaring); röd `.qual-mark`-punkt på kvalificerande år.
- Radhover `#F3F7FA`; hela raden klickbar (även Enter via `tabindex="0"`).
- Verktygsrad ovanför: sök (240px), select-filter, resultaträknare. Paginering under: mono-sifferknappar, aktiv sida Bläck-fylld.

### Statusbadge (`.badge.st-*`)
Pillerform, 11,5px/600, punkt 7px + etikett. Se 1.2.

### Formulärfält (`.input`, `.select`, `.switch`)
- 13px, padding 7×10, radius 6, kant Linje.
- Hover: kant `#C9D3DA` · fokus: 2px Bläck-outline · fel: röd kant + `aria-invalid` + `.error-text` · disabled: `--line-soft`-bakgrund, dämpad text.
- Etikett 12px/600 i `--ink-2`; hjälptext `.hint` 12px i `--ink-3`.
- Switch: 34×20px, av `#C9D3DA` → på Bläck.

### Kort (`.card`, `.kpi`)
- Vit yta, Linje-kant, radius 10, `--shadow-s`. Korthuvud med 14px-rubrik och svag underlinje.
- KPI-kort: 11px versal etikett, 26px mono-värde, metarad. `.kpi-accent` har 3px Signalröd toppkant (max ett per vy).

### Modal (`.modal-backdrop` + `.modal`)
- Backdrop `rgba(20,25,29,0.45)`, modal max 440px, radius 14, `--shadow-l`, 160ms intoning.
- Stängs med Esc, klick på backdrop eller Avbryt. Fokus flyttas in vid öppning.
- **Bekräftelsedialog** (`role="alertdialog"`): rubrik som fråga, konsekvensbeskrivning, Avbryt (sekundär) + handling (accent/destruktiv).

### Toast (`.toast`)
- Bläck-bakgrund, vit text, nere till höger, max 360px, auto-stäng 4,5s + manuell stängning, `role="status"` i `aria-live="polite"`-stack.
- Varianter via punktfärg: lyckat (grön), fel (Signalröd), info (Duvblå).

### Kanban (`.kanban`)
- 6 kolumner (Ny → Kontaktad → Dialog → Möte → Kund / Förlorad), kolumnbakgrund `#F1F5F8`, kort med namn/ort/omsättning/ansvarig/dagar.
- Drag & drop: draget kort 45 % opacitet, målkolumn får streckad Duvblå outline. Släpp = statusbyte + toast + logg.

### Övrigt
- **Tomt tillstånd** (`.empty`): radarglyf, kort rubrik, en menings förklaring, ev. åtgärdsknapp.
- **Laddning**: skeleton-rader med skimmer (stängs av vid `prefers-reduced-motion`); knappspinner för pågående handlingar.
- **Felbanner** (`.banner.error`): felbakgrund, ikon, fet inledning + åtgärdsförslag.
- **Parameterchip** (`.param-chip`): Duvblå tint, nyckel i fetstil – visar aktiva synkparametrar.
- **Avatar**: 26px cirkel med initialer; fasta färger per användare.
- **Radarglyf**: genereras av `grodtRadarSvg(size, live)`; svep 3,2s rotation + blip-puls, endast vid `prefers-reduced-motion: no-preference`.

---

## 3. Layoutregler

- **Appskal:** CSS grid `224px 1fr`. Sidopanel: Bläck, sticky, full höjd; logotyp överst, nav i mitten (grupper: huvudvyer · System), inloggad användare + utloggning längst ner. Aktiv navpunkt: ljusare yta + 3px Signalröd kantmarkör.
- **Vyhuvud:** titel + lede till vänster, åtgärder till höger; wrappar på smala skärmar.
- **Dashboard:** 4 KPI-kort → grid `1.6fr 1fr` med pipelinefördelning + radarpanel till vänster, aktivitetsflöde till höger.
- **Bolagsdetalj:** grid `1.5fr 1fr` – fakta/trend/anteckningar till vänster, status- och aktivitetstidslinje till höger.
- **Login:** egen mörk skärm (Bläck) med koncentriska radarringar, vitt kort max 380px.

### Responsivitet
- Brytpunkt **920px**: sidopanelen blir en overlay (translateX, scrim bakom, meny-knapp i innehållet); allt blir 1 kolumn; KPI-grid 2×2; sökfältet tar full bredd; kanban scrollar horisontellt (min 190px per kolumn).
- Brytpunkt **560px**: KPI och fakta 1 kolumn.
- Touchmål minst 40×40px (tabellrader 40px, knappar ≥ 32px höga med omgivande luft).

---

## 4. Tillgänglighet

- WCAG AA-kontrast genomgående; röda/blå märkesfärger har textsäkra varianter (se 1.1).
- Synligt tangentbordsfokus: 2px outline i Bläck (vit på mörka ytor), offset 2px – aldrig `outline: none` utan ersättning.
- Status kommuniceras med färg + punkt + text; fel med ikon + text.
- Tabellsortering exponerar `aria-sort`; toasts i `aria-live="polite"`; modaler med `aria-modal`, Esc-stängning och fokushantering.
- Alla animationer (radarsvep, skimmer, toast-intoning) gated bakom `prefers-reduced-motion: no-preference`.

---

## 5. Domänregler som syns i UI:t

- **Tröskel:** nettoomsättning ≥ 5 000 000 kr för **minst ett** av de två valda räkenskapsåren (ELLER-logik). UI:t förklarar detta i bolagslistans lede, i synk-vyns parameterkort och i inställningarnas hjälptext.
- Belopp under tröskeln dämpas men visas (transparens om varför bolaget ändå kvalificerar).
- Varje handling (statusbyte, tilldelning, anteckning, synk, export, kontoändring) loggas och visas i bolagets tidslinje samt i den globala audit-loggen.
- Konton skapas endast av admin – ingen självregistrering på login.
