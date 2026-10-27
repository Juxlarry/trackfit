import type {
  ActivityKind,
  Allergen,
  DietPattern,
  Equipment,
  Injury,
  MovementPattern,
  Recipe,
  SessionType,
  WarmupItem,
} from "./types.js";

/** Equipment buckets the exercise pools are written for. */
export type EquipmentClass = "gym" | "db" | "bw";
export function equipmentClass(e: Equipment): EquipmentClass {
  if (e === "FULL_GYM" || e === "SMALL_GYM") return "gym";
  if (e === "HOME_GYM" || e === "DUMBBELLS") return "db";
  return "bw";
}

/** Ordered exercise pools per equipment class and session type. Order = priority. */
export const POOL: Record<EquipmentClass, Record<SessionType, string[]>> = {
  gym: {
    UPPER: ["Bench press", "Lat pulldown", "Seated DB shoulder press", "Chest-supported row", "Cable lateral raise", "EZ-bar curl", "Rope pushdown"],
    LOWER: ["Back squat", "Romanian deadlift", "Leg press", "Walking lunge", "Lying leg curl", "Standing calf raise", "Cable crunch"],
    PUSH: ["Incline DB press", "Machine chest press", "Overhead press", "Cable lateral raise", "Cable fly", "Overhead triceps extension", "Rope pushdown"],
    PULL: ["Pull-up or assisted pull-up", "Barbell row", "Seated cable row", "Face pull", "Rear-delt fly", "Hammer curl", "EZ-bar curl"],
    LEGS: ["Back squat", "Romanian deadlift", "Bulgarian split squat", "Leg extension", "Lying leg curl", "Standing calf raise", "Hanging knee raise"],
    FULL: ["Goblet squat", "Bench press", "Lat pulldown", "Romanian deadlift", "Seated DB shoulder press", "Cable crunch", "Hammer curl"],
  },
  db: {
    UPPER: ["DB bench press", "One-arm DB row", "DB shoulder press", "Push-up", "DB lateral raise", "DB curl", "DB skull crusher"],
    LOWER: ["Goblet squat", "DB Romanian deadlift", "Reverse lunge", "DB hip thrust", "Step-up", "Single-leg calf raise", "Dead bug"],
    PUSH: ["DB bench press", "Incline push-up", "DB shoulder press", "DB lateral raise", "DB floor fly", "DB skull crusher", "Close-grip push-up"],
    PULL: ["One-arm DB row", "Chest-supported DB row", "DB pullover", "Rear-delt raise", "DB curl", "Hammer curl", "Superman hold"],
    LEGS: ["Goblet squat", "DB Romanian deadlift", "Bulgarian split squat", "DB hip thrust", "Step-up", "Single-leg calf raise", "Dead bug"],
    FULL: ["Goblet squat", "DB bench press", "One-arm DB row", "DB Romanian deadlift", "DB shoulder press", "Dead bug", "DB curl"],
  },
  bw: {
    UPPER: ["Push-up", "Inverted table row", "Pike push-up", "Band pull-apart", "Chair dip", "Band curl", "Plank shoulder tap"],
    LOWER: ["Tempo bodyweight squat", "Split squat", "Glute bridge", "Single-leg RDL", "Wall sit", "Calf raise", "Dead bug"],
    PUSH: ["Push-up", "Pike push-up", "Decline push-up", "Chair dip", "Band chest press", "Plank shoulder tap", "Diamond push-up"],
    PULL: ["Inverted table row", "Band row", "Band pull-apart", "Superman hold", "Band curl", "Band face pull", "Hollow hold"],
    LEGS: ["Tempo bodyweight squat", "Bulgarian split squat", "Single-leg glute bridge", "Single-leg RDL", "Wall sit", "Calf raise", "Dead bug"],
    FULL: ["Tempo bodyweight squat", "Push-up", "Inverted table row", "Glute bridge", "Pike push-up", "Dead bug", "Split squat"],
  },
};

/** Guaranteed core work per equipment class (onboarding-flow.md: "Abs & core in every session"). */
export const CORE: Record<EquipmentClass, string[]> = {
  gym: ["Cable crunch", "Hanging knee raise", "Dead bug", "Pallof press"],
  db: ["Dead bug", "Reverse crunch", "Plank", "Side bend"],
  bw: ["Dead bug", "Reverse crunch", "Plank", "Hollow hold"],
};
export const isCoreExercise = (name: string) => /crunch|knee raise|dead bug|plank|hollow|pallof|side bend/i.test(name);

