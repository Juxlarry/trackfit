import { useEffect, useState } from "react";

/** Progress ring (calories eaten vs target). Animates from empty on mount. */
export function Ring({ value, max, big, small }: { value: number; max: number; big: string; small: string }) {
  const r = 50;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, max ? value / max : 0));
  const [offset, setOffset] = useState(c);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setOffset(c * (1 - f))));
    return () => cancelAnimationFrame(id);
  }, [c, f]);
  return (
    <div className="ring">
      <svg viewBox="0 0 118 118" aria-hidden="true">
        <circle className="tr" cx="59" cy="59" r={r} />
        <circle className="fg" cx="59" cy="59" r={r} strokeDasharray={c.toFixed(1)} strokeDashoffset={offset.toFixed(1)} />
      </svg>
      <div className="in"><div><b>{big}</b><span>{small}</span></div></div>
    </div>
  );
}
