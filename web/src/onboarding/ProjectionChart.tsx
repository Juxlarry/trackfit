/** Weight projection from today to the target (onboarding interstitial and plan reveal). */
export function ProjectionChart({ startKg, targetKg, weeks, fmt, toDisplay, compact }: {
  startKg: number;
  targetKg: number;
  weeks: number;
  fmt: (kg: number) => string;
  toDisplay: (kg: number) => number;
  compact?: boolean;
}) {
  const W = 600, H = compact ? 200 : 230, padL = 44, padR = 74, padT = 24, padB = 30;
  const n = Math.max(2, weeks);
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const e = (1 - Math.exp(-1.6 * t)) / (1 - Math.exp(-1.6));
    pts.push(startKg + (targetKg - startKg) * e);
  }
  const lo = Math.min(startKg, targetKg), hi = Math.max(startKg, targetKg), span = Math.max(hi - lo, 1);
  const y0 = lo - span * 0.15, y1 = hi + span * 0.15;
  const X = (i: number) => padL + ((W - padL - padR) * i) / n;
  const Y = (v: number) => padT + (H - padT - padB) * (1 - (v - y0) / (y1 - y0));
  const d = pts.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const area = `${d} L${X(n).toFixed(1)} ${H - padB} L${X(0).toFixed(1)} ${H - padB} Z`;
  const start = new Date();
  const months = Math.max(1, Math.round(n / 4.35));
  const stepM = months > 8 ? 2 : 1;
  const ticks: { x: number; label: string }[] = [];
  for (let m = 0; m <= months; m += stepM) {
    const dt = new Date(start.getFullYear(), start.getMonth() + m, 1);
    const wk = (dt.getTime() - start.getTime()) / 864e5 / 7;
    if (wk >= 0 && wk <= n) ticks.push({ x: X(wk), label: dt.toLocaleDateString("en-GB", { month: "short" }) });
  }
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Projected weight from ${fmt(startKg)} to ${fmt(targetKg)} over ${n} weeks`}>
        {[hi, (hi + lo) / 2, lo].map((v) => (
          <g key={v}>
            <line className="grid" x1={padL} x2={W - padR} y1={Y(v)} y2={Y(v)} />
            <text className="axis" x={padL - 8} y={Y(v) + 4} textAnchor="end">{Math.round(toDisplay(v))}</text>
          </g>
        ))}
        <path className="area fadein" style={{ "--d": "1s" } as React.CSSProperties} d={area} />
        <path className="line draw" style={{ "--len": 1400 } as React.CSSProperties} d={d} />
        {ticks.map((t) => <text key={t.label + t.x} className="axis" x={t.x} y={H - 8} textAnchor="middle">{t.label}</text>)}
        <circle className="dot0" cx={X(0)} cy={Y(startKg)} r={6} />
        <circle className="dot fadein" style={{ "--d": "1.5s" } as React.CSSProperties} cx={X(n)} cy={Y(targetKg)} r={8} />
        <text className="tag fadein" style={{ "--d": "1.6s" } as React.CSSProperties} x={X(n) + 14} y={Y(targetKg) + 4}>{fmt(targetKg)}</text>
        <text className="axis" x={X(0) + 12} y={Y(startKg) - 12}>Today</text>
      </svg>
    </div>
  );
}
