/**
 * Radarglyfen – GRODT:s signaturelement. Svep + blip animeras endast i
 * "live"-läge och endast vid prefers-reduced-motion: no-preference (CSS).
 */
export function RadarGlyph({
  size = 40,
  live = false,
}: {
  size?: number;
  live?: boolean;
}) {
  return (
    <svg
      className={`radar-glyph${live ? " live" : ""}`}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="20" cy="20" r="18" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="11" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
      <circle cx="20" cy="20" r="2" fill="currentColor" />
      <g className="sweep">
        <path d="M20 20 L20 2 A18 18 0 0 1 32.7 7.3 Z" fill="currentColor" fillOpacity="0.18" />
        <line x1="20" y1="20" x2="20" y2="2" stroke="currentColor" strokeWidth="1.5" />
      </g>
      <circle className="blip" cx="28" cy="12" r="2.2" fill="var(--accent, #C9921A)" />
    </svg>
  );
}
