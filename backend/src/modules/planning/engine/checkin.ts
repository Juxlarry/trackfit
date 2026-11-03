import { isMainLift } from "./catalog.js";
import { addDaysIso, buildWeek, computeTargets, dayRange, daysBetween, healthyMinWeightKg, weeklyRateKg } from "./engine.js";
import type { BuildOptions, Targets, TrainingInput, WeekPlan } from "./types.js";

/**
 * The week-6 check-in: what the cycle achieved, three answers, and the rules
 * that turn them into the next cycle. Pure, so every rule is unit-tested.
 *
 * Calories: recalculated from the new weight, then corrected against the
 * planned pace (less than half → 150 kcal tighter, more than 1.5× → 150
 * looser). "Hard to follow" eating never tightens. The correction carries
 * over from cycle to cycle (capped at ±450) and the safety floors still apply.
 * Training: days as chosen (one fewer suggested under 60% of sessions done);
 * too easy → +1 set on main lifts, too hard → −1 set on accessories;
 * accessories rotate, main lifts stay; starting weights come from weeks 5-6.
 */

export const CHECKIN_OPENS_DAY = 40;
const CYCLE_WEEKS = 6;
const KCAL_STEP = 150;
const MAX_OFFSET = 450;

export type WorkoutFeel = "TOO_EASY" | "ABOUT_RIGHT" | "TOO_HARD";
export type EatingAdherence = "MOST_DAYS" | "SOME_DAYS" | "HARD";
export type GoalChoice = "NEW_TARGET" | "MAINTAIN";

export interface CheckinAnswers {
  feel: WorkoutFeel;
  eating: EatingAdherence;
  days: number;
  /** Only when the goal weight was reached. */
  goalChoice?: GoalChoice | null;
  newTargetKg?: number | null;
  /** Last cycle's exercises to keep instead of rotating. */
  keep?: string[];
}

export interface LoggedSet { name: string; date: string; weightKg: number; reps: number }

export interface CycleInput {
  training: TrainingInput;
  startDate: string;
  endDate: string;
  today: string;
  weights: { date: string; kg: number }[];
  /** Dates in the cycle that had a planned session (after swaps). */
  plannedDates: string[];
  /** Dates with any logged workout. */
  workoutDates: string[];
  sets: LoggedSet[];
}

