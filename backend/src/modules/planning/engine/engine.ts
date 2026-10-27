import {
  ACTIVITY_TYPES, CARDIO_LIKE_TO_TYPE, CORE, POOL, RECIPES, SESSION_NAMES, SWAPS,
  equipmentClass, isCoreExercise, patternOf, warmupFor,
} from "./catalog.js";
import type {
  Adaptation, DayMenu, DietInput, Effort, GeneratedPlan, HealthScreening, MealPattern, MealSlot,
  MenuItem, Pace, PlannedExercise, PlannedSession, Projection, Recipe, SessionType, Targets,
  TrainingInput, WeekPlan,
} from "./types.js";

// ── Dates (ISO YYYY-MM-DD, computed in UTC so server and browser agree) ──

const DAY_MS = 86_400_000;
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDaysIso(iso: string, days: number): string {
  return toIsoDate(new Date(parseIsoDate(iso).getTime() + days * DAY_MS));
}
/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(iso: string): number {
  return (parseIsoDate(iso).getUTCDay() + 6) % 7;
}
export function mondayOf(iso: string): string {
  return addDaysIso(iso, -weekdayOf(iso));
}
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime()) / DAY_MS);
}

// ── Safety ────────────────────────────────────────────────────────────

/** spec §4.8.1: any "yes" stops auto-generation. */
export function isScreenedOut(s: HealthScreening): boolean {
  return Object.values(s).some(Boolean);
}

// ── Calories and macros ───────────────────────────────────────────────

const ACTIVITY_FACTOR = { DESK: 1.2, LIGHT: 1.35, ACTIVE: 1.5, VERY_ACTIVE: 1.65 } as const;
export const PACE_RATE: Record<"LOSE_FAT" | "BUILD_MUSCLE", Record<Pace, number>> = {
  LOSE_FAT: { STEADY: 0.005, MODERATE: 0.0075, AMBITIOUS: 0.01 },
  BUILD_MUSCLE: { STEADY: 0.0025, MODERATE: 0.004, AMBITIOUS: 0.005 },
};
const KCAL_PER_KG = 7700;
const BODY_FAT_MID = { MALE: [12, 17, 22, 27, 33], FEMALE: [20, 25, 30, 35, 40] } as const;

