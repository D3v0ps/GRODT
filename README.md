# GRODT – Leadradar

**Get rich or die trying.** Internt, lösenordsskyddat verktyg för hela
flödet inom rekrytering och bemanning (SNI 78.100): importera och hämta
bolag, kvalificera dem mot en omsättningströskel, driv dem genom
pipelinen med uppföljningspåminnelser – och när säljaren vunnit affären
lämnas bolaget över till en controller under **Kunder**, med
intäktsspårning (redigerbar i efterhand), verifierade kontaktuppgifter,
kommentarer och topplista. Bolagen berikas automatiskt från
**Bolagsverkets öppna data** (bokslut ur digitala årsredovisningar) och
kan kompletteras med telefon/hemsida från **Google Places** – alltid
källmärkt *"via Google, kan vara växelnummer"*. Inbyggd hjälpsida med
guidad **rundtur** finns under Hjälp. Hela gränssnittet är på svenska.

Designstrukturen följer `design/DESIGN_SPEC.md`; färgtemat är omskinnat
till **Smaragd & mässing** (mörk skogsgrön + mässingsaccent – tokens i
`src/app/globals.css`).

**Stack:** Next.js 15 (App Router, TypeScript) · Tailwind CSS v4 ·
Supabase (Postgres, Auth, RLS) · Vercel (hosting + cron) · Zod · Vitest.

---

## Kärnregeln: omsättningsfiltret

Ett bolag kvalificerar som lead om nettoomsättningen är
**≥ `revenue_min_sek` för MINST ETT av åren i `revenue_years`** (ELLER-logik).

- Default: tröskel `5 000 000 kr`, räkenskapsår `2021/2022`, SNI `78.100`.
- Alla tre parametrarna ändras i **Inställningar** och påverkar nästa
  synk/import. Exempel: ett bolag med 3 000 000 kr (år 1) och 8 000 000 kr
  (år 2) SKA inkluderas; 4 900 000 kr båda åren exkluderas.
- Alla tillgängliga års siffror sparas alltid i `company_financials`
  oavsett filter – filtret avgör bara om bolaget blir lead.
- Belopp lagras ALLTID i SEK som heltal. Källor som levererar tkr (t.ex.
  tic.io:s `rs_NetSalesK`) konverteras i `src/lib/providers/units.ts`
  (explicit testad).

---

## Komma igång lokalt

### 1. Förutsättningar