export interface CycleResults {
  startKg: number;
  /** 7-day average at the end of the cycle; null with no weigh-ins near the end. */
  endKg: number | null;
  changeKg: number | null;
  /** Signed change the plan aimed for over 6 weeks (0 for maintain, recomp, fitness). */
  plannedChangeKg: number;
  sessionsPlanned: number;
  sessionsDone: number;
  adherence: number;
  bestLift: { name: string; fromKg: number; toKg: number } | null;
  /** No weigh-in in the last 3 days: ask for one before the results. */
  needsWeighIn: boolean;
  goalReached: boolean;
  suggestedDays: number;
  /** When the goal was reached: a next target in the same direction, or null if a healthy one doesn't exist. */
  suggestedTargetKg: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const between = (d: string, from: string, to: string) => d >= from && d <= to;

export function checkinOpen(startDate: string, today: string): boolean {
  return daysBetween(startDate, today) >= CHECKIN_OPENS_DAY;
}

export function cycleResults(c: CycleInput, currentDays: number, onboardingDays: number): CycleResults {
  const t = c.training;
  const last = c.today < c.endDate ? c.today : c.endDate;
  const near = (from: string, to: string) => c.weights.filter((w) => between(w.date, from, to)).map((w) => w.kg);
  const first = near(addDaysIso(c.startDate, -3), addDaysIso(c.startDate, 6));
  const startKg = round1(first.length ? avg(first) : t.weightKg);
  const end = near(addDaysIso(c.endDate, -6), c.today);
  const endKg = end.length ? round1(avg(end)) : null;
  const sign = t.goal === "LOSE_FAT" ? -1 : t.goal === "BUILD_MUSCLE" ? 1 : 0;
  const plannedChangeKg = round1(sign * weeklyRateKg({ ...t, weightKg: startKg }) * CYCLE_WEEKS);

  const planned = c.plannedDates.filter((d) => between(d, c.startDate, last));
  const done = new Set(c.workoutDates.filter((d) => between(d, c.startDate, c.today)));
  const sessionsDone = Math.min(planned.length, done.size);
  const adherence = planned.length ? sessionsDone / planned.length : 0;

  // Heaviest set per main lift: weeks 1-2 against weeks 5-6.
  let bestLift: CycleResults["bestLift"] = null;
  const early = addDaysIso(c.startDate, 13), late = addDaysIso(c.startDate, 28);
  for (const name of new Set(c.sets.filter((s) => isMainLift(s.name) && s.weightKg > 0).map((s) => s.name))) {
    const top = (from: string, to: string) => Math.max(0, ...c.sets.filter((s) => s.name === name && between(s.date, from, to)).map((s) => s.weightKg));
    const fromKg = top(c.startDate, early), toKg = top(late, c.today);
    if (fromKg > 0 && toKg > fromKg && (!bestLift || toKg - fromKg > bestLift.toKg - bestLift.fromKg)) bestLift = { name, fromKg, toKg };
  }

  const target = t.targetWeightKg;
  const goalReached = endKg != null && target != null
    && ((t.goal === "LOSE_FAT" && endKg <= target + 0.5) || (t.goal === "BUILD_MUSCLE" && endKg >= target - 0.5));
  let suggestedTargetKg: number | null = null;
  if (goalReached && endKg != null) {
    const step = weeklyRateKg({ ...t, weightKg: endKg }) * CYCLE_WEEKS;
    const next = round1(t.goal === "LOSE_FAT" ? Math.max(healthyMinWeightKg(t.heightCm), endKg - step) : endKg + step);
    suggestedTargetKg = Math.abs(next - endKg) >= 1 ? next : null;
  }

  const range = dayRange(onboardingDays);
  return {
    startKg, endKg, changeKg: endKg == null ? null : round1(endKg - startKg), plannedChangeKg,
    sessionsPlanned: planned.length, sessionsDone, adherence,
    bestLift, needsWeighIn: !c.weights.some((w) => between(w.date, addDaysIso(c.today, -2), c.today)),
    goalReached, suggestedDays: adherence < 0.6 ? Math.max(range.min, currentDays - 1) : currentDays, suggestedTargetKg,
  };
}

export interface CycleChange { icon: string; title: string; why: string }

export interface NextCycle {
  training: TrainingInput;
  days: number;
  kcalOffset: number;
  buildOptions: BuildOptions;
  week: WeekPlan;
  targets: Targets;
  /** Starting weight per exercise name, from weeks 5-6. */
  loads: Record<string, number>;
  changes: CycleChange[];
}

/** Calorie correction from the pace actually achieved. Returns the change, not the running total. */
export function kcalCorrection(goal: TrainingInput["goal"], r: CycleResults, eating: EatingAdherence): { delta: number; why: string } {
  if (r.endKg == null || r.changeKg == null) return { delta: 0, why: "No weigh-ins near the end of the cycle, so calories only follow your new weight." };
  if (r.goalReached) return { delta: 0, why: "You reached your goal on these calories." };
  const kg = (n: number) => `${n > 0 ? "+" : ""}${n} kg`;
  if (goal === "LOSE_FAT" || goal === "BUILD_MUSCLE") {
    const ratio = r.plannedChangeKg ? r.changeKg / r.plannedChangeKg : 1;
    const slower = goal === "LOSE_FAT" ? -KCAL_STEP : KCAL_STEP;
    const pace = `${kg(r.changeKg)} against a planned ${kg(r.plannedChangeKg)}`;
    if (ratio > 1.5) return { delta: -slower, why: `${pace}: faster than is sustainable, so a little more food.` };
    if (ratio < 0.5) {
      if (eating === "MOST_DAYS") return { delta: slower, why: `${pace} while eating to plan most days, so a small ${goal === "LOSE_FAT" ? "cut" : "increase"}.` };
      return { delta: 0, why: `${pace}. Calories stay put: eating to plan more days will move it before any ${goal === "LOSE_FAT" ? "cut" : "increase"} would.` };
    }
    return { delta: 0, why: `${pace}: right on track.` };
  }
  if (r.changeKg > 1) return { delta: -KCAL_STEP, why: `Your weight went up ${r.changeKg} kg, so a little less food to hold it.` };
  if (r.changeKg < -1) return { delta: KCAL_STEP, why: `Your weight went down ${-r.changeKg} kg, so a little more food to hold it.` };
  return { delta: 0, why: "Your weight held steady." };
}

const topReps = (reps: string) => Number(/(\d+)\s*$/.exec(reps.replace(/\s*s$/, ""))?.[1] ?? 0);
const isLowerBody = (name: string) => /squat|deadlift|rdl|lunge|leg|calf|thrust|bridge|step-up/i.test(name);

/** Weeks 5-6 heaviest set per exercise; +2.5 kg lower body / +1.25 kg upper where it hit the top of the rep range. */
export function nextLoads(week: WeekPlan, sets: LoggedSet[], startDate: string, today: string): Record<string, number> {
  const out: Record<string, number> = {};
  const recent = sets.filter((s) => s.weightKg > 0 && between(s.date, addDaysIso(startDate, 28), today));
  for (const e of week.sessions.flatMap((s) => s.exercises)) {
    const mine = recent.filter((s) => s.name === e.name);
    if (!mine.length || e.isCore) continue;
    const heaviest = Math.max(...mine.map((s) => s.weightKg));
    const hitTop = mine.some((s) => s.weightKg === heaviest && s.reps >= topReps(e.reps));
    out[e.name] = hitTop ? heaviest + (isLowerBody(e.name) ? 2.5 : 1.25) : heaviest;
  }
  return out;
}

export function planNextCycle(p: {
  training: TrainingInput;
  results: CycleResults;
  answers: CheckinAnswers;
  onboardingDays: number;
  currentDays: number;
  cycleNumber: number;
  currentKcal: number;
  prevKcalOffset: number;
  sets: LoggedSet[];
  startDate: string;
  today: string;
}): NextCycle {
  const { results: r, answers: a } = p;
  const changes: CycleChange[] = [];
  const training: TrainingInput = { ...p.training, weightKg: r.endKg ?? p.training.weightKg, daysPerWeek: a.days };

  if (r.goalReached && a.goalChoice === "MAINTAIN") {
    training.goal = "RECOMP";
    training.targetWeightKg = null;
    changes.push({ icon: "trophy", title: `Hold ${training.weightKg} kg, keep getting stronger`, why: "You reached your goal. Now the focus is strength and shape at this weight." });
  } else if (r.goalReached && a.newTargetKg) {
    training.targetWeightKg = a.newTargetKg;
    changes.push({ icon: "trophy", title: `New target: ${a.newTargetKg} kg`, why: `You reached ${p.training.targetWeightKg} kg. Same pace, next milestone.` });
  }

  const goalChanged = training.goal !== p.training.goal;
  const corr = goalChanged ? { delta: 0, why: "New goal, new calorie target." } : kcalCorrection(p.training.goal, r, a.eating);
  const kcalOffset = goalChanged ? 0 : Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, p.prevKcalOffset + corr.delta));
  const targets = computeTargets(training, a.days, kcalOffset);
  const kcalWhy = a.eating === "HARD" && corr.delta === 0 && !goalChanged
    ? `${corr.why} You said eating to plan was hard, so the target doesn't get stricter. Swap meals freely in Fuel.`
    : corr.why;
  changes.push({
    icon: "flame",
    title: targets.kcal === p.currentKcal ? `Calories stay at ${targets.kcal.toLocaleString("en-GB")} a day` : `Calories: ${p.currentKcal.toLocaleString("en-GB")} → ${targets.kcal.toLocaleString("en-GB")} a day`,
    why: kcalWhy,
  });

  if (a.days !== p.currentDays) {
    changes.push({
      icon: "calendar",
      title: `${p.currentDays} → ${a.days} training days a week`,
      why: a.days < p.currentDays
        ? `You did ${r.sessionsDone} of ${r.sessionsPlanned} sessions. Fewer days you'll actually do beat more you'll skip.`
        : "You asked for more. The extra day adds volume to every muscle group.",
    });
  }

  const buildOptions: BuildOptions = { cycle: p.cycleNumber + 1, keep: a.keep ?? [] };
  if (a.feel === "TOO_EASY") {
    buildOptions.mainSetDelta = 1;
    changes.push({ icon: "dumbbell", title: "One more set on your main lifts", why: "You said cycle " + p.cycleNumber + " felt too easy." });
  } else if (a.feel === "TOO_HARD") {
    buildOptions.accessorySetDelta = -1;
    changes.push({ icon: "dumbbell", title: "One fewer set on accessory exercises", why: "You said it felt too hard. Main lifts keep their sets so you keep getting stronger." });
  }

  const week = buildWeek(training, a.days, buildOptions);
  const rotated = new Set(week.sessions.flatMap((s) => s.exercises.filter((e) => e.rotatedFrom).map((e) => e.name)));
  if (rotated.size) {
    changes.push({ icon: "repeat", title: `${rotated.size} new accessory exercise${rotated.size > 1 ? "s" : ""}`, why: "Same muscles, a fresh angle. Your main lifts stay the same so progress stays comparable." });
  }

  const loads = nextLoads(week, p.sets, p.startDate, p.today);
  const heavier = week.sessions.flatMap((s) => s.exercises).filter((e, k, all) => all.findIndex((x) => x.name === e.name) === k)
    .filter((e) => { const prev = Math.max(0, ...p.sets.filter((s) => s.name === e.name && between(s.date, addDaysIso(p.startDate, 28), p.today)).map((s) => s.weightKg)); return loads[e.name] > prev; });
  if (heavier.length) {
    changes.push({ icon: "trending-up", title: `Heavier starting weights on ${heavier.length} exercise${heavier.length > 1 ? "s" : ""}`, why: "You hit the top of the rep range in weeks 5-6." });
  }

  return { training, days: a.days, kcalOffset, buildOptions, week, targets, loads, changes };
}
