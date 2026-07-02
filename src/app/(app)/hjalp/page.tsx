import { fmtKr } from "@/lib/format";
import { getSyncFilter } from "@/lib/settings";
import { sniLabel } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TourLauncher } from "@/components/tour";

export const metadata = { title: "Hjälp – GRODT" };

/**
 * Manualen: hela arbetsflödet sektion för sektion, plus startknapp för
 * den guidade rundturen som går igenom alla vyer.
 */
export default async function HjalpPage() {
  const supabase = await createSupabaseServerClient();
  const settings = await getSyncFilter(supabase);
  const years = settings.revenueYears.join(" eller ");

  return (
    <section className="view" style={{ maxWidth: 880 }}>
      <div className="view-head">
        <div>
          <h1>Hjälp &amp; kom igång</h1>
          <p className="lede">
            Så använder ni GRODT – från import till intjänade kronor. Ny i verktyget?
            Ta rundturen så visar vi varje vy.
          </p>
        </div>
        <div className="actions">
          <TourLauncher />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2>Idén på 30 sekunder</h2>
        </div>
        <div className="card-body hjalp-prosa">
          <p>
            GRODT hittar och håller ordning på bolag inom{" "}
            <strong>{settings.sniCodes.map((c) => sniLabel(c)).join(", ")}</strong>. Ett
            bolag kvalificerar som lead när nettoomsättningen når{" "}
            <strong>{fmtKr(settings.revenueMinSek)}</strong> för{" "}
            <strong>minst ett</strong> av åren {years} (ELLER-logik – snabbväxare ska
            inte falla bort för att fjolåret var svagt). Flödet är:{" "}
            <em>importera/synka → kvalificera i Bolag → driv dialogen i Pipeline →
            vinn affären → lämna över till controller i Kunder → registrera intäkterna</em>.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2>1. Dashboard</h2>
        </div>
        <div className="card-body hjalp-prosa">
          <p>
            Dagens arbetsläge. <strong>Att följa upp</strong> är din att göra-lista:
            påminnelser du (eller en kollega) satt på bolag. Förfallna visas i rött med
            datumet de skulle gjorts – klicka <em>Klar</em> när samtalet är taget.{" "}
            <strong>Snabbväxare utan ansvarig</strong> listar växande bolag som ingen
            äger ännu – dagens ringlista. KPI-korten räknar bolag, nya leads, aktiva
            dialoger och intjänade kronor.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2>2. Bolag – listan</h2>
        </div>
        <div className="card-body hjalp-prosa">
          <p>
            Sök på bolagsnamn, organisationsnummer eller ort. Filtrera på status, ort,
            omsättningsnivå, tillväxt och ansvarig – och sortera genom att klicka på
            kolumnrubrikerna. De fyra årskolumnerna visar omsättningen;{" "}
            <strong>mässingspunkten</strong> markerar året som ELLER-kvalificerar
            bolaget när det andra året ligger under tröskeln.
          </p>
          <p>
            <strong>Massutdelning:</strong> kryssa i flera rader så dyker en list upp –
            välj säljare och klicka Tilldela. <strong>Spara som ringlista:</strong>{" "}
            samma markering (eller hela det aktiva filtret) kan sparas som en delad
            ringlista att beta av. <strong>Lägg till bolag:</strong> ange bara ett
            organisationsnummer så hämtas namn, ort, SNI, beskrivning och bokslut
            automatiskt från Bolagsverket, och leadet tilldelas dig.{" "}
            <strong>Exportera CSV</strong> tar med exakt de filter du ser.
          </p>
          <p>
            <strong>Målbilden:</strong> verktyget säljer bara på rätt bolag. Varje bolag
            är AI-bedömt utifrån namn, verksamhetsbeskrivning och SNI-kod till en av
            fyra klasser: <em>arbetsförmedling/rekrytering</em> och{" "}
            <em>omställning/matchning</em> (målgruppen) respektive{" "}
            <em>personaluthyrning</em> och <em>annat</em> (utanför). Bolag utanför
            målgruppen flyttas ut – de döljs ur listan, pipelinen och statistiken (men
            raderas aldrig). Bocka i <em>Visa utanför målbild</em> i verktygsfältet för
            att se dem, och öppna ett bolag för att <em>Återställa det till pipelinen</em>{" "}
            om det ändå är säljbart.
          </p>
          <p>
            <strong>Lågan</strong> intill bolagsnamnet är bedömningens kvitto: bolaget
            bedöms köra arbetsförmedling/rekrytering eller omställning – rätt målgrupp
            att ringa (håll muspekaren över lågan så står vilken). Raden under namnet
            visar alltid vad bolaget faktiskt gör, så ingen behöver klicka in på fel
            kund. Bedömningen syns också på bolagskortet under Bolagsfakta.
          </p>
          <p>
            Övriga flaggor: <em>Avreg.</em> betyder att bolaget är avregistrerat hos
            Bolagsverket (leadet flyttas automatiskt till Förlorad).
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2>3. Bolagssidan</h2>
        </div>
        <div className="card-body hjalp-prosa">
          <p>
            Klicka på en rad i listan för bolagets detaljsida: bolagsfakta från
            Bolagsverket, omsättningstrenden, status och ansvarig, anteckningar och en
            tidslinje över allt som hänt. Saknas telefon/hemsida kan du hämta dem från
            bolagets publika Google-profil – sådana nummer märks alltid{" "}
            <em>&quot;via Google, kan vara växelnummer&quot;</em> så att ingen
            förväxlar dem med ett verifierat direktnummer.
          </p>
          <p>
            <strong>Kontaktpersoner:</strong> lägg in vem ni pratar med – namn, titel,
            direktnummer, e-post och en anteckning. Kontaktens direktnummer går före
            växelnumret i ringlistorna, och varje ändring loggas i tidslinjen.{" "}
            <strong>Affärsvärde:</strong> sätt det förväntade värdet av affären, så
            syns det på pipelinekortet och bygger prognosen under Statistik.
          </p>
          <p>
            <strong>Uppföljning:</strong> sätt &quot;kontakta om 1 vecka/1 månad/3
            månader&quot; (eller eget datum), skriv en anteckning och välj vem som ska
            följa upp. Påminnelsen ligger på dashboarden och kanban-kortet tills den
            bockas av – och försvinner automatiskt om bolaget blir Kund eller
            Förlorad. <strong>Lämna över till controller</strong> gör bolaget till
            kund när affären är vunnen.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2>4. Pipeline</h2>
        </div>
        <div className="card-body hjalp-prosa">
          <p>
            Kanban-tavlan med kolumnerna Ny → Kontaktad → Dialog → Möte → Kund →
            Förlorad. Dra ett kort till nästa kolumn, eller fokusera kortet med Tab
            och flytta med vänster/höger piltangent. Flyttar du något till{" "}
            <strong>Förlorad</strong> frågar vi alltid efter orsaken (fel timing, valde
            konkurrent, för dyrt …) – det bygger er statistik. Dubbelklick eller Enter
            öppnar bolaget. Kortet visar högsta omsättningen, dagar i kolumnen och
            uppföljningsdatum.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2>5. Ringlistor</h2>
        </div>
        <div className="card-body hjalp-prosa">
          <p>
            Teamets gemensamma att ringa-listor. Skapa en från bolagslistan:
            markera rader (eller behåll bara filtret aktivt) och klicka{" "}
            <strong>Spara som ringlista</strong> – upp till 500 bolag per lista,
            avregistrerade hoppas över automatiskt. Telefonnummer i listan är
            klickbara, och nummer hämtade via Google märks så att ni vet att det kan
            vara ett växelnummer.
          </p>
          <p>
            Bocka av raderna medan ni ringer: alla ser direkt vem som tagit samtalet
            och när, framstegsmätaren visar hur långt listan kommit och nästa bolag
            att ringa markeras med mässingskanten. Avbockningar hamnar i bolagets
            tidslinje och räknas som &quot;Ringda&quot; i statistiken. Listor kan tas
            bort av den som skapade dem eller av admin – bolagen påverkas aldrig.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2>6. Kunder &amp; leveranskedjan</h2>
        </div>
        <div className="card-body hjalp-prosa">
          <p>
            Allt efter vunnen affär. Säljaren lämnar över bolaget (affären krediteras
            leadets ansvariga säljare i topplistan), en controller tar vid och
            leveransen följs steg för steg:{" "}
            <strong>
              Överlämnad → Första sållningen → Andra sållningen → 50 % klar → 75 %
              klar → Leverans klar → Faktura skickad → Faktura betald
            </strong>
            . Kedjan visas på kundkortet och varje statusbyte loggas i tidslinjen, så
            att hela teamet ser exakt var leveransen står.
          </p>
          <p>
            <strong>Intäkter:</strong> registrera belopp med beskrivning och datum.
            Råkade du skriva fel? Posten kan redigeras eller tas bort i efterhand – av
            den som registrerade den eller av admin, och varje ändring loggas.{" "}
            <strong>Kontaktuppgifter:</strong> spara kontaktperson och &quot;numret man
            faktiskt når kunden på&quot;. <strong>Kommentarer</strong> visar alltid
            vem som skrev vad. Topplistan summerar intjänat per säljare – get rich or
            die trying.
          </p>
          <p>
            <strong>Export:</strong> knapparna Kunder CSV och Intäkter CSV laddar ner
            kundlistan (med aktiva filter) respektive alla intäktsposter – klara för
            bokföringen eller månadsrapporten.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2>7. Statistik &amp; profiler</h2>
        </div>
        <div className="card-body hjalp-prosa">
          <p>
            Statistiksidan räknar kontaktade, dialoger, möten, vunna/förlorade
            affärer, ringda samtal, anteckningar, avklarade uppföljningar och
            intjänade kronor – per person och period (vecka, månad, år eller hela
            tiden, alltid i svensk kalendertid). Poängen byggs av aktivitetsloggen:
            den som gör statusbytet får poängen, och intjänat krediteras säljaren som
            vann kunden.
          </p>
          <p>
            <strong>Säljanalysen</strong> visar konverteringstratten
            (Kontaktade → Dialoger → Möten → Vunna med procent mellan stegen och win
            rate), topplistan över förlustorsaker och snitt-tiden per pipelinesteg.{" "}
            <strong>Pipelineprognosen</strong> summerar affärsvärdena på aktiva leads –
            totalt och viktat med sannolikhet per steg (Ny 10 %, Kontaktad 25 %,
            Dialog 50 %, Möte 75 %). Tabellen Pipeline just nu visar vem som har hur
            många aktiva leads och hur mycket värde på bordet.
          </p>
          <p>
            Klicka på ett namn (eller sök på en kollega med Ctrl+K) för personens{" "}
            <strong>profilsida</strong>: aktivitet för vald period, vad som ligger på
            bordet just nu, säljarfacit och de senaste händelserna. Din egen profil
            når du genom att klicka på ditt namn längst ner i sidomenyn.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2>8. Import &amp; synk</h2>
        </div>
        <div className="card-body hjalp-prosa">
          <p>
            <strong>CSV-import:</strong> dra in din fil – även mycket stora filer
            fungerar eftersom tolkningen sker i webbläsaren och skickas upp i omgångar.
            Svenska och engelska rubriker känns igen (Bolagsnamn/Orgnr/Ort/Omsättning
            2023 …), belopp i tkr/mkr räknas om till kronor, och både{" "}
            <em>brett</em> format (en rad per bolag) och <em>långt</em> (en rad per
            bolag och år) stöds. Omsättningsfiltret avgör vilka rader som blir leads –
            eller bocka i &quot;importera alla som leads&quot;.
          </p>
          <p>
            <strong>Bolagsverket:</strong> berikar befintliga bolag med
            myndighetsdata och bokslut ur digitala årsredovisningar (gratis API).
            Körningar startas med <em>Hämta bolag nu</em> eller automatiskt varje
            måndag. <strong>Google-svepet</strong> (admin) fyller i saknade
            telefonnummer/hemsidor – alltid källmärkt, aldrig över befintlig data.
            Varje körning hamnar i historiken med antal nya/uppdaterade och eventuella
            fel.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2>9. Inställningar &amp; roller</h2>
        </div>
        <div className="card-body hjalp-prosa">
          <p>
            Admin styr målbilden under Inställningar: SNI-koder, omsättningströskel och
            vilka två räkenskapsår som kvalificerar (ELLER-logik). Ändringarna gäller
            nästa synk/import och loggas. Under <strong>Mitt konto</strong> byter alla
            sitt lösenord (kräver nuvarande lösenord) och profilbild.
          </p>
          <p>
            Roller: <strong>Säljare</strong> arbetar i Bolag/Pipeline och lämnar över
            vunna affärer. <strong>Controller</strong> tar emot kunder och registrerar
            intäkter. <strong>Admin</strong> hanterar användare, inställningar och ser
            hela audit-loggen. Nya konton får ett engångslösenord som ska bytas vid
            första inloggningen.
          </p>
          <p>
            <strong>Notiser:</strong> klockan längst ner i menyn visar dina personliga
            händelser – när någon tilldelar dig ett lead, sätter en uppföljning åt dig
            eller lämnar över en kund. Admin kan dessutom koppla en{" "}
            <strong>chatt-webhook</strong> (Slack/Teams/Discord) under Inställningar,
            så postas vunna affärer, överlämningar och utdelningar i er kanal.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2>Vanliga frågor</h2>
        </div>
        <div className="card-body hjalp-prosa">
          <p>
            <strong>Hur hittar jag snabbt ett bolag eller en kollega?</strong> Tryck{" "}
            <strong>Ctrl+K</strong> (Cmd+K på Mac) var som helst i appen – snabbsöket
            hittar bolag, kunder, personer och sidor. Piltangenterna väljer, Enter
            öppnar, Esc stänger.
          </p>
          <p>
            <strong>Varför står ett telefonnummer som &quot;via Google&quot;?</strong>{" "}
            Numret kommer från bolagets publika Google-profil och kan vara ett
            växelnummer. När ni verifierat rätt nummer på en kund – spara det under
            kundens kontaktuppgifter.
          </p>
          <p>
            <strong>Varför blev ett bolag automatiskt Förlorad?</strong> Bolagsverket
            har markerat det som avregistrerat. Det syns i bolagets tidslinje.
          </p>
          <p>
            <strong>Vart tog ett bolag vägen ur listan?</strong> Troligen flyttades det
            ut ur målbilden för att Bolagsverkets SNI-kod visade personaluthyrning eller
            annan bransch utanför 78.100. Bocka i &quot;Visa utanför målbild&quot; i
            bolagslistan, öppna bolaget och klicka &quot;Återställ till pipelinen&quot;
            om det ändå ska säljas på.
          </p>
          <p>
            <strong>Kan jag ångra en intäkt?</strong> Ja – öppna kunden, klicka på
            pennan vid posten (eller papperskorgen). Ändringen loggas med från- och
            till-belopp.
          </p>
          <p>
            <strong>Importen avbröts halvvägs – vågar jag köra om?</strong> Ja. Allt
            är idempotent: samma fil kan köras igen utan dubbletter, redan importerade
            bolag uppdateras bara.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Rundturen</h2>
        </div>
        <div
          className="card-body"
          style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}
        >
          <p className="small muted" style={{ margin: 0, flex: "1 1 280px" }}>
            Den guidade turen går igenom alla vyer i appen, steg för steg, med kortet i
            nedre högra hörnet. Du kan avsluta när som helst med Esc.
          </p>
          <TourLauncher label="Starta rundturen igen" />
        </div>
      </div>
    </section>
  );
}
