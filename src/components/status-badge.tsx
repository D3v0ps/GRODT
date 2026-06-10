import { statusLabel } from "@/lib/constants";

/** Statusbadge: färg + punkt + etikett – färg är aldrig ensam bärare. */
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge st-${status}`}>
      <span className="dot" />
      {statusLabel(status)}
    </span>
  );
}
