import { ALTERNATES, CORE, POOL, SWAPS, exerciseMeta, isCoreExercise, patternOf } from "./catalog.js";
import type { Equipment, Injury, LiftComfort } from "./types.js";

/**
 * Exercise swaps (README "Exercise swaps"). A swap changes the exercise and
 * nothing else: same family (what it trains, and how), equipment the member
 * has, nothing their injuries or lift comfort rule out, nothing already in the
 * session, and only TrackFit's own library. Pure, shared by the API and the app.
 */

export type Family =
  | "squat" | "hinge" | "glutes" | "calves"
  | "chestPress" | "chestFly" | "row" | "verticalPull" | "shoulderPress" | "sideDelts" | "rearDelts" | "backExtension"
  | "biceps" | "triceps" | "core";

/** Added so dumbbell, band and bodyweight members have real options (README "Library additions"). */
export const SWAP_EXTRAS = [
  "Seated DB calf raise", "Tempo calf raise", "DB fly", "Band fly", "Band pullover", "Band lateral raise",
  "Prone Y-T raise", "Reverse snow angel", "Prone back extension", "DB overhead triceps extension", "Frog pump", "Slider leg curl",
  "Leaning DB lateral raise", "Elevated pike push-up", "Band shoulder press", "Band hammer curl", "Towel curl", "Doorway row",
  "Bodyweight good morning", "Prone W raise", "Floor DB pullover",
];

/** What each exercise trains, and how. Finer than muscle groups: a leg curl never becomes a squat. */
const FAMILY: Record<string, Family> = {
  // Quads: squats, lunges and their machines.
  "Back squat": "squat", "Leg press": "squat", "Leg press, short range": "squat", "Goblet squat": "squat", "Tempo bodyweight squat": "squat",
  "Box squat to bench": "squat", "Box squat to chair": "squat", "Wall sit": "squat", "Walking lunge": "squat", "Reverse lunge": "squat",
  "Split squat": "squat", "Bulgarian split squat": "squat", "Step-up": "squat", "Leg extension": "squat",
  // Hamstrings: hinges and curls.
  "Romanian deadlift": "hinge", "DB Romanian deadlift": "hinge", "Single-leg RDL": "hinge", "Lying leg curl": "hinge", "Slider leg curl": "hinge",
  "Bodyweight good morning": "hinge",
  "Hip thrust": "glutes", "DB hip thrust": "glutes", "Glute bridge": "glutes", "Single-leg glute bridge": "glutes", "Frog pump": "glutes",
  "Standing calf raise": "calves", "Calf raise": "calves", "Single-leg calf raise": "calves", "Seated DB calf raise": "calves", "Tempo calf raise": "calves",
  "Bench press": "chestPress", "DB bench press": "chestPress", "Incline DB press": "chestPress", "Neutral-grip DB press": "chestPress",
  "Machine chest press": "chestPress", "Band chest press": "chestPress", "Push-up": "chestPress", "Push-up on fists or handles": "chestPress",
  "Incline push-up": "chestPress", "Incline push-up on handles": "chestPress", "Decline push-up": "chestPress",
  "Cable fly": "chestFly", "DB floor fly": "chestFly", "DB fly": "chestFly", "Band fly": "chestFly",
  "One-arm DB row": "row", "Barbell row": "row", "Chest-supported DB row": "row", "Chest-supported row": "row", "Seated cable row": "row",
  "Band row": "row", "Inverted table row": "row", "Doorway row": "row",
  "Lat pulldown": "verticalPull", "Neutral-grip pulldown": "verticalPull", "Pull-up or assisted pull-up": "verticalPull", "DB pullover": "verticalPull",
  "Band pullover": "verticalPull", "Floor DB pullover": "verticalPull",
  "Overhead press": "shoulderPress", "DB shoulder press": "shoulderPress", "Seated DB shoulder press": "shoulderPress",
  "High-incline DB press": "shoulderPress", "Landmine press": "shoulderPress", "Pike push-up": "shoulderPress",
  "Elevated pike push-up": "shoulderPress", "Band shoulder press": "shoulderPress",
  "Cable lateral raise": "sideDelts", "DB lateral raise": "sideDelts", "Band lateral raise": "sideDelts", "Leaning DB lateral raise": "sideDelts",
  "Face pull": "rearDelts", "Band face pull": "rearDelts", "Rear-delt fly": "rearDelts", "Rear-delt raise": "rearDelts", "Band pull-apart": "rearDelts",
  "Prone Y-T raise": "rearDelts", "Prone W raise": "rearDelts",
  "Superman hold": "backExtension", "Reverse snow angel": "backExtension", "Prone back extension": "backExtension",
  "DB curl": "biceps", "EZ-bar curl": "biceps", "Hammer curl": "biceps", "Light hammer curl": "biceps", "Band curl": "biceps",
  "Band hammer curl": "biceps", "Towel curl": "biceps",
  "Rope pushdown": "triceps", "Band pushdown": "triceps", "DB skull crusher": "triceps", "Overhead triceps extension": "triceps",
  "DB overhead triceps extension": "triceps", "Chair dip": "triceps", "Diamond push-up": "triceps", "Close-grip push-up": "triceps",
};

