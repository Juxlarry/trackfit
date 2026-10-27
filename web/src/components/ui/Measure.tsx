import { Minus, Plus } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

/**
 * Big number + steppers + ruler slider (height, weight, age, sleep).
 * Works in display units; the caller converts to/from storage units.
 */
export function Measure({ value, min, max, step, stepButton, unit, onChange, format, units, activeUnit, onUnit, label }: {
  value: number;
  min: number;
  max: number;
  step: number;
  /** Increment for the -/+ buttons (defaults to step). */
  stepButton?: number;
  unit: string;
  onChange: (v: number) => void;
  /** Read-only text display instead of a number input (e.g. 5′6″). */
  format?: (v: number) => string;
  units?: { value: string; label: string }[];
  activeUnit?: string;
  onUnit?: (u: string) => void;
  label: string;
}) {
  const clamp = (v: number) => Math.round(Math.max(min, Math.min(max, Math.round(v / step) * step)) * 10) / 10;
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const bump = (d: number) => onChange(clamp(value + d * (stepButton ?? step)));
  return (
    <div className="measure stagger">
      {units && onUnit && (
        <div style={{ "--i": 0 } as CSSProperties}>
          <div className="seg" role="group" aria-label="Units">
            {units.map((u) => (
              <button key={u.value} type="button" className={u.value === activeUnit ? "on" : ""} aria-pressed={u.value === activeUnit} onClick={() => onUnit(u.value)}>{u.label}</button>
            ))}
          </div>
        </div>
      )}
      <div className="readout" style={{ "--i": 1 } as CSSProperties}>
        <button className="stepbtn" type="button" aria-label="Decrease" disabled={value <= min} onClick={() => bump(-1)}><Minus /></button>
        <div className="big">
          {format ? (
            <output className="mono" aria-live="polite">{format(value)}</output>
          ) : (
            <>
              <input className="mono" type="number" inputMode="decimal" aria-label={label} min={min} max={max} step={step} value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={() => { const n = Number(text); if (text !== "" && !Number.isNaN(n)) onChange(clamp(n)); else setText(String(value)); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              <span className="u">{unit}</span>
            </>
          )}
        </div>
        <button className="stepbtn" type="button" aria-label="Increase" disabled={value >= max} onClick={() => bump(1)}><Plus /></button>
      </div>
      <div className="ruler-wrap" style={{ "--i": 2 } as CSSProperties}>
        <input className="ruler" type="range" min={min} max={max} step={step} value={value} aria-label={`Adjust ${label}`}
          onChange={(e) => onChange(clamp(Number(e.target.value)))} />
        <div className="ruler-ends"><span>{format ? format(min) : min}</span><span>{format ? format(max) : `${max} ${unit}`}</span></div>
      </div>
    </div>
  );
}