- Node.js 20+ (utvecklat mot Node 22)
- Ett [Supabase](https://supabase.com)-projekt

### 2. Installera och konfigurera

```bash
npm install
cp .env.example .env.local   # fyll i värdena
```

| Variabel | Beskrivning |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publik anon-nyckel |
| `SUPABASE_SERVICE_ROLE_KEY` | **Endast server-side** – synk, audit log, kontohantering |
| `DATA_PROVIDER` | `bolagsverket`, `tic`, `mock` eller tomt (= endast CSV-import). Kan även styras via `app_settings`-nyckeln `data_provider`. |
| `BOLAGSVERKET_CLIENT_ID` / `BOLAGSVERKET_CLIENT_SECRET` | OAuth2-uppgifter till Värdefulla datamängder (krävs när `DATA_PROVIDER=bolagsverket`; kan även ligga i hemlighetsvalvet) |
| `BOLAGSVERKET_SYNC_LIMIT` | Max bolag som berikas per körning (default 40 – satt efter API-kvoten och funktionens tidsgräns) |
| `TIC_API_KEY` | API-nyckel hos tic.io (krävs när `DATA_PROVIDER=tic`) |
| `GOOGLE_PLACES_API_KEY` | Valfri – kontaktberikning (telefon/hemsida) via Places API (New); allt källmärks "via Google" |
| `CRON_SECRET` | Hemlighet för `/api/cron/sync`, t.ex. `openssl rand -hex 32` |
| `APP_BASE_URL` | Appens bas-URL |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | Används av seed-skriptet |

### 3. Kör migrations

Migrationsfilerna ligger i `supabase/migrations/`. Kör **samtliga** filer
i filnamnsordning, t.ex. med Supabase CLI:

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
```

…eller klistra in filerna i SQL-editorn i Supabase Studio i tur och
ordning (`20260610000001_init.sql` först). Obs:
`20260612000008_avatars_private.sql` gör avatars-bucketen privat och ska
köras **efter** att appkoden som signerar bild-URL:er är driftsatt.
Projektet har även Supabase MCP-servern registrerad i `.mcp.json`, så en
kodagent med MCP-åtkomst kan köra migrationerna åt dig.

### 4. Skapa första admin

```bash
npm run seed
```

Skapar admin-kontot (invite-only – ingen självregistrering finns) och
säkerställer standardinställningarna. Skriptet är idempotent.

> Vill du ha fiktiv demo-data under utveckling:
> `npm run seed -- --with-mock-data` (kör en synk med MockProvider,
> ~45 påhittade bolag). Detta körs **aldrig** automatiskt – produktionsdata
> kommer från din CSV eller tic.io.

### 5. Starta

```bash
npm run dev
```

Logga in på `http://localhost:3000` med seed-kontot. Gå till
**Import & synk** och importera din CSV.

---

## Importera bolag via CSV

Vyn **Import & synk → Importera CSV** är byggd för stora filer (testad
arkitektur upp till ~250 MB / 1 miljon rader): filen läses och tolkas i
webbläsaren och laddas sedan upp i omgångar om 500 bolag till
`/api/import/batch` med förloppsindikator – det kringgår Vercels gräns på
~4,5 MB per request. Har filen en SNI-kolumn kan den filtreras till
inställningarnas SNI-koder redan vid tolkningen, vilket bantar
jättefiler till det relevanta urvalet. Avgränsare (`;`, `,` eller tab),
citattecken, UTF-8/Windows-1252 och BOM hanteras automatiskt – filer
direkt ur svensk Excel fungerar. Avbruten import kan köras om: allt är
idempotent på orgnr.

### Kolumner som känns igen

| Data | Exempel på rubriker |
|---|---|
| Orgnr (obligatorisk) | `Orgnr`, `Organisationsnummer`, `org.nr` |
| Bolagsnamn (obligatorisk) | `Bolagsnamn`, `Namn`, `Företag`, `Company` |
| Ort | `Ort`, `Stad`, `Säte`, `City` |
| Adress | `Adress`, `Gatuadress`, `Besöksadress` |
| Anställda | `Anställda`, `Antal anställda`, `Employees` |
| Hemsida / Telefon | `Hemsida`, `Webb`, `URL` / `Telefon`, `Tel` |
| SNI | `SNI`, `SNI-kod`, `Bransch` |
| Omsättning per år | `Omsättning 2023`, `Nettoomsättning 2024`, `Omsättning 2023 (tkr)` |
| Resultat per år | `Resultat 2023`, `Resultat 2024 (tkr)` |

- **Brett format** (vanligast): en rad per bolag med årskolumner – se
  `examples/bolag-exempel.csv`.
- **Långt format**: en rad per bolag och år med en `År`-kolumn plus
  `Omsättning`/`Resultat` utan årtal.
- Belopp tolkas tolerant: `5 000 000`, `5.000.000`, `5 200 tkr`, `5,2 mkr`.
  Rubriker eller celler med `tkr`/`ksek` räknas om till kr automatiskt.
- Okända kolumner ignoreras. Rader med ogiltigt orgnr rapporteras med
  radnummer utan att stoppa resten av importen.

### Vad händer vid import?

Samma pipeline som API-synken: bolag och **alla** årssiffror upsertas
(dedupe på orgnr – samma fil två gånger ger inga dubbletter), därefter
skapas leads med status **Ny** enligt omsättningsfiltret:

- Innehåller filen omsättningssiffror tillämpas ELLER-regeln.
- Saknar filen siffror blir alla giltiga rader leads (listan antas vara
  färdigkvalificerad).
- Slå på **"Skapa leads för alla rader"** för att uttryckligen hoppa över
  filtret.

Varje import loggas i körningshistoriken och i den globala audit-loggen.

---

## Datakällor (provider-lagret)

Allabolag saknar självbetjänings-API (datat säljs via UC och kräver
avtal), därför är källan utbytbar bakom `CompanyDataProvider`
(`src/lib/providers/types.ts`):

```ts
interface CompanyDataProvider {
  searchCompanies(params: { sniCodes; revenueMinSek; years; page? }): Promise<CompanySearchResult>;
  getCompany(orgnr: string): Promise<CompanyDetails>;
  getFinancials(orgnr: string): Promise<YearFinancials[]>;
}
```

| Provider | `DATA_PROVIDER` | Beskrivning |
|---|---|---|
| `BolagsverketProvider` | `bolagsverket` | **Värdefulla datamängder** (öppna data, gratis). OAuth2 client credentials. Berikar befintliga bolag med myndighetsdata (namn, adress, SNI, status) och läser nettoomsättning/resultat/anställda ur digitalt inlämnade årsredovisningar (iXBRL). API:et stödjer INTE sökning – nya bolag kommer via CSV/tic; synken roterar genom beståndet, äldst synkade först (max `BOLAGSVERKET_SYNC_LIMIT`/körning, default 300). Självtest finns i Inställningar → Datakälla. |
| `TicProvider` | `tic` | tic.io:s LENS-API (`x-api-key`). Fältmappning enligt docs.tic.io – belopp i tkr konverteras till kr. Sökningens omsättningsförfilter är grovt (senaste bokslut); den exakta ELLER-logiken körs alltid i synkmotorn. |
| `MockProvider` | `mock` | Deterministisk testdata (~45 bolag kring tröskeln) för utveckling, seed och tester. |
| `UcAllabolagProvider` | `uc-allabolag` | Tom stub med TODO – aktiveras om avtal med UC/Allabolag tecknas. |
| *(CSV-import)* | *(tomt)* | Ingen API-synk; bolag importeras manuellt via CSV. |

**Byta källa:** sätt `DATA_PROVIDER` (och ev. `TIC_API_KEY`) i miljön och
deploya om. Ingen kod behöver ändras. Ny leverantör = ny klass som
implementerar gränssnittet + en rad i `src/lib/providers/index.ts`.

---

## Synk

- **Manuellt:** knappen **"Hämta bolag nu"** i Import & synk (rate-limitad).
- **Schemalagt:** Vercel Cron anropar `GET /api/cron/sync` måndagar 06:00
  UTC (≈ 08:00 svensk sommartid, se `vercel.json`). Skyddas av
  `CRON_SECRET` (konstanttidsjämförelse) och kan stängas av i Inställningar.
- Flöde: provider → upsert `companies` + `company_financials` → nya
  kvalificerade orgnr ⇒ lead med status `ny` (audit-loggat) →
  `import_runs` + audit log. Idempotent: två körningar i rad ger inga
  dubbletter. Nyckeltal merge:as per fält – en källa som saknar t.ex.
  resultat skriver aldrig över ett befintligt värde.
- **Robusthet:** max EN pågående körning åt gången (unikt partiellt index),
  hängda körningar städas automatiskt, varje körning har en tidsbudget och
  stannar snyggt i förtid (resten tas nästa gång), och bolag vars berikning
  kraschar stämplas ändå så att rotationen aldrig fastnar.
- **Datahygien:** bolag som avregistrerats hos Bolagsverket flyttas
  automatiskt till Förlorad (loggat i tidslinjen); reklamspärr visas på
  bolagskortet.

## Uppföljningar (att göra-listan)

Sätt "kontakta om 1 vecka / 1 månad / 3 månader" (eller eget datum) på
bolagskortet, med valfri anteckning och vem som ska följa upp.
Påminnelsen syns på dashboarden (förfallna i rött) och på kanban-korten
tills den bockas av – och rensas automatiskt när leadet blir Kund eller
Förlorad.

## Kundmodulen

- **Flöde:** lead vinns (status Kund) → säljaren klickar **"Lämna över
  till controller"** på bolagskortet → bolaget blir kund under **Kunder**
  med status Överlämnad → Pågående → Klar. Affären krediteras leadets
  ansvariga säljare i topplistan.
- **Intäkter:** registreras löpande per kund (belopp i kr + beskrivning +
  datum) och kan **redigeras/tas bort i efterhand** (av den som skapade
  posten eller admin – varje ändring loggas med från/till-belopp);
  totalsumma per kund, i KPI:erna och i **Topplistan** per säljare.
- **Kontaktuppgifter:** verifierad kontaktperson, telefon ("numret man
  faktiskt når kunden på") och e-post per kund.
- **Kommentarer:** delas av hela teamet, alltid med författare och tid.
- **Förlustorsaker:** flytt till Förlorad kräver alltid en orsak – grunden
  för statistik över varför affärer tappas.
- **Roller:** Säljare, Controller och Admin (etiketter och arbetsflöde –
  alla aktiva användare kan läsa och arbeta med allt, endast admin hanterar
  konton/inställningar; varje mutation audit-loggas).
- Kunder kan även läggas till manuellt under Kunder → "Lägg till kund".

## Hjälp & rundtur

**Hjälp** i menyn innehåller hela manualen (import, kvalificeringsregeln,
pipeline, kundflödet, roller, FAQ) samt en guidad **rundtur** som
navigerar genom alla vyer med ett beskrivande kort – perfekt vid
onboarding av nya säljare.

## Säkerhet

- **Auth:** Supabase e-post + lösenord. Invite-only – konton skapas av
  admin under **Admin** (tillfälligt lösenord visas en gång och måste bytas
  vid första inloggningen – appen påminner tills det är gjort). Eget
  lösenordsbyte kräver det nuvarande lösenordet; admin kan återställa
  vem som helst under Admin. Middleware skyddar alla routes utom `/login`;
  inaktiverade konton stängs ute på nästa request och spärras (ban) i Auth.
- **RLS:** ingen publik åtkomst alls. Inloggade aktiva användare läser
  bolag/bokslut/leads/anteckningar och får skapa/uppdatera leads och
  anteckningar. `activities` skrivs endast server-side och läses endast av
  admin (bolagets tidslinje serveras kurerat av servern). `profiles` och
  `app_settings` skrivs endast av admin. Profilbilderna ligger i en
  **privat** bucket och serveras via signerade URL:er.
- Service role-nyckeln används enbart server-side (`src/lib/supabase/admin.ts`
  vägrar köra i klient). Zod-validering i alla server actions; rate
  limiting på synk-, import-, export- och cron-endpoints samt
  lösenordsbyten. CSV-exporten neutraliserar formelinjektion
  (`=`, `+`, `-`, `@`), och iXBRL-läsaren har zip-bombs-skydd.
- **Audit log:** varje mutation (statusbyte, tilldelning, anteckning,
  uppföljning, synk, CSV-import – inklusive leads skapade av synk/import –
  export, kund-, användar- och inställningsändring) loggas med aktör,
  handling och tidpunkt. Admin-vyn filtrerar per användare (inkl.
  "Systemet"), handlingstyp och svensk kalenderdag, med bläddring.

## Tester, lint, bygge

```bash
npm test        # vitest: filterlogik (inkl. ELLER-fallet), tkr→kr,
                # tic-mappning, CSV-parsning, synkmotorns dedupe/idempotens
npm run lint
npm run build
```

Obligatoriska testfall som täcks: 3 MSEK/8 MSEK ⇒ lead;
4,9/4,9 MSEK ⇒ inget lead; två synkar/importer i rad ⇒ inga dubbletter;
ändrade räkenskapsår ⇒ annat urval i nästa körning.

## Deploy

1. **Supabase:** kör migrationerna, kör `npm run seed` (med produktionens
   env i `.env.local` eller via CI) för första admin.
2. **Vercel:** koppla repot, sätt samtliga miljövariabler från
   `.env.example`, deploya. Cron-jobbet i `vercel.json` aktiveras
   automatiskt; sätt `CRON_SECRET` i projektets env.
3. **Domän (one.com):** i one.com:s DNS-panel, skapa en subdomän t.ex.
   `leads.dindomän.se` som **CNAME** till `cname.vercel-dns.com`, och lägg
   till samma domän under Vercel → Settings → Domains. one.com behöver inte
   bytas.
4. Uppdatera `APP_BASE_URL` till produktions-URL:en.

## Design

`design/` innehåller designhandoffen: `DESIGN_SPEC.md`
(tokens, komponenter, layoutregler, tillgänglighet) samt den klickbara
mockupen (`GRODT.html` + `grodt.css` + `grodt-data.js` + `grodt-app.js`).
Designsystemet är porterat 1:1 till `src/app/globals.css`; vyn
**Designsystem** i appen är en levande referens. Signaturelementet –
radarn och den streckade röda tröskellinjen – återfinns i logotyp,
tomtillstånd, omsättningsdiagram och bolagslistans kvalificeringspunkt.

## Projektstruktur

```
design/                  Designhandoff (källa till sanning för utseendet)
examples/                Exempel-CSV för import
supabase/migrations/     SQL-migrations (schema, RLS, RPC)
scripts/seed.ts          Första admin + standardinställningar
src/
  app/                   Routes (login, dashboard, bolag, pipeline, kunder,
                         synk, admin, installningar, hjalp, …)
  actions/               Server actions (Zod-validerade, audit-loggade)
  components/            Designsystemets React-komponenter (inkl. rundturen)
  lib/
    providers/           CompanyDataProvider: bolagsverket / tic / mock /
                         uc-allabolag + iXBRL-läsare + Google Places
    sync/                Synkmotor, importpipeline, Supabase-store
    csv-import.ts        CSV-parsern (rubrikmappning, beloppstolkning)
    qualification.ts     ELLER-logiken för omsättningsfiltret
```