// Lookups ignore case: the original exercise library spells some names differently ("Lat Pulldown").
const lower = <T,>(m: Record<string, T>) => new Map(Object.entries(m).map(([k, v]) => [k.toLowerCase(), v]));
const FAMILY_LC = lower(FAMILY);

export function familyOf(name: string): Family | null {
  const f = FAMILY_LC.get(name.trim().toLowerCase());
  if (f) return f;
  return isCoreExercise(name) || /bird dog/i.test(name) ? "core" : null;
}

/** Where exerciseMeta's name-based guess is wrong for swapping (e.g. "Calf raise" isn't a machine). */
const EQUIPMENT_FIX: Record<string, string> = {
  "Calf raise": "Bodyweight", "Tempo calf raise": "Bodyweight", "Slider leg curl": "Bodyweight", "Box squat to chair": "Bodyweight",
  "Chest-supported row": "Machine", "Rear-delt fly": "Dumbbell", "Rear-delt raise": "Dumbbell", "Overhead triceps extension": "Cable",
  "Hammer curl": "Dumbbell", "Light hammer curl": "Dumbbell", "Side bend": "Dumbbell",
  // Both need a bar or a station: gym kit, not bodyweight anywhere.
  "Pull-up or assisted pull-up": "Machine", "Hanging knee raise": "Machine",
  "Towel curl": "Bodyweight", "Doorway row": "Bodyweight", "Bodyweight good morning": "Bodyweight",
};
const EQUIPMENT_FIX_LC = lower(EQUIPMENT_FIX);
export const swapEquipment = (name: string) => EQUIPMENT_FIX_LC.get(name.trim().toLowerCase()) ?? exerciseMeta(name).equipment;

/** Equipment each onboarding answer covers. Small gym: machines only if the plan already uses that one. */
const ALLOWED: Record<Equipment, string[]> = {
  FULL_GYM: ["Barbell", "Machine", "Cable", "Dumbbell", "Band", "Bodyweight"],
  SMALL_GYM: ["Barbell", "Cable", "Dumbbell", "Band", "Bodyweight"],
  HOME_GYM: ["Barbell", "Dumbbell", "Band", "Bodyweight"],
  DUMBBELLS: ["Dumbbell", "Bodyweight"],
  BANDS: ["Band", "Bodyweight"],
  BODYWEIGHT: ["Bodyweight"],
};

/** Narrowing for the day: a busy gym, or training away. */
export type SwapFilter = "ANY" | "DUMBBELLS" | "BODYWEIGHT";
const FILTER: Record<Exclude<SwapFilter, "ANY">, string[]> = { DUMBBELLS: ["Dumbbell", "Bodyweight"], BODYWEIGHT: ["Bodyweight"] };

