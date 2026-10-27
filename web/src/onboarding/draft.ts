import type {
  ActivityLevel, Allergen, Busyness, DietInput, DietPattern, Equipment, Experience, Fasting, GoalType, HealthScreening,
  Injury, LiftComfort, MealPattern, Pace, PrepStyle, PriorityMuscle, Sex, SleepQuality, SplitPreference, TrainTime, TrainingInput,
} from "@engine";
import { readJson, removeKey, writeJson } from "../lib/storage";

/**
 * Everything the user answers during onboarding. Kept on the device until
 * the account exists, then submitted in one completeOnboarding call.
 * "NONE"-style values mark an explicit "none of these" answer.
 */
export interface Draft {
  safety: (keyof HealthScreening | "NONE")[];
  name: string;
  sex: Sex | "";
  age: number;
  heightUnit: "cm" | "ft";
  heightCm: number;
  weightUnit: "kg" | "lb";
  weightKg: number;
  bodyFatLevel: number | "UNSURE" | null;
  bodyFatView: "figures" | "gauge";
  goal: GoalType | "";
  targetWeightKg: number | null;
  pace: Pace | "";
  motivations: string[];
  experience: Experience | "";
  liftComfort: LiftComfort | "";
  equipment: Equipment | "";
  availableDays: number[];
  daysPerWeek: number;
  sessionMinutes: 0 | 30 | 45 | 60 | 75;
  split: SplitPreference | "";
  fullBodyDay: boolean | null;
  priorityMuscles: (PriorityMuscle | "EVEN")[];
  injuries: (Injury | "NONE")[];
  injuryNote: string;
  cardioFrequency: string;
  cardioLikes: string[];
  activityLevel: ActivityLevel | "";
  sleepHours: number;
  sleepQuality: SleepQuality | "";
  trainTime: TrainTime | "";
  busyness: Busyness | "";
  dietPattern: DietPattern | "";
  allergies: (Allergen | "NONE")[];
  dislikes: string;
  favouriteDishes: string[];
  mealPattern: MealPattern | "";
  prep: PrepStyle | "";
  calorieAwareness: string;
  proteinAwareness: string;
  struggles: string[];
  fasting: Fasting | "";
  blockers: string[];
  likertConsistency: number;
  likertGuidance: number;
  tried: string[];
  motivator: string;
  support: string;
  energy: string;
  warmup: boolean | null;
  /** Days chosen with the ±1 control on the plan reveal (0 = unchanged). */
  revealDays: number;
  startChoice: "TODAY" | "TOMORROW" | "DATE" | "";
  startDate: string;
  email: string;
}

export const emptyDraft = (): Draft => ({
  safety: [], name: "", sex: "", age: 30, heightUnit: "cm", heightCm: 170, weightUnit: "kg", weightKg: 75,
  bodyFatLevel: null, bodyFatView: "figures", goal: "", targetWeightKg: null, pace: "", motivations: [],
  experience: "", liftComfort: "", equipment: "", availableDays: [], daysPerWeek: 0, sessionMinutes: 0, split: "",
  fullBodyDay: null, priorityMuscles: [], injuries: [], injuryNote: "", cardioFrequency: "", cardioLikes: [],
  activityLevel: "", sleepHours: 7, sleepQuality: "", trainTime: "", busyness: "", dietPattern: "", allergies: [],
  dislikes: "", favouriteDishes: [], mealPattern: "", prep: "", calorieAwareness: "", proteinAwareness: "", struggles: [],
  fasting: "", blockers: [], likertConsistency: 0, likertGuidance: 0, tried: [], motivator: "", support: "", energy: "",
  warmup: null, revealDays: 0, startChoice: "", startDate: "", email: "",
});

const KEY = "trackfit.onboardingDraft.v1";
export const loadDraft = (): Draft => ({ ...emptyDraft(), ...readJson<Partial<Draft>>(KEY, {}) });
export const saveDraft = (d: Draft) => writeJson(KEY, d);
export const clearDraft = () => removeKey(KEY);

export const firstName = (d: Pick<Draft, "name">) => d.name.trim().split(/\s+/)[0] ?? "";

const SCREEN_KEYS: (keyof HealthScreening)[] = ["heartCondition", "highBloodPressure", "diabetes", "pregnant", "recentSurgeryOrInjury", "chestPainOrDizziness", "under18"];
export function screening(d: Draft): HealthScreening {
  return Object.fromEntries(SCREEN_KEYS.map((k) => [k, d.safety.includes(k)])) as unknown as HealthScreening;
}
export const isScreenedOutDraft = (d: Draft) => d.safety.some((x) => x !== "NONE");

