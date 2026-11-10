import type { DietInput, TrainingInput } from "./types.js";

/**
 * Quick start onboarding (README "Quick start onboarding"). The quick path asks
 * only what a safe first plan needs; everything else gets these defaults until
 * the user answers it. Shared by the API (what it stores) and the web app
 * (the plan preview), so the two always agree.
 */

/** Question blocks a quick start user can still owe. */
export type IntakeSection = "FUEL" | "TRAINING_DETAILS";
export const INTAKE_SECTIONS: IntakeSection[] = ["FUEL", "TRAINING_DETAILS"];

/** Asked on the quick path. */
export type TrainingBasics = Pick<TrainingInput,
  "sex" | "age" | "heightCm" | "weightKg" | "bodyFatLevel" | "goal" | "targetWeightKg" | "pace" | "experience" | "equipment"
  | "availableDays" | "daysPerWeek" | "sessionMinutes" | "injuries">;

/** "Fine-tune your training": optional, offered on Train and at the week-6 check-in. */
export type TrainingDetails = Pick<TrainingInput,
  "liftComfort" | "split" | "fullBodyDay" | "priorityMuscles" | "lowPriorityMuscles" | "cardioLikes" | "warmup" | "sleepHours" | "sleepQuality">;

/** Asked with "Set up Fuel", because they change calories and meal timing. */
export type FuelLifestyle = Pick<TrainingInput, "activityLevel" | "trainTime" | "busyness">;

export const DETAIL_DEFAULTS: TrainingDetails = {
  liftComfort: "LEARNING", split: "AUTO", fullBodyDay: false, priorityMuscles: [], lowPriorityMuscles: [], cardioLikes: [],
  warmup: true, sleepHours: 7, sleepQuality: null,
};

export const LIFESTYLE_DEFAULTS: FuelLifestyle = { activityLevel: "LIGHT", trainTime: null, busyness: null };

/** The full engine input from the quick answers, with defaults for anything not answered yet. */
export function quickTraining(b: TrainingBasics, details?: TrainingDetails | null, lifestyle?: FuelLifestyle | null): TrainingInput {
  return { ...b, ...(details ?? DETAIL_DEFAULTS), ...(lifestyle ?? LIFESTYLE_DEFAULTS), blockers: [] };
}

/**
 * Stands in for the diet when generating a quick start plan. Calories and the
 * training week don't depend on it; it's never stored and no menu is shown
 * from it.
 */
export const PLACEHOLDER_DIET: DietInput = {
  pattern: "OMNIVORE", allergies: [], dislikes: "", favouriteDishes: [], mealPattern: "THREE", prep: null, fasting: "NO", struggles: [],
};
