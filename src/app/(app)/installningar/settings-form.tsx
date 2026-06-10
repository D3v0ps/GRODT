"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveSettingsAction } from "@/actions/settings";
import { useToast } from "@/components/toast";
import { NBSP, parseSekInput } from "@/lib/format";

interface Props {
  isAdmin: boolean;
  sniCodes: string[];
  revenueMinSek: number;
  years: [number, number];
  autoSync: boolean;
  yearOptions: number[];
}

function formatThousands(n: number): string {
  return n
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export function SettingsForm({
  isAdmin,
  sniCodes,
  revenueMinSek,
  years,
  autoSync,
  yearOptions,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [sni, setSni] = useState(sniCodes.join(", "));
  const [threshold, setThreshold] = useState(formatThousands(revenueMinSek));
  const [year1, setYear1] = useState(years[0]);
  const [year2, setYear2] = useState(years[1]);
  const [auto, setAuto] = useState(autoSync);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [sniError, setSniError] = useState<string | null>(null);

  function save() {
    if (pending || !isAdmin) return;
    setThresholdError(null);
    setSniError(null);

    const parsedThreshold = parseSekInput(threshold);
    if (parsedThreshold === null || parsedThreshold <= 0) {
      setThresholdError("Ange ett belopp i kr, t.ex. 5 000 000.");
      return;
    }
    const codes = sni
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    if (codes.length === 0 || codes.some((c) => !/^\d{2}\.\d{3}$/.test(c))) {
      setSniError("SNI-koder skrivs som 78.100, kommaseparerade.");
      return;
    }

    startTransition(async () => {
      const result = await saveSettingsAction({
        sniCodes: codes,
        revenueMinSek: parsedThreshold,
        year1,
        year2,
        autoSync: auto,
      });
      toast(result.message, result.ok ? "ok" : "err");
      if (result.ok) router.refresh();
    });
  }

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Inställningar</h1>
          <p className="lede">Filterparametrar för synk och CSV-import samt datakälla.</p>
        </div>
        <div className="actions">
          <button
            type="button"
            className={`btn btn-primary${pending ? " loading" : ""}`}
            onClick={save}
            disabled={pending || !isAdmin}
            title={!isAdmin ? "Endast admin kan ändra inställningar" : undefined}
          >
            Spara ändringar
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Filterparametrar</h2>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="field">
            <label htmlFor="s-sni">SNI-koder</label>
            <input
              className="input mono"
              id="s-sni"
              value={sni}
              onChange={(e) => setSni(e.target.value)}
              disabled={!isAdmin}
              aria-invalid={sniError ? true : undefined}
            />
            {sniError && <span className="error-text">{sniError}</span>}
            <span className="hint">Kommaseparerade. Fler koder ger bredare svep.</span>
          </div>
          <div className="field">
            <label htmlFor="s-troskel">Minsta nettoomsättning (kr)</label>
            <input
              className="input mono"
              id="s-troskel"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              onBlur={() => {
                const parsed = parseSekInput(threshold);
                if (parsed !== null) setThreshold(formatThousands(parsed));
              }}
              disabled={!isAdmin}
              aria-invalid={thresholdError ? true : undefined}
            />
            {thresholdError && <span className="error-text">{thresholdError}</span>}
            <span className="hint">
              Bolaget tas med om minst ett av räkenskapsåren når tröskeln.
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label htmlFor="s-ar1">Räkenskapsår 1</label>
              <select
                className="select mono"
                id="s-ar1"
                value={year1}
                onChange={(e) => setYear1(Number(e.target.value))}
                disabled={!isAdmin}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="s-ar2">Räkenskapsår 2</label>
              <select
                className="select mono"
                id="s-ar2"
                value={year2}
                onChange={(e) => setYear2(Number(e.target.value))}
                disabled={!isAdmin}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 13,
              cursor: isAdmin ? "pointer" : "not-allowed",
            }}
          >
            <span className="switch">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => setAuto(e.target.checked)}
                disabled={!isAdmin}
              />
              <span className="track" />
            </span>
            Automatiskt svep varje måndag 08:00
          </label>
          {!isAdmin && (
            <p className="small faint">Endast administratörer kan ändra inställningarna.</p>
          )}
        </div>
      </div>
    </>
  );
}