/**
 * Engine input from a (possibly partial) draft. Unanswered fields get neutral
 * defaults so interstitials can preview numbers mid-flow.
 */
export function toTraining(d: Draft): TrainingInput {
  const avail = d.availableDays.length >= 2 ? [...d.availableDays].sort() : [0, 2, 4];
  const days = d.daysPerWeek || Math.min(3, avail.length);
  return {
    sex: d.sex || "MALE", age: d.age, heightCm: d.heightCm, weightKg: d.weightKg,
    bodyFatLevel: typeof d.bodyFatLevel === "number" ? d.bodyFatLevel : null,
    goal: d.goal || "MAINTAIN",
    targetWeightKg: d.goal === "LOSE_FAT" || d.goal === "BUILD_MUSCLE" ? d.targetWeightKg : null,
    pace: d.goal === "LOSE_FAT" || d.goal === "BUILD_MUSCLE" ? d.pace || null : null,
    experience: d.experience || "SOME", liftComfort: d.liftComfort || "LEARNING", equipment: d.equipment || "FULL_GYM",
    availableDays: avail, daysPerWeek: days, sessionMinutes: (d.sessionMinutes || 45) as TrainingInput["sessionMinutes"],
    split: d.split || "AUTO", fullBodyDay: d.fullBodyDay === true,
    priorityMuscles: d.priorityMuscles.filter((m): m is PriorityMuscle => m !== "EVEN"),
    injuries: d.injuries.filter((i): i is Injury => i !== "NONE"),
    activityLevel: d.activityLevel || "LIGHT", sleepHours: d.sleepHours, sleepQuality: d.sleepQuality || null,
    trainTime: d.trainTime || null, busyness: d.busyness || null, warmup: d.warmup !== false,
    cardioLikes: d.cardioLikes.filter((c) => c !== "none"), blockers: d.blockers,
  };
}

export function toDiet(d: Draft): DietInput {
  return {
    pattern: d.dietPattern || "OMNIVORE", allergies: d.allergies.filter((a): a is Allergen => a !== "NONE"), dislikes: d.dislikes,
    favouriteDishes: d.favouriteDishes, mealPattern: d.mealPattern || "THREE", prep: d.prep || null, fasting: d.fasting || "NO",
    struggles: d.struggles.filter((s) => s !== "FINE"),
  };
}

/** The GraphQL OnboardingInput for completeOnboarding. */
export function toOnboardingInput(d: Draft, email: string | null) {
  const t = toTraining(d);
  const diet = toDiet(d);
  return {
    displayName: d.name.trim() || null,
    email,
    screening: screening(d),
    training: {
      ...t, motivations: d.motivations, injuryNote: d.injuryNote || null, cardioFrequency: d.cardioFrequency || null, energy: d.energy || null,
    },
    diet: {
      ...diet, calorieAwareness: d.calorieAwareness || null, proteinAwareness: d.proteinAwareness || null,
    },
    mindset: {
      likertConsistency: d.likertConsistency || null, likertGuidance: d.likertGuidance || null, tried: d.tried,
      motivator: d.motivator || null, support: d.support || null,
    },
    startDate: d.startDate,
  };
}

/** A complete sample used by the "Fill sample answers" developer shortcut and the E2E test. */
export function sampleDraft(today: string): Draft {
  return {
    ...emptyDraft(), safety: ["NONE"], name: "Jay", sex: "MALE", age: 30, heightCm: 168, weightKg: 81.2, bodyFatLevel: 2,
    goal: "LOSE_FAT", targetWeightKg: 71, pace: "MODERATE", motivations: ["confidence", "health"], experience: "SOME",
    liftComfort: "LEARNING", equipment: "FULL_GYM", availableDays: [0, 1, 2, 3, 4], daysPerWeek: 4, sessionMinutes: 60, split: "AUTO",
    fullBodyDay: false, priorityMuscles: ["CHEST", "ARMS"], injuries: ["KNEE"], cardioFrequency: "some", cardioLikes: ["football", "walk"],
    activityLevel: "DESK", sleepHours: 6.5, sleepQuality: "VARIES", trainTime: "EVENING", busyness: "PACKED", dietPattern: "OMNIVORE",
    allergies: ["NONE"], favouriteDishes: ["jollof", "waakye", "banku", "oats"], mealPattern: "THREE", prep: "BATCH_FEW_DAYS",
    calorieAwareness: "noidea", proteinAwareness: "noidea", struggles: ["WEEKENDS", "EVENINGS"], fasting: "NO", blockers: ["TIME", "PLATEAU"],
    likertConsistency: 4, likertGuidance: 3, tried: ["own", "count"], motivator: "friend", support: "both", energy: "depends", warmup: true,
    startChoice: "TODAY", startDate: today,
  };
}