/** Injury-driven substitutions. Applied in injury order; later swaps can chain. */
export const SWAPS: Record<Injury, Record<string, string>> = {
  KNEE: {
    "Back squat": "Box squat to bench", "Walking lunge": "Hip thrust", "Bulgarian split squat": "Glute bridge",
    "Reverse lunge": "DB hip thrust", "Split squat": "Glute bridge", "Leg extension": "Leg press, short range",
    "Step-up": "DB hip thrust", "Wall sit": "Single-leg glute bridge", "Goblet squat": "Box squat to bench",
    "Tempo bodyweight squat": "Box squat to chair",
  },
  LOWER_BACK: {
    "Romanian deadlift": "Hip thrust", "Barbell row": "Chest-supported row", "Back squat": "Leg press",
    "DB Romanian deadlift": "DB hip thrust", "Single-leg RDL": "Glute bridge", "Superman hold": "Bird dog",
  },
  SHOULDER: {
    "Overhead press": "Landmine press", "Seated DB shoulder press": "Landmine press", "DB shoulder press": "High-incline DB press",
    "Pike push-up": "Incline push-up", "Chair dip": "Band pushdown", "Bench press": "Neutral-grip DB press",
    "Pull-up or assisted pull-up": "Neutral-grip pulldown",
  },
  ELBOW: {
    "EZ-bar curl": "Light hammer curl", "DB skull crusher": "Band pushdown", "Overhead triceps extension": "Rope pushdown",
    "Diamond push-up": "Incline push-up", "Close-grip push-up": "Incline push-up",
  },
  WRIST: {
    "Push-up": "Push-up on fists or handles", "Plank shoulder tap": "Forearm plank", "Decline push-up": "Incline push-up on handles",
  },
  HIP: {
    "Bulgarian split squat": "Leg press, short range", "Walking lunge": "Leg press, short range", "Reverse lunge": "Box squat to bench",
    "Split squat": "Box squat to chair", "Single-leg RDL": "Glute bridge",
  },
};

export const WARMUPS: Record<"upper" | "lower" | "full", WarmupItem[]> = {
  upper: [
    { name: "Arm circles", dose: "30 s each way" }, { name: "Band pull-apart", dose: "15 reps" },
    { name: "Push-up to down dog", dose: "8 reps" }, { name: "Light set of your first lift", dose: "1 x 10" },
  ],
  lower: [
    { name: "Leg swings", dose: "10 each side" }, { name: "Bodyweight squat", dose: "15 reps" },
    { name: "Glute bridge", dose: "12 reps" }, { name: "Light set of your first lift", dose: "1 x 10" },
  ],
  full: [
    { name: "Jumping jacks", dose: "45 s" }, { name: "Inchworm walk-out", dose: "6 reps" },
    { name: "World's greatest stretch", dose: "4 each side" }, { name: "Light set of your first lift", dose: "1 x 10" },
  ],
};
export function warmupFor(type: SessionType): WarmupItem[] {
  if (type === "UPPER" || type === "PUSH" || type === "PULL") return WARMUPS.upper;
  if (type === "LOWER" || type === "LEGS") return WARMUPS.lower;
  return WARMUPS.full;
}

export const SESSION_NAMES: Record<SessionType, string> = {
  UPPER: "Upper", LOWER: "Lower", PUSH: "Push", PULL: "Pull", LEGS: "Legs", FULL: "Full body",
};
export const SESSION_MUSCLES: Record<SessionType, string[]> = {
  UPPER: ["Chest", "Back", "Shoulders", "Arms"], LOWER: ["Quads", "Glutes", "Hamstrings"],
  PUSH: ["Chest", "Shoulders", "Triceps"], PULL: ["Back", "Biceps", "Rear delts"],
  LEGS: ["Quads", "Glutes", "Hamstrings"], FULL: ["Full body"],
};

/** Movement pattern per exercise name, used to pick the illustration and the load factor. */
const PATTERN_RULES: [RegExp, MovementPattern][] = [
  [/dead bug|crunch|knee raise|hollow|pallof|plank|bird dog|side bend/i, "deadbug"], [/thrust|bridge/i, "thrust"],
  [/lunge|split squat|step-up/i, "lunge"], [/calf/i, "calf"], [/leg extension|leg curl/i, "legext"],
  [/romanian|rdl|deadlift|good morning/i, "rdl"], [/squat|leg press|wall sit/i, "squat"], [/push-up|dip/i, "pushup"],
  [/pulldown|pull-up|pullover/i, "pulldown"], [/row|face pull|rear-delt|pull-apart|superman/i, "row"],
  [/shoulder press|overhead press|landmine|pike|high-incline/i, "press"], [/curl/i, "curl"],
  [/pushdown|skull|triceps|extension/i, "pushdown"], [/lateral|raise/i, "raise"], [/bench|chest press|db press|fly|incline/i, "bench"],
];
export function patternOf(name: string): MovementPattern | null {
  for (const [re, p] of PATTERN_RULES) if (re.test(name)) return p;
  return null;
}