/** Mifflin-St Jeor. */
export function bmr(i: Pick<TrainingInput, "sex" | "weightKg" | "heightCm" | "age">): number {
  return 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.age + (i.sex === "FEMALE" ? -161 : 5);
}
export function bodyFatEstimate(i: Pick<TrainingInput, "sex" | "bodyFatLevel">): number | null {
  if (i.bodyFatLevel == null) return null;
  return BODY_FAT_MID[i.sex][Math.max(0, Math.min(4, i.bodyFatLevel))];
}
export function weeklyRateKg(i: Pick<TrainingInput, "goal" | "pace" | "weightKg">): number {
  if ((i.goal !== "LOSE_FAT" && i.goal !== "BUILD_MUSCLE") || !i.pace) return 0;
  return i.weightKg * PACE_RATE[i.goal][i.pace];
}
export function computeTargets(i: TrainingInput, days = i.daysPerWeek): Targets {
  const b = bmr(i);
  const tdee = b * ACTIVITY_FACTOR[i.activityLevel] + (days * i.sessionMinutes * 5.5) / 7;
  let kcal = tdee;
  const rate = weeklyRateKg(i);
  if (i.goal === "LOSE_FAT") kcal = tdee - Math.min((rate * KCAL_PER_KG) / 7, tdee * 0.25);
  else if (i.goal === "BUILD_MUSCLE") kcal = tdee + (rate * KCAL_PER_KG) / 7;
  else if (i.goal === "RECOMP") kcal = tdee * 0.9;
  const floor = i.sex === "FEMALE" ? 1250 : 1500;
  kcal = Math.max(floor, Math.round(kcal / 10) * 10);
  const bf = bodyFatEstimate(i);
  const refW = bf != null && bf >= 25 ? i.weightKg * 0.85 : i.weightKg;
  const perKg = i.goal === "LOSE_FAT" || i.goal === "RECOMP" ? 2.0 : i.goal === "BUILD_MUSCLE" ? 1.8 : 1.6;
  const proteinG = Math.round(refW * perKg);
  const fatG = Math.round((kcal * 0.27) / 9);
  const carbsG = Math.max(60, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { bmr: Math.round(b), tdee: Math.round(tdee), kcal, proteinG, carbsG, fatG };
}
export function computeProjection(i: TrainingInput, startIso: string): Projection | null {
  const rate = weeklyRateKg(i);
  if (!i.targetWeightKg || !rate) return null;
  const diff = Math.abs(i.targetWeightKg - i.weightKg);
  if (diff < 0.8) return null;
  // ×1.08: real progress is slower than the straight-line maths (adherence, water, plateaus).
  const weeks = Math.max(2, Math.ceil((diff / rate) * 1.08));
  return { weeks, weeklyRateKg: Math.round(rate * 100) / 100, endDate: addDaysIso(startIso, weeks * 7) };
}
/** Lowest target we will plan for: BMI 18.5 at the user's height. */
export function healthyMinWeightKg(heightCm: number): number {
  return Math.round(18.5 * (heightCm / 100) ** 2 * 10) / 10;
}

// ── Training ──────────────────────────────────────────────────────────

/** ±1 rule (decision Oct 26): range anchored to the onboarding answer, clamped to 2–6. */
export function dayRange(onboardingDays: number): { min: number; max: number } {
  return { min: Math.max(2, onboardingDays - 1), max: Math.min(6, onboardingDays + 1) };
}

export function splitTypes(n: number, i: Pick<TrainingInput, "split" | "experience" | "fullBodyDay">): SessionType[] {
  const auto: Record<number, SessionType[]> = {
    2: ["FULL", "FULL"],
    3: i.experience === "NEW" ? ["FULL", "FULL", "FULL"] : ["UPPER", "LOWER", "FULL"],
    4: ["UPPER", "LOWER", "UPPER", "LOWER"],
    5: ["UPPER", "LOWER", "PUSH", "PULL", "LEGS"],
    6: ["PUSH", "PULL", "LEGS", "PUSH", "PULL", "LEGS"],
  };
  const ul: Record<number, SessionType[]> = {
    2: ["UPPER", "LOWER"], 3: ["UPPER", "LOWER", "FULL"], 4: ["UPPER", "LOWER", "UPPER", "LOWER"],
    5: ["UPPER", "LOWER", "UPPER", "LOWER", "FULL"], 6: ["UPPER", "LOWER", "UPPER", "LOWER", "UPPER", "LOWER"],
  };
  const focus: Record<number, SessionType[]> = {
    4: ["PUSH", "PULL", "LEGS", "UPPER"], 5: ["PUSH", "PULL", "LEGS", "UPPER", "LOWER"], 6: ["PUSH", "PULL", "LEGS", "PUSH", "PULL", "LEGS"],
  };
  let seq: SessionType[];
  if (i.split === "FULL_BODY") seq = Array(n).fill("FULL");
  else if (i.split === "UPPER_LOWER") seq = ul[n];
  else if (i.split === "MUSCLE_FOCUS" && n >= 4) seq = focus[n];
  else seq = auto[n];
  seq = [...seq];
  if (i.fullBodyDay && n >= 3 && !seq.includes("FULL")) seq[seq.length - 1] = "FULL";
  return seq;
}

function sessionNames(types: SessionType[]): string[] {
  const total: Record<string, number> = {};
  const seen: Record<string, number> = {};
  types.forEach((t) => (total[t] = (total[t] ?? 0) + 1));
  return types.map((t) => {
    seen[t] = (seen[t] ?? 0) + 1;
    return SESSION_NAMES[t] + (total[t] > 1 ? " " + "ABC"[seen[t] - 1] : "");
  });
}

export function splitLabel(types: SessionType[]): string {
  const uniq = [...new Set(types)].map((t) => SESSION_NAMES[t]);
  return uniq.length === 1 ? `${uniq[0]} x${types.length}` : uniq.join(" / ");
}

/**
 * Picks n weekdays, preferring the user's available days and maximising the
 * smallest gap between sessions (so each muscle group gets 48h+).
 */
export function pickDays(n: number, available: number[]): number[] {
  const pool = available.length ? available : [0, 2, 4];
  let best: number[] = [];
  let bestScore = -Infinity;
  for (let m = 0; m < 128; m++) {
    const set: number[] = [];
    for (let d = 0; d < 7; d++) if ((m >> d) & 1) set.push(d);
    if (set.length !== n) continue;
    const nonAvail = set.filter((d) => !pool.includes(d)).length;
    let minGap = 7;
    let consecutive = 0;
    for (let k = 0; k < set.length; k++) {
      const a = set[k], b = set[(k + 1) % set.length];
      const gap = (b - a + 7) % 7 || 7;
      minGap = Math.min(minGap, gap);
      if (gap === 1) consecutive++;
    }
    const score = -nonAvail * 100 + minGap * 12 - consecutive * 3 - set.reduce((x, y) => x + y, 0) * 0.01;
    if (score > bestScore) { bestScore = score; best = set; }
  }
  return best;
}

export function exerciseCount(i: Pick<TrainingInput, "sessionMinutes" | "warmup">): number {
  let n = ({ 30: 4, 45: 5, 60: 6, 75: 7 } as Record<number, number>)[i.sessionMinutes] ?? 5;
  if (i.warmup && i.sessionMinutes <= 45) n -= 1; // the warm-up costs one exercise on short sessions
  return Math.max(3, n);
}

const SEED: Record<SessionType, number> = { UPPER: 0, LOWER: 1, PUSH: 2, PULL: 3, LEGS: 1, FULL: 2 };
export function exercisesFor(type: SessionType, i: TrainingInput, slotIndex = 0): PlannedExercise[] {
  const cls = equipmentClass(i.equipment);
  const list = POOL[cls][type].slice(0, exerciseCount(i));
  const core = CORE[cls].filter((c) => !list.includes(c));
  const seed = SEED[type];
  if (!list.some(isCoreExercise)) list[list.length - 1] = core[seed % core.length];
  if (i.priorityMuscles.includes("CORE") && list.filter(isCoreExercise).length < 2) {
    const extra = core.filter((c) => !list.includes(c));
    if (extra.length) list.push(extra[seed % extra.length]);
  }
  return list.map((orig) => {
    let name = orig;
    let swapped = false;
    for (const inj of i.injuries) {
      const to = SWAPS[inj]?.[name];
      if (to) { name = to; swapped = true; }
    }
    const core = isCoreExercise(name);
    const sets = i.experience === "NEW" ? 2 : slotIndex < 2 ? 4 : 3;
    const compound = /squat|deadlift|press|row|pulldown|pull-up|thrust/i.test(name) && !core;
    const reps = /plank|hollow/i.test(name) ? "30-45 s" : compound && slotIndex < 2 ? "6-10" : "10-15";
    return { name, pattern: patternOf(name), sets, reps, isCore: core, swapped, replaces: swapped ? orig : null };
  });
}

export function restSuggestion(weekdayIdx: number, cardioLikes: string[]): string {
  const likes = cardioLikes.map((c) => CARDIO_LIKE_TO_TYPE[c]).filter(Boolean);
  if (!likes.length) return "Rest or a 30 min walk";
  return `${ACTIVITY_TYPES[likes[weekdayIdx % likes.length]].label}, 30 to 45 min`;
}

export function buildWeek(i: TrainingInput, days = i.daysPerWeek): WeekPlan {
  const types = splitTypes(days, i);
  const names = sessionNames(types);
  const weekdays = pickDays(days, i.availableDays);
  const sessions: PlannedSession[] = weekdays.map((weekday, k) => ({
    weekday,
    type: types[k],
    name: names[k],
    warmup: i.warmup ? warmupFor(types[k]) : [],
    exercises: exercisesFor(types[k], i),
  }));
  const restDays = [0, 1, 2, 3, 4, 5, 6]
    .filter((d) => !weekdays.includes(d))
    .map((weekday) => ({ weekday, suggestion: restSuggestion(weekday, i.cardioLikes) }));
  return { daysPerWeek: days, splitLabel: splitLabel(types), sessions, restDays };
}

/** Suggested starting load in kg, or null for bodyweight/band work. */
const LOAD_FACTOR: Partial<Record<NonNullable<ReturnType<typeof patternOf>>, number>> = {
  squat: 0.55, rdl: 0.55, bench: 0.45, press: 0.12, row: 0.18, pulldown: 0.45, thrust: 0.6, lunge: 0.1,
  curl: 0.08, pushdown: 0.2, raise: 0.05, legext: 0.3, calf: 0.6,
};
export function suggestLoadKg(name: string, i: Pick<TrainingInput, "equipment" | "experience" | "weightKg">): number | null {
  if (equipmentClass(i.equipment) === "bw") return null;
  if (/push-up|bodyweight|plank|dead bug|hollow|dip|band|inverted|superman|bird dog|crunch|knee raise|wall sit|glute bridge|pull-up/i.test(name)) return null;
  const p = patternOf(name);
  const f = p ? LOAD_FACTOR[p] : undefined;
  if (!f) return null;
  const m = { NEW: 0.7, SOME: 1, EXPERIENCED: 1.35 }[i.experience];
  const db = /DB|dumbbell|goblet/i.test(name) || equipmentClass(i.equipment) === "db";
  const kg = i.weightKg * f * m * (db && (p === "squat" || p === "rdl" || p === "thrust") ? 0.35 : 1);
  const step = db ? 1 : 2.5;
  return Math.max(db ? 2 : 5, Math.round(kg / step) * step);
}

export function estimateActivityKcal(type: string, minutes: number, weightKg: number, effort: Effort = "MODERATE"): number {
  const t = ACTIVITY_TYPES[type];
  if (!t || minutes <= 0) return 0;
  const mult = { EASY: 0.8, MODERATE: 1, HARD: 1.2 }[effort];
  return Math.round((t.met * mult * weightKg * minutes) / 60);
}

// ── Nutrition ─────────────────────────────────────────────────────────

export const MEAL_SLOTS: Record<MealPattern, MealSlot[]> = {
  TWO: ["LUNCH", "DINNER"],
  TWO_PLUS_SNACK: ["LUNCH", "SNACK", "DINNER"],
  THREE: ["BREAKFAST", "LUNCH", "DINNER"],
  THREE_PLUS_SNACK: ["BREAKFAST", "LUNCH", "SNACK", "DINNER"],
  THREE_PLUS_TWO_SNACKS: ["BREAKFAST", "SNACK", "LUNCH", "SNACK", "DINNER"],
};

export function recipeFits(rec: Recipe, d: Pick<DietInput, "pattern" | "allergies">): boolean {
  return rec.diets.includes(d.pattern) && !rec.allergens.some((a) => d.allergies.includes(a));
}

/**
 * The menu for a date. Rotates through the user's favourite dishes (falling
 * back to every suitable recipe), never repeats a dish within a day, respects
 * diet and allergens, then scales portions so the day hits the calorie target.
 * `overrides` are user swaps: slotIndex → recipe key.
 */
export function menuFor(
  dateIso: string,
  d: DietInput,
  targets: Pick<Targets, "kcal" | "proteinG">,
  overrides: Record<number, string> = {},
  recipes: Recipe[] = RECIPES,
): DayMenu {
  const slots = MEAL_SLOTS[d.mealPattern];
  const dayNum = Math.floor(parseIsoDate(dateIso).getTime() / DAY_MS);
  const usedDishes = new Set<string>();
  const picks = slots.map((slot, slotIndex) => {
    const forced = overrides[slotIndex] ? recipes.find((x) => x.key === overrides[slotIndex]) : undefined;
    if (forced) { usedDishes.add(forced.dish); return { slot, slotIndex, rec: forced }; }
    const ok = recipes.filter((x) => x.slot === slot && recipeFits(x, d) && !usedDishes.has(x.dish));
    const liked = ok.filter((x) => d.favouriteDishes.includes(x.dish));
    const pool = liked.length ? liked : ok;
    const rec = pool.length
      ? pool[(dayNum + slotIndex) % pool.length]
      : recipes.find((x) => x.slot === slot && x.diets.includes(d.pattern)) ?? recipes.find((x) => x.slot === slot)!;
    usedDishes.add(rec.dish);
    return { slot, slotIndex, rec };
  });
  const raw = picks.reduce((a, p) => a + p.rec.kcal, 0);
  const factor = raw ? targets.kcal / raw : 1;
  const items: MenuItem[] = picks.map(({ slot, slotIndex, rec }) => ({
    slotIndex, slot, recipeKey: rec.key, name: rec.name, portionGuide: rec.portionGuide,
    portionFactor: Math.round(factor * 100) / 100,
    kcal: Math.round((rec.kcal * factor) / 10) * 10,
    proteinG: Math.round(rec.proteinG * factor),
    carbsG: Math.round(rec.carbsG * factor),
    fatG: Math.round(rec.fatG * factor),
  }));
  const protein = items.reduce((a, x) => a + x.proteinG, 0);
  return { date: dateIso, items, proteinShortfallG: Math.max(0, targets.proteinG - protein) };
}

/** Recipes a user can swap into a slot. */
export function swapOptions(slot: MealSlot, d: DietInput, recipes: Recipe[] = RECIPES): Recipe[] {
  return recipes.filter((x) => x.slot === slot && recipeFits(x, d));
}

// ── "Built around your answers" ───────────────────────────────────────

const EQUIPMENT_LABEL = { FULL_GYM: "full gym", SMALL_GYM: "small gym", HOME_GYM: "home gym", DUMBBELLS: "dumbbells", BANDS: "bands", BODYWEIGHT: "bodyweight" } as const;
const INJURY_LABEL = { SHOULDER: "Shoulder", ELBOW: "Elbow", WRIST: "Wrist", LOWER_BACK: "Lower-back", KNEE: "Knee", HIP: "Hip" } as const;

export function adaptations(i: TrainingInput, d: DietInput | null, week: WeekPlan): Adaptation[] {
  const out: Adaptation[] = [];
  const swaps = [...new Set(week.sessions.flatMap((s) => s.exercises.filter((e) => e.swapped).map((e) => e.name)))];
  if (i.injuries.length) {
    out.push({
      icon: "bandage",
      text: `${i.injuries.map((x) => INJURY_LABEL[x]).join(" and ")}-friendly swaps: ` +
        (swaps.length ? `${swaps.slice(0, 3).join(", ").toLowerCase()} replace the standard lifts.` : "range and load are capped on the moves that stress it."),
    });
  }
  out.push({ icon: "dumbbell", text: `Every exercise uses your ${EQUIPMENT_LABEL[i.equipment]} setup.` });
  if (i.warmup) out.push({ icon: "flame", text: "Every session opens with a 5-minute warm-up for the muscles you're training." });
  out.push({
    icon: "target",
    text: i.priorityMuscles.includes("CORE")
      ? "Abs & core in every session, plus an extra core move because you prioritised it."
      : "Abs & core work closes every session.",
  });
  if (i.fullBodyDay) out.push({ icon: "person-standing", text: "Your last session each week is full body, whatever split you run." });
  if (i.sessionMinutes <= 45) out.push({ icon: "timer", text: `Sessions fit ${i.sessionMinutes} minutes: ${exerciseCount(i)} exercises, with supersets on the small ones.` });
  if (i.liftComfort === "NEVER" || i.liftComfort === "LEARNING") out.push({ icon: "graduation-cap", text: "Squat, bench and deadlift start with lighter technique sets and form cues." });
  if (i.sleepHours < 7 || i.sleepQuality === "TIRED") out.push({ icon: "moon", text: `You sleep about ${i.sleepHours} hours, so week 1 starts at the low end of training volume.` });
  const pr = i.priorityMuscles.filter((p) => p !== "CORE");
  if (pr.length) out.push({ icon: "target", text: `Extra sets for ${pr.map((p) => p.toLowerCase()).join(" and ")}, placed early in each session.` });
  if (i.trainTime === "EVENING") out.push({ icon: "sunset", text: "Evening training: your biggest carb portion lands at dinner, after the session." });
  else if (i.trainTime === "EARLY") out.push({ icon: "sunrise", text: "Early training: a light pre-workout snack and a bigger breakfast after." });
  if (i.busyness === "PACKED" || i.blockers.includes("TIME")) out.push({ icon: "zap", text: "Short on time? Every workout has a 20-minute backup version." });
  if (d && (d.struggles.includes("WEEKENDS") || d.struggles.includes("EATING_OUT"))) out.push({ icon: "store", text: "Eating-out guide: best picks at chop bars and restaurants, with portions." });
  if (d && d.fasting === "YES") out.push({ icon: "clock", text: "Meals fit a 16:8 eating window that you can move." });
  return out.slice(0, 8);
}

// ── One-step generation (spec §4.8.7) ──────────────────────────────────

export function generatePlan(i: TrainingInput, d: DietInput, startIso: string, days = i.daysPerWeek): GeneratedPlan {
  const week = buildWeek(i, days);
  const targets = computeTargets(i, days);
  return {
    targets,
    projection: computeProjection(i, startIso),
    week,
    sampleMenu: menuFor(startIso, d, targets),
    adaptations: adaptations(i, d, week),
    dayRange: dayRange(i.daysPerWeek),
  };
}

// ── Copy shared by the welcome email and its in-app preview ───────────────

const DAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function longDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${DAY[weekdayOf(iso)]} ${d} ${MONTH[m - 1]}`;
}

/**
 * The start-date sentence from onboarding-flow.md, e.g.
 * "You start tomorrow, Tuesday 27 October, with Lower. We'll send a reminder tonight."
 */
export function startSentence(todayIso: string, startIso: string, sessions: { weekday: number; name: string }[]): string {
  let first = sessions[0];
  let offset = 0;
  for (let k = 0; k < 7; k++) {
    const hit = sessions.find((s) => s.weekday === weekdayOf(addDaysIso(startIso, k)));
    if (hit) { first = hit; offset = k; break; }
  }
  const firstDate = addDaysIso(startIso, offset);
  const when = offset === 0 ? "" : ` on ${longDate(firstDate)}`;
  if (startIso === todayIso) {
    return offset === 0
      ? `You start today. Your first session, ${first.name}, is ready when you are.`
      : `You start today. It's a rest day, so your first session is ${first.name}${when}.`;
  }
  if (startIso === addDaysIso(todayIso, 1)) return `You start tomorrow, ${longDate(startIso)}, with ${first.name}${when}. We'll send a reminder tonight.`;
  return `You start on ${longDate(startIso)} with ${first.name}${when}. We'll remind you the evening before.`;
}

