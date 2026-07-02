"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * Rundturen: en guidad genomgång av alla vyer. Ett kort i nedre högra
 * hörnet beskriver vyn man står i; Nästa/Föregående navigerar genom
 * appen i ordning. Läget sparas i sessionStorage så att turen överlever
 * en sidomladdning, och TourOverlay ligger i AppShell så att kortet
 * följer med genom navigeringarna.
 */

const TOUR_KEY = "grodt-rundtur-steg";
const TOUR_EVENT = "grodt-rundtur";

interface TourStep {
  path: string;
  titel: string;
  text: string;
}

const STEPS: TourStep[] = [
  {
    path: "/dashboard",
    titel: "Dashboard – läget just nu",
    text:
      "Här samlas dagens arbete: KPI-korten överst, att göra-listan med dina uppföljningar (förfallna i rött – bocka av med Klar), pipeline-fördelningen och Snabbväxare utan ansvarig – bolag som växer men som ingen ringer på ännu.",
  },
  {
    path: "/bolag",
    titel: "Bolag – radarlistan",
    text:
      "Alla bolag inom målbilden. Lågan vid namnet betyder AI-bedömd arbetsförmedling/rekrytering – rätt målgrupp att ringa – och raden under namnet visar vad bolaget gör. Uthyrnings- och övrigbolag flyttas ut automatiskt; bocka i 'Visa utanför målbild' för att granska dem. Sök, filtrera, sortera, massutdela, spara som ringlista eller lägg till bolag via orgnr.",
  },
  {
    path: "/pipeline",
    titel: "Pipeline – dra korten",
    text:
      "Säljtavlan. Dra ett kort till nästa kolumn när dialogen utvecklas (eller fokusera kortet och använd vänster/höger piltangent). Släpper du ett kort på Förlorad frågar vi alltid efter orsaken – det bygger statistiken. Dubbelklick öppnar bolaget.",
  },
  {
    path: "/ringlistor",
    titel: "Ringlistor – dagens samtal",
    text:
      "Spara ett urval ur bolagslistan (markerade rader eller hela filtret) och beta av det tillsammans. Bocka av medan ni ringer – alla ser vem som tagit vilket samtal och hur långt listan kommit, och avbockningarna räknas i säljarstatistiken.",
  },
  {
    path: "/kunder",
    titel: "Kunder – efter affären",
    text:
      "När en affär är vunnen lämnar säljaren över bolaget till en controller. Leveranskedjan följer arbetet hela vägen: Överlämnad → sållningar → 50/75 % klar → Leverans klar → Faktura skickad → Faktura betald. Här bor också intäkterna, verifierade kontaktuppgifter och kommentarer.",
  },
  {
    path: "/statistik",
    titel: "Statistik – säljarnas facit",
    text:
      "Kontaktade, möten, vunna affärer och intjänade kronor per person – per vecka, månad, år eller hela tiden. Konverteringstratten, förlustorsakerna och pipelineprognosen (affärsvärdena viktade per steg) visar var affärerna fastnar. Klicka på ett namn för personens profil med historik.",
  },
  {
    path: "/synk",
    titel: "Import & synk – datakällorna",
    text:
      "Importera din bolagslista som CSV (även riktigt stora filer – tolkningen sker i webbläsaren) eller låt Bolagsverket berika bolagen med bokslut ur digitala årsredovisningar. Admin kan dessutom hämta telefon/hemsida från Google – sådana nummer märks alltid \"via Google, kan vara växelnummer\". Varje körning loggas i historiken.",
  },
  {
    path: "/installningar",
    titel: "Inställningar – målbilden",
    text:
      "Filterparametrarna styr vad som blir lead: SNI-koder (78.100 Arbetsförmedling och rekrytering), omsättningströskeln och räkenskapsåren. ELLER-logik: det räcker att ETT av åren når tröskeln. Under Mitt konto byter du lösenord och profilbild.",
  },
  {
    path: "/admin",
    titel: "Admin – användare och logg",
    text:
      "Administratörer skapar konton (engångslösenord visas en gång), byter roller, inaktiverar användare och återställer lösenord. Audit-loggen visar varje förändring i systemet – filtrera på person, handling eller dag.",
  },
  {
    path: "/hjalp",
    titel: "Det var rundturen!",
    text:
      "Hela manualen finns på den här sidan. Ett sista tips: tryck Ctrl+K (Cmd+K på Mac) var du än står för att snabbsöka bolag, kunder, kollegor och sidor. Lycka till – get rich or die trying.",
  },
];

function readStep(): number | null {
  try {
    const raw = sessionStorage.getItem(TOUR_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n < STEPS.length ? n : null;
  } catch {
    return null;
  }
}

function writeStep(step: number | null) {
  try {
    if (step === null) sessionStorage.removeItem(TOUR_KEY);
    else sessionStorage.setItem(TOUR_KEY, String(step));
  } catch {
    // sessionStorage kan vara blockerad – turen funkar ändå tills reload.
  }
  window.dispatchEvent(new Event(TOUR_EVENT));
}

/** Knappen som startar rundturen (används på Hjälp-sidan). */
export function TourLauncher({ label = "Starta rundturen" }: { label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => {
        writeStep(0);
        router.push(STEPS[0].path);
      }}
    >
      {label}
    </button>
  );
}

/** Själva turkortet – monteras en gång i AppShell. */
export function TourOverlay() {
  const router = useRouter();
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    setStep(readStep());
    const onChange = () => setStep(readStep());
    window.addEventListener(TOUR_EVENT, onChange);
    return () => window.removeEventListener(TOUR_EVENT, onChange);
  }, []);

  const close = useCallback(() => writeStep(null), []);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, close]);

  if (step === null) return null;
  const current = STEPS[step];

  function go(next: number) {
    if (next < 0 || next >= STEPS.length) return;
    writeStep(next);
    router.push(STEPS[next].path);
  }

  return (
    <div className="tour-card" role="dialog" aria-label="Rundtur" aria-live="polite">
      <div className="tour-head">
        <strong>{current.titel}</strong>
        <span className="small faint">
          {step + 1} av {STEPS.length}
        </span>
      </div>
      <p className="small" style={{ margin: 0 }}>
        {current.text}
      </p>
      <div className="tour-foot">
        <button type="button" className="btn btn-sm btn-ghost" onClick={close}>
          Avsluta
        </button>
        <span className="spacer" />
        {step > 0 && (
          <button type="button" className="btn btn-sm" onClick={() => go(step - 1)}>
            Föregående
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => go(step + 1)}
          >
            Nästa
          </button>
        ) : (
          <button type="button" className="btn btn-sm btn-primary" onClick={close}>
            Klart
          </button>
        )}
      </div>
    </div>
  );
}
