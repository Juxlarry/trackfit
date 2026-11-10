import type { IntakeSection } from "@engine";
import { toDiet, toTraining, toOnboardingInput, screening, type Draft } from "./draft";
import { STEPS, type Step } from "./steps";

/**
 * Quick start onboarding (README "Quick start onboarding"): which quiz steps
 * each path asks, and which blocks are asked later in the app.
 */

/** Asked on this draft's path. Quick start skips every tagged step. */
export const onPath = (s: Step, d: Pick<Draft, "path">) => !s.sectionOnly && (d.path !== "QUICK" || !s.block);

export const SECTION_BLOCK: Record<IntakeSection, "fuel" | "details"> = { FUEL: "fuel", TRAINING_DETAILS: "details" };

/** A block's steps, in order, minus any skipped for these answers. In the app, signed in is always true. */
export const blockSteps = (block: "fuel" | "details", d: Draft) => STEPS.filter((s) => s.block === block && !s.skip?.(d, true));

/** Every question in the block answered (the in-app-only warm-up question isn't required: it defaults to on). */
export const blockDone = (block: "fuel" | "details", d: Draft) =>
  blockSteps(block, d).filter((s) => !s.sectionOnly).every((s) => !s.valid || s.valid(d));

/** The questions for this path are all answered: the plan can be built. */
export function questionsDone(d: Draft): boolean {
  if (d.path !== "QUICK") return !!d.support;
  return STEPS.filter((s) => s.stage >= 0 && onPath(s, d) && !s.skip?.(d, false)).every((s) => !s.valid || s.valid(d));
}

/** The last question on this path, where Back from the plan build returns to. */
export const lastQuestion = (d: Draft) => [...STEPS].reverse().find((s) => s.stage >= 0 && onPath(s, d) && !s.skip?.(d, false))!.id;

/** completeQuickOnboarding's input. Blocks answered anyway (switching from the full quiz) go along so they're never asked again. */
export function toQuickInput(d: Draft, email: string | null) {
  const t = toTraining(d);
  const full = toOnboardingInput(d, email);
  return {
    displayName: d.name.trim() || null,
    email,
    screening: screening(d),
    basics: {
      sex: t.sex, age: t.age, heightCm: t.heightCm, weightKg: t.weightKg, bodyFatLevel: t.bodyFatLevel, goal: t.goal,
      targetWeightKg: t.targetWeightKg, pace: t.pace, experience: t.experience, equipment: t.equipment, availableDays: t.availableDays,
      daysPerWeek: t.daysPerWeek, sessionMinutes: t.sessionMinutes, injuries: t.injuries, injuryNote: d.injuryNote || null, motivations: d.motivations,
    },
    details: blockDone("details", d) ? toDetailsInput(d) : null,
    fuel: blockDone("fuel", d) ? toFuelInput(d) : null,
    mindset: full.mindset,
    startDate: d.startDate,
  };
}

/** fineTuneTraining's input. */
export function toDetailsInput(d: Draft) {
  const t = toTraining(d);
  return {
    liftComfort: t.liftComfort, split: t.split, fullBodyDay: t.fullBodyDay, priorityMuscles: t.priorityMuscles,
    lowPriorityMuscles: t.lowPriorityMuscles, cardioLikes: t.cardioLikes, cardioFrequency: d.cardioFrequency || null,
    warmup: t.warmup, sleepHours: t.sleepHours, sleepQuality: t.sleepQuality,
  };
}

/** completeFuelSetup's input. */
export function toFuelInput(d: Draft) {
  const t = toTraining(d);
  return {
    diet: { ...toDiet(d), calorieAwareness: d.calorieAwareness || null, proteinAwareness: d.proteinAwareness || null },
    activityLevel: t.activityLevel, trainTime: t.trainTime, busyness: t.busyness,
  };
}