/** DB muscle group (tracking.muscle_group enum) and equipment label for every generator exercise. */
export type DbMuscleGroup = "CHEST" | "BACK" | "SHOULDERS" | "BICEPS" | "TRICEPS" | "LEGS" | "GLUTES" | "CORE" | "FULL_BODY" | "CARDIO" | "OTHER";
const MUSCLE_BY_PATTERN: Record<MovementPattern, DbMuscleGroup> = {
  squat: "LEGS", rdl: "LEGS", bench: "CHEST", pushup: "CHEST", row: "BACK", pulldown: "BACK", press: "SHOULDERS",
  thrust: "GLUTES", lunge: "LEGS", deadbug: "CORE", curl: "BICEPS", pushdown: "TRICEPS", raise: "SHOULDERS", calf: "LEGS", legext: "LEGS",
};
export function exerciseMeta(name: string): { muscleGroup: DbMuscleGroup; equipment: string; pattern: MovementPattern | null } {
  const pattern = patternOf(name);
  let muscleGroup: DbMuscleGroup = pattern ? MUSCLE_BY_PATTERN[pattern] : "OTHER";
  if (/glute|hip thrust/i.test(name)) muscleGroup = "GLUTES";
  if (/rear-delt|face pull|lateral/i.test(name)) muscleGroup = "SHOULDERS";
  const equipment =
    /band/i.test(name) ? "Band" :
    /DB|dumbbell|goblet/i.test(name) ? "Dumbbell" :
    /cable|rope|pulldown|face pull|pallof/i.test(name) ? "Cable" :
    /machine|leg press|leg extension|leg curl|calf raise/i.test(name) && !/single-leg/i.test(name) ? "Machine" :
    /barbell|bench press|back squat|romanian deadlift|overhead press|ez-bar|landmine|hip thrust|box squat/i.test(name) ? "Barbell" :
    "Bodyweight";
  return { muscleGroup, equipment, pattern };
}

/** Every exercise name the generator can output (used to seed tracking.exercises). */
export function allGeneratorExercises(): string[] {
  const names = new Set<string>();
  for (const cls of Object.values(POOL)) for (const list of Object.values(cls)) list.forEach((n) => names.add(n));
  for (const list of Object.values(CORE)) list.forEach((n) => names.add(n));
  for (const map of Object.values(SWAPS)) Object.values(map).forEach((n) => names.add(n));
  return [...names].sort();
}

/** Activities a user can log (onboarding-flow.md "Add an activity"). MET values from the Compendium of Physical Activities, rounded. */
export const ACTIVITY_TYPES: Record<string, { label: string; met: number; distance: boolean; kind: ActivityKind }> = {
  WALK: { label: "Walking", met: 3.5, distance: true, kind: "CARDIO" },
  RUN: { label: "Running", met: 9, distance: true, kind: "CARDIO" },
  CYCLE: { label: "Cycling", met: 7, distance: true, kind: "CARDIO" },
  SWIM: { label: "Swimming", met: 6, distance: true, kind: "CARDIO" },
  HIKE: { label: "Hiking", met: 6, distance: true, kind: "CARDIO" },
  ROW: { label: "Rowing", met: 7, distance: true, kind: "CARDIO" },
  SKIP: { label: "Skipping", met: 11, distance: false, kind: "CARDIO" },
  FOOTBALL: { label: "Football", met: 7, distance: false, kind: "SPORT" },
  BASKETBALL: { label: "Basketball", met: 6.5, distance: false, kind: "SPORT" },
  DANCE: { label: "Dance", met: 5, distance: false, kind: "SPORT" },
  WARMUP: { label: "Warm-up", met: 3, distance: false, kind: "WARMUP" },
  MOBILITY: { label: "Mobility routine", met: 2.5, distance: false, kind: "MOBILITY" },
  ABS: { label: "Abs finisher", met: 4, distance: false, kind: "ABS" },
};

/** Liked-cardio answers from onboarding mapped to activity types (used for rest-day suggestions). */
export const CARDIO_LIKE_TO_TYPE: Record<string, string> = {
  walk: "WALK", run: "RUN", football: "FOOTBALL", cycle: "CYCLE", swim: "SWIM", dance: "DANCE", skip: "SKIP", hike: "HIKE",
};

