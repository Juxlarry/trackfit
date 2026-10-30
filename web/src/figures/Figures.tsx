import { useEffect, useRef, useState } from "react";
import { bodyFig, drawFig, PATS, type FigMode } from "./figureEngine";

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Animated exercise figure. `pattern` is a figure key from patOf(exerciseName).
 * Loops a rep every 2.8 s while `animate` is true; static otherwise or when
 * the user prefers reduced motion.
 */
export function ExerciseFigure({ pattern, mode = "good", animate = false, rest = 0.6, className, label }: {
  pattern: string;
  mode?: FigMode;
  animate?: boolean;
  /** Pose shown when not animating, 0 = start, 1 = end. */
  rest?: number;
  className?: string;
  label?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = ref.current;
    if (!svg || !PATS[pattern]) return;
    if (!animate || reduceMotion()) {
      svg.innerHTML = drawFig(pattern, mode, animate ? 1 : rest);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const loop = (t: number) => {
      const phase = ((t - t0) % 2800) / 2800;
      svg.innerHTML = drawFig(pattern, mode, 0.5 - 0.5 * Math.cos(phase * 2 * Math.PI));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pattern, mode, animate, rest]);
  if (!PATS[pattern]) return null;
  return <svg ref={ref} className={`figsvg${PATS[pattern].front ? " front" : ""} ${className ?? ""}`} viewBox="0 -20 240 206" role="img"
    aria-label={label ?? (mode === "bad" ? `Common mistake: ${PATS[pattern].bad_lbl}` : "Correct form")} />;
}

/** Small thumbnail that animates on hover and opens the guide on click. */
export function ExerciseThumb({ pattern, name, onOpen, className }: { pattern: string | null; name: string; onOpen?: (name: string) => void; className?: string }) {
  const [hover, setHover] = useState(false);
  if (!pattern || !PATS[pattern]) return <span className={`thumb ${className ?? ""}`} aria-hidden="true" />;
  return (
    <button type="button" className={`thumb ${className ?? ""}`} aria-label={`How to do ${name}`}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}
      onClick={(e) => { e.stopPropagation(); onOpen?.(name); }}>
      <ExerciseFigure pattern={pattern} animate={hover} />
    </button>
  );
}

export function BodyFigure({ level, sex }: { level: number; sex: "MALE" | "FEMALE" }) {
  return <span aria-hidden="true" style={{ display: "block" }} dangerouslySetInnerHTML={{ __html: bodyFig(level, sex === "FEMALE" ? "f" : "m") }} />;
}
