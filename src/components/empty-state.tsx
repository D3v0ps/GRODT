import type { ReactNode } from "react";
import { RadarGlyph } from "./radar-glyph";

/** Tomt tillstånd: radarglyf, kort rubrik, en menings förklaring, ev. åtgärd. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <RadarGlyph size={36} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
