import { fmtKr, fmtMkr } from "@/lib/format";

interface TrendYear {
  year: number;
  revenueSek: number | null;
}

/**
 * Omsättningstrend med tröskellinjen som streckad röd linje – designens
 * signaturvisualisering. Staplar under tröskeln dämpas.
 */
export function TrendChart({
  years,
  threshold,
}: {
  years: TrendYear[];
  threshold: number;
}) {
  const values = years.map((y) => y.revenueSek ?? 0);
  const max = Math.max(...values, threshold) * 1.15;

  return (
    <div className="trend">
      <div className="threshold" style={{ bottom: `${(threshold / max) * 100}%` }}>
        <span className="t-label">{fmtMkr(threshold)}</span>
      </div>
      {years.map((y) => {
        const value = y.revenueSek;
        const height = value === null ? 0 : Math.max(3, (value / max) * 100);
        const under = value === null || value < threshold;
        return (
          <div className="bar-col" key={y.year}>
            <span className="val">{value === null ? "–" : fmtMkr(value)}</span>
            <div
              className={`bar${under ? " under-bar" : ""}`}
              style={{ height: `${height}%` }}
              title={value === null ? "Uppgift saknas" : fmtKr(value)}
            />
            <span className="yr">{y.year}</span>
          </div>
        );
      })}
    </div>
  );
}
