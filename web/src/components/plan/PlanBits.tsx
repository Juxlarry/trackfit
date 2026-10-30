import { useState } from "react";
import {
  Bandage, CircleAlert, Clock, Dumbbell, Flame, GraduationCap, Minus, Plus, Moon, PersonStanding, Scale, Store, Sunrise, Sunset, Target, Timer, TrendingUp, Zap,
  type LucideIcon,
} from "lucide-react";
import { ExerciseFigure, ExerciseThumb } from "../../figures/Figures";
import { PATS, patOf } from "../../figures/figureEngine";
import { Sheet } from "../ui/Sheet";

/** Engine adaptation icons are lucide names; map them to components. */
const ADAPT_ICONS: Record<string, LucideIcon> = {
  bandage: Bandage, dumbbell: Dumbbell, flame: Flame, target: Target, "person-standing": PersonStanding, timer: Timer,
  "graduation-cap": GraduationCap, moon: Moon, sunset: Sunset, sunrise: Sunrise, zap: Zap, store: Store, clock: Clock, "trending-up": TrendingUp, scale: Scale,
};
export const adaptIcon = (name: string): LucideIcon => ADAPT_ICONS[name] ?? Target;

export function AdaptationList({ items }: { items: { icon: string; text: string }[] }) {
  return (
    <div className="adapt">
      <ul>
        {items.map((a, k) => {
          const Icon = adaptIcon(a.icon);
          return <li key={k}><span className="ai"><Icon /></span><span>{a.text}</span></li>;
        })}
      </ul>
    </div>
  );
}

interface ExerciseLike { name: string; pattern: string | null; sets: number; reps: string; swapped: boolean; replaces: string | null }

/** Warm-up block + exercise rows with animated form thumbnails. */
export function ExerciseList({ warmup, exercises, onGuide }: {
  warmup: { name: string; dose: string }[];
  exercises: ExerciseLike[];
  onGuide: (name: string, pattern: string | null) => void;
}) {
  return (
    <>
      {warmup.length > 0 && (
        <div className="warm">
          <b><Flame />Warm-up, 5 min</b>
          <ul>{warmup.map((w) => <li key={w.name}><span>{w.name}</span><span>{w.dose}</span></li>)}</ul>
        </div>
      )}
      {exercises.map((e) => {
        const pat = e.pattern ?? patOf(e.name);
        return (
          <div className="ex" key={e.name}>
            <span className="exn">
              <ExerciseThumb pattern={pat} name={e.name} onOpen={() => onGuide(e.name, pat)} />
              <span>{e.name}{e.swapped && <span className="tag swap" title={e.replaces ? `Replaces ${e.replaces}` : undefined}>swap</span>}</span>
            </span>
            <span>{e.sets} x {e.reps}</span>
          </div>
        );
      })}
    </>
  );
}

/** "How to do it" sheet: animated correct form vs the most common mistake. */
export function ExerciseGuide({ guide, onClose }: { guide: { name: string; pattern: string | null } | null; onClose: () => void }) {
  const [mode, setMode] = useState<"good" | "bad">("good");
  const p = guide?.pattern ? PATS[guide.pattern] : undefined;
  return (
    <Sheet open={!!guide} onClose={() => { setMode("good"); onClose(); }} wide label={guide ? `How to do ${guide.name}` : "Exercise guide"}>
      {guide && !p && (
        <>
          <p className="sh-k">How to do it</p>
          <h3>{guide.name}</h3>
          <p>A guide for this one is coming soon. Move slowly, keep the range comfortable and stop if anything hurts.</p>
        </>
      )}
      {guide && p && (
        <>
          <p className="sh-k">How to do it</p>
          <h3>{guide.name}</h3>
          <div className="mus" style={{ margin: "8px 0 18px" }}>{p.muscles.map((m) => <span key={m}>{m}</span>)}</div>
          <div className="guide">
            <div className="guide-fig">
              <div className="seg" role="group" aria-label="Show">
                <button type="button" className={mode === "good" ? "on" : ""} aria-pressed={mode === "good"} onClick={() => setMode("good")}>Correct form</button>
                <button type="button" className={mode === "bad" ? "on" : ""} aria-pressed={mode === "bad"} onClick={() => setMode("bad")}>Common mistake</button>
              </div>
              <div className="gsvg"><ExerciseFigure pattern={guide.pattern!} mode={mode} animate rest={1} /></div>
              <div className={`guide-lbl${mode === "bad" ? " bad" : ""}`}>
                {mode === "bad" ? <><CircleAlert />{p.bad_lbl}</> : <><Timer />2 seconds down, 1 second up</>}
              </div>
            </div>
            <div>
              <h4>Setup</h4>
              <p style={{ margin: 0, fontSize: 14 }}>{p.setup}</p>
              <h4>Execution</h4>
              <ol>{p.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              <h4>Avoid</h4>
              <ul className="avoid">{p.avoid.map((s) => <li key={s}>{s}</li>)}</ul>
              {p.note && <p className="help" style={{ marginTop: 12 }}>{p.note}</p>}
            </div>
          </div>
          <p className="fine" style={{ marginTop: 18 }}>In the mistake view, the lime outline shows the correct position.</p>
        </>
      )}
    </Sheet>
  );
}

/** Hook-style helper so pages can open the guide from anywhere. */
export function useGuide() {
  const [guide, setGuide] = useState<{ name: string; pattern: string | null } | null>(null);
  return {
    open: (name: string, pattern: string | null) => setGuide({ name, pattern: pattern ?? patOf(name) }),
    element: <ExerciseGuide guide={guide} onClose={() => setGuide(null)} />,
  };
}

/** Training-days stepper, shared by the plan reveal and the Train tab. */
export function DaysControl({ value, min, max, onChange, busy }: { value: number; min: number; max: number; onChange: (n: number) => void; busy?: boolean }) {
  return (
    <div className="daysctl" role="group" aria-label="Training days per week">
      <button type="button" aria-label="Remove a training day" disabled={busy || value <= min} onClick={() => onChange(value - 1)}><Minus /></button>
      <span className="dv" aria-live="polite"><b>{value}</b>days</span>
      <button type="button" aria-label="Add a training day" disabled={busy || value >= max} onClick={() => onChange(value + 1)}><Plus /></button>
    </div>
  );
}

export function RangeNote({ value, min, max, base }: { value: number; min: number; max: number; base: number }) {
  return (
    <div className="range-note">
      <span className="pips">{[2, 3, 4, 5, 6].map((d) => <span key={d} className={`pip${d === value ? " cur" : d >= min && d <= max ? " in" : ""}`} />)}</span>
      <span>You can run {min} to {max} days, based on the {base} you chose.</span>
    </div>
  );
}
