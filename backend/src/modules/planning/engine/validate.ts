import { healthyMinWeightKg } from "./engine.js";
import type { DietInput, TrainingInput } from "./types.js";

export interface ValidationIssue {
  field: string;
  message: string;
}

/** Target-weight rule shown inline during onboarding and enforced again on the server. */
export function targetWeightIssue(i: Pick<TrainingInput, "goal" | "weightKg" | "heightCm" | "targetWeightKg">): string | null {
  if (i.goal !== "LOSE_FAT" && i.goal !== "BUILD_MUSCLE") return null;
  if (i.targetWeightKg == null) return "Set a target weight.";
  if (i.goal === "LOSE_FAT") {
    if (i.targetWeightKg >= i.weightKg) return "For fat loss, pick a weight below your current weight.";
    const min = healthyMinWeightKg(i.heightCm);
    if (i.targetWeightKg < min) return `That's below a healthy range for your height. The lowest we'll plan for is ${min} kg.`;
  }
  if (i.goal === "BUILD_MUSCLE") {
    if (i.targetWeightKg <= i.weightKg) return "For muscle gain, pick a weight above your current weight.";
    if (i.targetWeightKg > i.weightKg * 1.2) return `That's a lot for lean gains. Try ${Math.round(i.weightKg * 1.1)} kg for now and raise it at a check-in.`;
  }
  return null;
}

/** Full server-side validation of an onboarding submission. Empty array = valid. */
export function validateIntake(i: TrainingInput, d: DietInput): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const bad = (field: string, message: string) => out.push({ field, message });
  if (!(i.age >= 18 && i.age <= 90)) bad("age", "Age must be between 18 and 90.");
  if (!(i.heightCm >= 130 && i.heightCm <= 220)) bad("heightCm", "Height must be between 130 and 220 cm.");
  if (!(i.weightKg >= 35 && i.weightKg <= 250)) bad("weightKg", "Weight must be between 35 and 250 kg.");
  if (i.bodyFatLevel != null && !(i.bodyFatLevel >= 0 && i.bodyFatLevel <= 4)) bad("bodyFatLevel", "Body shape level must be 0 to 4.");
  const tw = targetWeightIssue(i);
  if (tw) bad("targetWeightKg", tw);
  if ((i.goal === "LOSE_FAT" || i.goal === "BUILD_MUSCLE") && !i.pace) bad("pace", "Choose a pace.");
  const avail = [...new Set(i.availableDays)].filter((x) => x >= 0 && x <= 6);
  if (avail.length < 2) bad("availableDays", "Pick at least 2 available days.");
  if (!(i.daysPerWeek >= 2 && i.daysPerWeek <= Math.min(6, avail.length))) bad("daysPerWeek", "Days per week must be between 2 and your available days (max 6).");
  if (![30, 45, 60, 75].includes(i.sessionMinutes)) bad("sessionMinutes", "Session length must be 30, 45, 60 or 75 minutes.");
  if (i.split === "MUSCLE_FOCUS" && i.daysPerWeek < 4) bad("split", "Muscle-group focus needs at least 4 days.");
  if (i.priorityMuscles.length > 2) bad("priorityMuscles", "Pick up to 2 priority muscles.");
  if (i.lowPriorityMuscles.length > 2) bad("lowPriorityMuscles", "Pick up to 2 muscles not to prioritise.");
  else if (i.lowPriorityMuscles.includes("CORE")) bad("lowPriorityMuscles", "Abs & core stay in every session.");
  else if (i.lowPriorityMuscles.some((m) => i.priorityMuscles.includes(m))) bad("lowPriorityMuscles", "A muscle can't be both a priority and not a priority.");
  if (!(i.sleepHours >= 3 && i.sleepHours <= 12)) bad("sleepHours", "Sleep must be between 3 and 12 hours.");
  if (d.favouriteDishes.length < 3) bad("favouriteDishes", "Pick at least 3 meals you love.");
  if (d.favouriteDishes.length > 40) bad("favouriteDishes", "Pick up to 40 meals.");
  if (d.favouriteDishes.some((x) => !x.trim() || x.length > 40)) bad("favouriteDishes", "Each meal name must be 1 to 40 characters.");
  return out;
}
