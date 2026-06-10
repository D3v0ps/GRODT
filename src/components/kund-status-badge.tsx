import { kundStatusLabel } from "@/lib/constants";

/** Kundstatusbadge: Överlämnad / Pågående / Klar. */
export function KundStatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge st-${status}`}>
      <span className="dot" />
      {kundStatusLabel(status)}
    </span>
  );
}
