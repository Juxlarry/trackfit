import { swapEquipment } from "./swaps.js";

/**
 * Progression offers (README "Exercise ease"): reps then weight, only after
 * steady logging, and always asked before anything changes.
 *
 * A session is steady for an exercise when every planned set was done, it
 * wasn't rated Hard, and it's at the same weight as the session before
 * (bodyweight and band moves: the same reps). With the latest session rated
 * Easy or Okay:
 *   2 or 3 steady in a row → +1 rep per set, up to the top of the range;
 *   4 steady in a row      → the next weight step, reps back to the bottom.
 * Hard twice in a row → about 10% lighter, without waiting. Latest Hard or
 * unrated → hold. Pure, so every rule is unit-tested.
 */

export type Ease = "EASY" | "OKAY" | "HARD";
export type OfferKind = "WEIGHT_UP" | "REPS_UP" | "GOAL" | "LIGHTER";

export interface ExerciseSessionLog {
  /** ISO date-time the workout started; newest first is not assumed. */
  startedAt: string;
  sets: { reps: number; weightKg: number }[];
  ease: Ease | null;
}

export interface ProgressionOffer {
  kind: OfferKind;
  /** Suggested load for every set (kg); null for bodyweight moves. */
  weightKg: number | null;
  /** Suggested reps (or seconds, for timed holds) for every set. */
  reps: number;
  /** Steady sessions in a row behind the offer. */
  steady: number;
  /** Last time's load and reps, for "Keep 40 kg". */
  fromWeightKg: number | null;
  fromReps: number;
}

export const STEADY_FOR_REPS = 2;
export const STEADY_FOR_WEIGHT = 4;
const KG_PER_LB = 0.45359237;

export function repRange(reps: string): { low: number; high: number; timed: boolean } {
  const n = (reps.match(/\d+/g) ?? []).map(Number);
  const timed = /s$/.test(reps.trim());
  if (!n.length) return { low: 10, high: 10, timed };
  return { low: n[0], high: n.length > 1 ? n[1] : n[0], timed };
}

/** The next weight up: +2.5 kg on barbells, machines and cables, +2 kg per dumbbell, +5 lb either way. */
export function weightStep(name: string, kg: number, units: "METRIC" | "IMPERIAL"): number {
  if (units === "IMPERIAL") return Math.round((Math.round(kg / KG_PER_LB) + 5) * KG_PER_LB * 100) / 100;
  const db = /dumbbell/i.test(swapEquipment(name)) || /\bDB\b|dumbbell|goblet/i.test(name);
  const step = db ? 2 : 2.5;
  return Math.round((Math.round(kg / step) * step + step) * 100) / 100;
}

/** About 10% lighter, rounded down to a weight that exists. */
export function lighterStep(name: string, kg: number, units: "METRIC" | "IMPERIAL"): number {
  if (units === "IMPERIAL") return Math.round(Math.max(5, Math.floor((kg * 0.9) / KG_PER_LB / 5) * 5) * KG_PER_LB * 100) / 100;
  const db = /dumbbell/i.test(swapEquipment(name)) || /\bDB\b|dumbbell|goblet/i.test(name);
  const step = db ? 2 : 2.5;
  return Math.max(step, Math.floor((kg * 0.9) / step) * step);
}

const topWeight = (s: ExerciseSessionLog) => Math.max(0, ...s.sets.map((x) => x.weightKg));
const minReps = (s: ExerciseSessionLog) => Math.min(...s.sets.map((x) => x.reps));

export function progressionOffer(
  name: string,
  planned: { sets: number; reps: string },
  history: ExerciseSessionLog[],
  units: "METRIC" | "IMPERIAL" = "METRIC",
): ProgressionOffer | null {
  const logs = history.filter((h) => h.sets.length > 0).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const latest = logs[0];
  if (!latest) return null;
  const { low, high, timed } = repRange(planned.reps);
  const w = topWeight(latest);
  const bodyweight = w <= 0;
  const reps = minReps(latest);
  const base = { fromWeightKg: bodyweight ? null : w, fromReps: reps };

  if (latest.ease === "HARD") {
    if (logs[1]?.ease === "HARD" && !bodyweight) return { kind: "LIGHTER", weightKg: lighterStep(name, w, units), reps: low, steady: 0, ...base };
    return null;
  }
  if (latest.ease === null) return null;

  // Steady sessions in a row, newest first, at the latest weight (or reps, without a weight).
  let steady = 0;
  for (const s of logs) {
    const same = bodyweight ? topWeight(s) <= 0 && minReps(s) === reps : topWeight(s) === w;
    if (!same || s.ease === "HARD" || s.sets.length < planned.sets) break;
    steady++;
  }

  const repStep = timed ? 5 : 1;
  if (steady >= STEADY_FOR_WEIGHT) {
    if (bodyweight) return { kind: "REPS_UP", weightKg: null, reps: reps + 2 * repStep, steady, ...base };
    return { kind: "WEIGHT_UP", weightKg: weightStep(name, w, units), reps: low, steady, ...base };
  }
  if (steady >= STEADY_FOR_REPS) {
    if (bodyweight) return { kind: "REPS_UP", weightKg: null, reps: reps + repStep, steady, ...base };
    if (reps < high) return { kind: "REPS_UP", weightKg: w, reps: Math.min(high, reps + 1), steady, ...base };
    return null;
  }
  const goal = bodyweight || reps < high ? reps + repStep : null;
  return goal === null ? null : { kind: "GOAL", weightKg: bodyweight ? null : w, reps: goal, steady, ...base };
}