/** The filter chips worth showing: only ones that narrow what this member has. */
export function swapFilters(equipment: Equipment): SwapFilter[] {
  const have = ALLOWED[equipment];
  const out: SwapFilter[] = ["ANY"];
  if (have.includes("Dumbbell") && have.length > 2) out.push("DUMBBELLS");
  if (have.length > 1) out.push("BODYWEIGHT");
  return out;
}

/** Everything a swap can offer: the generator's exercises, its alternates, and the additions. */
export const SWAP_LIBRARY: string[] = [...new Set([
  ...Object.values(POOL).flatMap((c) => Object.values(c).flat()),
  ...Object.values(CORE).flat(),
  ...Object.values(SWAPS).flatMap((m) => Object.values(m)),
  ...Object.values(ALTERNATES).flatMap((m) => Object.values(m).flat()),
  ...SWAP_EXTRAS,
])].filter((n) => familyOf(n) !== null);

/** Barbell squat, bench and deadlift: kept out for "I avoid them". */
const AVOIDED_LIFTS = new Set(["back squat", "bench press", "romanian deadlift"]);

export interface SwapContext {
  equipment: Equipment;
  injuries: Injury[];
  liftComfort: LiftComfort;
  /** The session's exercises: none is offered twice. */
  sessionExercises: string[];
  /** The whole week's exercises (a small gym's machines count only if the plan uses them). */
  planExercises: string[];
  only?: SwapFilter;
}

export interface ExerciseSwapOption {
  name: string;
  equipment: string;
  /** Same movement pattern (and illustration family) as the planned exercise. */
  sameMovement: boolean;
  reason: string;
}

const EQUIPMENT_WORD: Record<string, string> = {
  Barbell: "a barbell", Machine: "a machine", Cable: "the cable", Dumbbell: "dumbbells", Band: "a band", Bodyweight: "bodyweight",
};

/** Up to `limit` options for swapping `name`, best first. Empty when the library has nothing that fits. */
export function exerciseSwapOptions(name: string, ctx: SwapContext, limit = 6): ExerciseSwapOption[] {
  const family = familyOf(name);
  if (!family) return [];
  const have = ALLOWED[ctx.equipment].filter((e) => !ctx.only || ctx.only === "ANY" || FILTER[ctx.only].includes(e));
  const banned = new Set(ctx.injuries.flatMap((i) => Object.keys(SWAPS[i] ?? {})).map((n) => n.toLowerCase()));
  if (ctx.liftComfort === "AVOID") AVOIDED_LIFTS.forEach((n) => banned.add(n));
  const inSession = new Set(ctx.sessionExercises.map((n) => n.toLowerCase()));
  const inPlan = new Set(ctx.planExercises.map((n) => n.toLowerCase()));
  const self = name.trim().toLowerCase();
  inSession.add(self);
  const pattern = patternOf(name);
  const fromEq = swapEquipment(name);

  return SWAP_LIBRARY
    .filter((n) => familyOf(n) === family && !inSession.has(n.toLowerCase()) && !banned.has(n.toLowerCase()))
    .filter((n) => {
      const eq = swapEquipment(n);
      if (!have.includes(eq)) return ctx.equipment === "SMALL_GYM" && eq === "Machine" && inPlan.has(n.toLowerCase()) && (!ctx.only || ctx.only === "ANY");
      return true;
    })
    .map((n, k) => {
      const eq = swapEquipment(n);
      const same = patternOf(n) === pattern;
      const how = eq === fromEq ? `same equipment` : `${EQUIPMENT_WORD[eq]} instead of ${EQUIPMENT_WORD[fromEq]}`;
      return { k, option: { name: n, equipment: eq, sameMovement: same, reason: same ? `Same movement, ${how}` : `Same muscles, ${how}` } };
    })
    // Same movement first, then same kit, then library order.
    .sort((a, b) => Number(b.option.sameMovement) - Number(a.option.sameMovement)
      || Number(b.option.equipment === fromEq) - Number(a.option.equipment === fromEq) || a.k - b.k)
    .slice(0, limit)
    .map((x) => x.option);
}
