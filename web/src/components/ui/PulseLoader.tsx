import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

/**
 * The TrackFit mark beating like a heart: the app's one loading indicator.
 *
 * - `full`: the whole screen, for app start and sign-in. After a few seconds it
 *   adds a line about the server waking up, since the free API host sleeps
 *   when idle and the first request can take most of a minute.
 * - default: a block inside a page or card.
 * - `small`: inline, in a list or beside a label.
 *
 * `label` is read out by screen readers (and shown under the mark for `full`
 * only after the wait gets long).
 */
export function PulseLoader({ label = "Loading", full, small, slowHint = full }: {
  label?: string;
  full?: boolean;
  small?: boolean;
  slowHint?: boolean;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!slowHint) return;
    const t = window.setTimeout(() => setSlow(true), 6000);
    return () => window.clearTimeout(t);
  }, [slowHint]);
  return (
    <div className={`pulse${full ? " full" : ""}${small ? " sm" : ""}`} role="status" aria-live="polite">
      <span className="pulse-mark" aria-hidden="true"><Activity /></span>
      <span className="sr-only">{label}</span>
      {slow && <span className="pulse-note">Waking up TrackFit. The first load after a quiet spell can take up to a minute.</span>}
    </div>
  );
}
