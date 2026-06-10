import { LEAD_STATUSES } from "@/lib/constants";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { DsDemos } from "./ds-demos";

export const metadata = { title: "Designsystem – GRODT" };

const SWATCHES = [
  { name: "Skog", hex: "#14271E" },
  { name: "Mässing", hex: "#C9921A" },
  { name: "Mässing djup (text)", hex: "#8A650E" },
  { name: "Salvia", hex: "#6FA293" },
  { name: "Gran (länkar)", hex: "#2C6B52" },
  { name: "Dis", hex: "#F7FAF7" },
  { name: "Linje", hex: "#DCE4DF" },
];

export default function DesignsystemPage() {
  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h1>Designsystem</h1>
          <p className="lede">
            Levande referens för komponenter och tillstånd. Fullständiga tokens i
            design/DESIGN_SPEC.md.
          </p>
        </div>
      </div>

      <div className="ds-section">
        <h2>Palett</h2>
        <div className="ds-row">
          {SWATCHES.map((swatch) => (
            <div className="swatch" key={swatch.hex}>
              <div className="chip" style={{ background: swatch.hex }} />
              <div className="s-name">{swatch.name}</div>
              <div className="s-hex">{swatch.hex}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="ds-section">
        <h2>Knappar</h2>
        <div className="ds-row">
          <button type="button" className="btn btn-primary">
            Primär
          </button>
          <button type="button" className="btn btn-accent">
            Accent (signatur)
          </button>
          <button type="button" className="btn">
            Sekundär
          </button>
          <button type="button" className="btn btn-ghost">
            Ghost
          </button>
          <button type="button" className="btn btn-danger">
            Destruktiv
          </button>
          <button type="button" className="btn btn-primary" disabled>
            Inaktiverad
          </button>
          <button type="button" className="btn btn-primary loading">
            Laddar
          </button>
        </div>
      </div>

      <div className="ds-section">
        <h2>Statusbadges</h2>
        <div className="ds-row">
          {LEAD_STATUSES.map((s) => (
            <StatusBadge key={s.key} status={s.key} />
          ))}
        </div>
        <p className="small faint" style={{ marginTop: 8 }}>
          Färg + punkt + text – fungerar även utan färgseende.
        </p>
      </div>

      <div className="ds-section">
        <h2>Formulärfält</h2>
        <div className="ds-row" style={{ alignItems: "flex-start" }}>
          <div className="field" style={{ width: 200 }}>
            <label htmlFor="ds-normal">Normal</label>
            <input id="ds-normal" className="input" placeholder="Skriv här …" />
          </div>
          <div className="field" style={{ width: 200 }}>
            <label htmlFor="ds-error">Fel</label>
            <input
              id="ds-error"
              className="input"
              aria-invalid="true"
              defaultValue="ogiltigt värde"
            />
            <span className="error-text">Kontrollera värdet.</span>
          </div>
          <div className="field" style={{ width: 200 }}>
            <label htmlFor="ds-disabled">Inaktiverad</label>
            <input id="ds-disabled" className="input" disabled value="Låst" readOnly />
          </div>
        </div>
      </div>

      <DsDemos />

      <div className="ds-section">
        <h2>Tomt tillstånd</h2>
        <div className="card" style={{ maxWidth: 520 }}>
          <EmptyState
            title="Inga anteckningar ännu"
            description="Anteckningar du sparar på ett bolag visas här för hela teamet."
          />
        </div>
      </div>
    </section>
  );
}