export const ROUTINES: Record<"MOBILITY" | "ABS", { title: string; minutes: number; items: WarmupItem[] }> = {
  MOBILITY: {
    title: "Mobility routine", minutes: 10,
    items: [
      { name: "Cat-cow", dose: "10 reps" }, { name: "World's greatest stretch", dose: "4 each side" },
      { name: "Hip flexor stretch", dose: "45 s each side" }, { name: "Thoracic rotation", dose: "8 each side" },
      { name: "Deep squat hold", dose: "60 s" },
    ],
  },
  ABS: {
    title: "Abs finisher", minutes: 8,
    items: [
      { name: "Dead bug", dose: "3 x 10 each side" }, { name: "Reverse crunch", dose: "3 x 12" },
      { name: "Plank", dose: "3 x 40 s" }, { name: "Side plank", dose: "2 x 30 s each side" },
    ],
  },
};

// ── Recipes (custom-seeded local layer, spec §9.4) ────────────────────────
// Placeholder nutrition values pending the vendor decision (spec §9.1).
// sql/003_seed_mvp2.sql is generated from this list (npm run gen:seed).

const MEAT: DietPattern[] = ["OMNIVORE", "HALAL", "OTHER"];
const FISHY: DietPattern[] = [...MEAT, "PESCATARIAN"];
const VEGGIE: DietPattern[] = [...FISHY, "VEGETARIAN"];
const ALL: DietPattern[] = [...VEGGIE, "VEGAN"];
const r = (
  key: string, dish: string, name: string, slot: Recipe["slot"], kcal: number, proteinG: number, carbsG: number, fatG: number,
  diets: DietPattern[], allergens: Allergen[], portionGuide: string,
): Recipe => ({ key, dish, name, slot, kcal, proteinG, carbsG, fatG, diets, allergens, portionGuide, isLocal: true });

