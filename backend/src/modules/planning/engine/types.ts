/**
 * Plan engine types (spec.md §4.8, onboarding-flow.md).
 *
 * The engine is pure TypeScript with no Node or browser imports, so the
 * backend (authoritative, persisted plans) and the web app (instant previews
 * during onboarding, before an account exists) run exactly the same rules.
 * Keep it that way: no I/O, no Date.now() without an injected "today".
 */

export type Sex = "MALE" | "FEMALE";
export type GoalType = "LOSE_FAT" | "BUILD_MUSCLE" | "RECOMP" | "FITNESS" | "MAINTAIN";
export type Pace = "STEADY" | "MODERATE" | "AMBITIOUS";
export type Experience = "NEW" | "SOME" | "EXPERIENCED";
export type LiftComfort = "NEVER" | "LEARNING" | "SOLID" | "AVOID";
export type Equipment = "FULL_GYM" | "SMALL_GYM" | "HOME_GYM" | "DUMBBELLS" | "BANDS" | "BODYWEIGHT";
export type SplitPreference = "AUTO" | "FULL_BODY" | "UPPER_LOWER" | "MUSCLE_FOCUS";
export type ActivityLevel = "DESK" | "LIGHT" | "ACTIVE" | "VERY_ACTIVE";
export type Injury = "SHOULDER" | "ELBOW" | "WRIST" | "LOWER_BACK" | "KNEE" | "HIP";
export type PriorityMuscle = "CHEST" | "BACK" | "SHOULDERS" | "ARMS" | "GLUTES" | "LEGS" | "CORE";
export type TrainTime = "EARLY" | "MIDDAY" | "EVENING" | "VARIES";
export type SleepQuality = "RESTED" | "VARIES" | "TIRED";
export type Busyness = "PACKED" | "BUSY" | "FLEXIBLE";
export type DietPattern = "OMNIVORE" | "HALAL" | "PESCATARIAN" | "VEGETARIAN" | "VEGAN" | "OTHER";
export type Allergen = "DAIRY" | "GLUTEN" | "PEANUTS" | "SHELLFISH" | "EGGS" | "SOY" | "FISH";
export type MealPattern = "TWO" | "TWO_PLUS_SNACK" | "THREE" | "THREE_PLUS_SNACK" | "THREE_PLUS_TWO_SNACKS";
export type MealSlot = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
export type Fasting = "YES" | "CURIOUS" | "NO";
export type PrepStyle = "DAILY" | "BATCH_FEW_DAYS" | "BATCH_WEEK" | "BUY";
export type SessionType = "UPPER" | "LOWER" | "PUSH" | "PULL" | "LEGS" | "FULL";
export type MovementPattern =
  | "squat" | "rdl" | "bench" | "pushup" | "row" | "pulldown" | "press" | "thrust"
  | "lunge" | "deadbug" | "curl" | "pushdown" | "raise" | "calf" | "legext";
export type ActivityKind = "CARDIO" | "SPORT" | "WARMUP" | "MOBILITY" | "ABS";
export type Effort = "EASY" | "MODERATE" | "HARD";

/** Health screening (spec §4.8.1). Any true flag stops plan generation. */
export interface HealthScreening {
  heartCondition: boolean;
  highBloodPressure: boolean;
  diabetes: boolean;
  pregnant: boolean;
  recentSurgeryOrInjury: boolean;
  chestPainOrDizziness: boolean;
  under18: boolean;
}

/** Everything the training and calorie maths needs. Weekday indexes: 0 = Monday … 6 = Sunday. */
export interface TrainingInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  /** 0 (leanest) … 4 (highest), or null when the user picked "not sure". */
  bodyFatLevel: number | null;
  goal: GoalType;
  targetWeightKg: number | null;
  pace: Pace | null;
  experience: Experience;
  liftComfort: LiftComfort;
  equipment: Equipment;
  availableDays: number[];
  /** The number chosen during onboarding. The ±1 rule is anchored to this. */
  daysPerWeek: number;
  sessionMinutes: 30 | 45 | 60 | 75;
  split: SplitPreference;
  fullBodyDay: boolean;
  priorityMuscles: PriorityMuscle[];
  injuries: Injury[];
  activityLevel: ActivityLevel;
  sleepHours: number;
  sleepQuality: SleepQuality | null;
  trainTime: TrainTime | null;
  busyness: Busyness | null;
  warmup: boolean;
  cardioLikes: string[];
  blockers: string[];
}

export interface DietInput {
  pattern: DietPattern;
  allergies: Allergen[];
  dislikes: string;
  favouriteDishes: string[];
  mealPattern: MealPattern;
  prep: PrepStyle | null;
  fasting: Fasting;
  struggles: string[];
}

export interface Targets {
  bmr: number;
  tdee: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface Projection {
  weeks: number;
  weeklyRateKg: number;
  /** ISO date (YYYY-MM-DD). */
  endDate: string;
}

export interface PlannedExercise {
  name: string;
  pattern: MovementPattern | null;
  sets: number;
  /** e.g. "6-10", "10-15", "30-45 s" */
  reps: string;
  isCore: boolean;
  swapped: boolean;
  /** The exercise this one replaced because of an injury, when swapped. */
  replaces: string | null;
}

export interface WarmupItem {
  name: string;
  dose: string;
}

export interface PlannedSession {
  weekday: number;
  type: SessionType;
  name: string;
  warmup: WarmupItem[];
  exercises: PlannedExercise[];
}

export interface WeekPlan {
  daysPerWeek: number;
  splitLabel: string;
  sessions: PlannedSession[];
  restDays: { weekday: number; suggestion: string }[];
}

export interface Recipe {
  key: string;
  /** Dish family used for favourites, e.g. "jollof". */
  dish: string;
  name: string;
  slot: MealSlot;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  diets: DietPattern[];
  allergens: Allergen[];
  portionGuide: string;
  isLocal: boolean;
}

export interface MenuItem {
  slotIndex: number;
  slot: MealSlot;
  recipeKey: string;
  name: string;
  portionGuide: string;
  portionFactor: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface DayMenu {
  date: string;
  items: MenuItem[];
  proteinShortfallG: number;
}

export interface Adaptation {
  icon: string;
  text: string;
}

export interface GeneratedPlan {
  targets: Targets;
  projection: Projection | null;
  week: WeekPlan;
  sampleMenu: DayMenu;
  adaptations: Adaptation[];
  dayRange: { min: number; max: number };
}
