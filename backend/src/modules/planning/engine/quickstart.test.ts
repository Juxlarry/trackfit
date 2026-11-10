import { test } from "node:test";
import assert from "node:assert/strict";
import { DETAIL_DEFAULTS, LIFESTYLE_DEFAULTS, PLACEHOLDER_DIET, buildWeek, computeTargets, generatePlan, quickTraining, validateDiet, validateTraining, type TrainingBasics } from "./index.js";

const basics: TrainingBasics = {
  sex: "FEMALE", age: 27, heightCm: 163, weightKg: 70, bodyFatLevel: null, goal: "LOSE_FAT", targetWeightKg: 63, pace: "MODERATE",
  experience: "NEW", equipment: "FULL_GYM", availableDays: [0, 2, 4], daysPerWeek: 3, sessionMinutes: 45, injuries: [],
};

test("quick start: the basics plus defaults make a valid, complete plan", () => {
  const t = quickTraining(basics);
  assert.deepEqual(validateTraining(t), []);
  assert.equal(t.liftComfort, "LEARNING");
  assert.equal(t.activityLevel, "LIGHT");
  assert.equal(t.warmup, true);
  const plan = generatePlan(t, PLACEHOLDER_DIET, "2026-11-09");
  assert.equal(plan.week.sessions.length, 3);
  assert.ok(plan.targets.kcal > 1200);
  assert.ok(validateDiet(PLACEHOLDER_DIET).length > 0, "the placeholder diet is never valid, so it can't be saved by mistake");
});

test("quick start: answers given replace the defaults", () => {
  const t = quickTraining(basics, { ...DETAIL_DEFAULTS, split: "FULL_BODY", sleepHours: 8 }, { ...LIFESTYLE_DEFAULTS, activityLevel: "VERY_ACTIVE" });
  assert.match(buildWeek(t).splitLabel, /full body/i);
  assert.ok(computeTargets(t).kcal > computeTargets(quickTraining(basics)).kcal);
});