export const RECIPES: Recipe[] = [
  r("jollof-chicken", "jollof", "Jollof rice with grilled chicken", "LUNCH", 620, 38, 78, 16, MEAT, [], "Jollof rice, about 1.5 cups. Grilled chicken thigh, skin off. Side salad."),
  r("jollof-fish", "jollof", "Jollof rice with grilled fish", "LUNCH", 600, 36, 78, 14, ["PESCATARIAN"], ["FISH"], "Jollof rice, about 1.5 cups. 1 grilled fish. Side salad."),
  r("jollof-beans", "jollof", "Jollof rice with spiced beans", "LUNCH", 580, 20, 92, 14, ["VEGETARIAN", "VEGAN"], [], "Jollof rice, about 1.5 cups. 1 cup spiced beans. Side salad."),
  r("waakye-egg-fish", "waakye", "Waakye with boiled egg and fish", "LUNCH", 650, 34, 85, 18, FISHY, ["EGGS", "FISH"], "Waakye, about 1.5 cups. 1 boiled egg and 1 piece of fish. Go light on gari and oil."),
  r("waakye-egg-avocado", "waakye", "Waakye with boiled egg and avocado", "LUNCH", 640, 18, 86, 22, ["VEGETARIAN"], ["EGGS"], "Waakye, about 1.5 cups. 1 boiled egg. Half an avocado."),
  r("waakye-avocado", "waakye", "Waakye with avocado and shito", "LUNCH", 600, 16, 88, 20, ["VEGAN"], [], "Waakye, about 1.5 cups. Half an avocado. 1 tbsp shito."),
  r("banku-tilapia", "banku", "Banku with grilled tilapia and pepper", "DINNER", 600, 42, 70, 14, FISHY, ["FISH"], "1 medium ball of banku. Grilled tilapia. Pepper and onions."),
  r("banku-okro", "banku", "Banku with okro and garden egg stew", "DINNER", 560, 16, 92, 14, ["VEGETARIAN", "VEGAN"], [], "1 medium ball of banku. Okro and garden egg stew."),
  r("kenkey-fish", "kenkey", "Kenkey with grilled fish and shito", "DINNER", 580, 36, 80, 12, FISHY, ["FISH"], "1 ball of kenkey. Grilled fish. 1 tbsp shito."),
  r("kenkey-beans", "kenkey", "Kenkey with bean stew", "DINNER", 560, 18, 96, 10, ["VEGETARIAN", "VEGAN"], [], "1 ball of kenkey. 1 cup bean stew."),
  r("fufu-goat", "fufu", "Fufu with light soup and goat", "DINNER", 640, 40, 82, 16, MEAT, [], "1 medium fufu. Light soup with goat."),
  r("fufu-fish", "fufu", "Fufu with light soup and fish", "DINNER", 620, 38, 82, 14, ["PESCATARIAN"], ["FISH"], "1 medium fufu. Light soup with fish."),
  r("fufu-groundnut-tofu", "fufu", "Fufu with groundnut soup and tofu", "DINNER", 660, 22, 80, 26, ["VEGETARIAN", "VEGAN"], ["PEANUTS", "SOY"], "1 medium fufu. Groundnut soup with tofu."),
  r("redred-plantain", "redred", "Red red with ripe plantain", "LUNCH", 560, 22, 84, 16, ALL, [], "Bean stew, about 1.5 cups. Half a ripe plantain, boiled or air-fried."),
  r("kontomire-yam-egg", "kontomire", "Kontomire stew with yam and egg", "DINNER", 540, 26, 70, 18, VEGGIE, ["EGGS"], "Kontomire stew with egg. 2 slices of boiled yam."),
  r("kontomire-yam", "kontomire", "Kontomire stew with yam", "DINNER", 480, 14, 76, 14, ["VEGAN"], [], "Kontomire stew. 2 slices of boiled yam."),
  r("hausa-koko-koose", "hausa", "Hausa koko with koose", "BREAKFAST", 380, 12, 62, 10, ALL, [], "1 bowl of hausa koko. 3 koose."),
  r("oats-pb", "oats", "Oats with milk, banana and peanut butter", "BREAKFAST", 450, 20, 60, 14, VEGGIE, ["DAIRY", "PEANUTS"], "60 g oats, 1 cup milk, 1 banana, 1 tbsp peanut butter."),
  r("oats-soy-pb", "oats", "Oats with soy milk, banana and peanut butter", "BREAKFAST", 430, 16, 62, 13, ["VEGAN"], ["SOY", "PEANUTS"], "60 g oats, 1 cup soy milk, 1 banana, 1 tbsp peanut butter."),
  r("egg-stew-yam", "eggs", "Egg stew with boiled yam", "BREAKFAST", 480, 24, 58, 18, VEGGIE, ["EGGS"], "2 eggs in tomato stew. 2 slices of boiled yam."),
  r("tofu-stew-yam", "eggs", "Tofu stew with boiled yam", "BREAKFAST", 460, 20, 60, 16, ["VEGAN"], ["SOY"], "Tofu in tomato stew. 2 slices of boiled yam."),
  r("tom-brown", "tombrown", "Tom brown with milk and groundnuts", "BREAKFAST", 360, 14, 54, 10, VEGGIE, ["DAIRY", "PEANUTS"], "1 bowl of tom brown with milk. A small handful of groundnuts."),
  r("kelewele", "kelewele", "Kelewele with roasted groundnuts", "SNACK", 290, 7, 38, 13, ALL, ["PEANUTS"], "1 cup kelewele. A small handful of roasted groundnuts."),
  r("greek-yogurt-pineapple", "yogurt", "Greek yogurt with pineapple", "SNACK", 200, 18, 26, 3, VEGGIE, ["DAIRY"], "200 g Greek yogurt. Fresh pineapple."),
  r("soy-yogurt-pineapple", "yogurt", "Soy yogurt with pineapple", "SNACK", 190, 8, 30, 5, ["VEGAN"], ["SOY"], "200 g soy yogurt. Fresh pineapple."),
  r("roasted-corn-coconut", "corn", "Roasted corn with coconut", "SNACK", 250, 6, 40, 8, ALL, [], "1 cob of roasted corn. A few slices of fresh coconut."),
];

/** Dish families users can pick as favourites during onboarding. */
export const FAVOURITE_DISHES: { dish: string; label: string }[] = [
  { dish: "jollof", label: "Jollof" }, { dish: "waakye", label: "Waakye" }, { dish: "banku", label: "Banku and tilapia" },
  { dish: "kenkey", label: "Kenkey and fish" }, { dish: "fufu", label: "Fufu and soup" }, { dish: "redred", label: "Red red" },
  { dish: "kontomire", label: "Kontomire stew" }, { dish: "hausa", label: "Hausa koko" }, { dish: "tombrown", label: "Tom brown" },
  { dish: "oats", label: "Oats" }, { dish: "eggs", label: "Egg stew and yam" }, { dish: "kelewele", label: "Kelewele" },
  { dish: "yogurt", label: "Yogurt and fruit" }, { dish: "corn", label: "Roasted corn" },
];
