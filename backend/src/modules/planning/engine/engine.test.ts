import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECIPES, allGeneratorExercises, buildWeek, computeProjection, computeTargets, dayRange, estimateActivityKcal,
  exercisesFor, generatePlan, isIsolation, isScreenedOut, menuFor, pickDays, splitTypes, suggestLoadKg, swapIssue, swappedOrder,
  targetMuscle, targetWeightIssue, validateIntake, weekTypes, weekdayOf,
} from "./index.js";
import type { DietInput, TrainingInput } from "./index.js";

const jay: TrainingInput = {
  sex: "MALE", age: 30, heightCm: 168, weightKg: 81.2, bodyFatLevel: 2, goal: "LOSE_FAT", targetWeightKg: 71,
  pace: "MODERATE", experience: "SOME", liftComfort: "LEARNING", equipment: "FULL_GYM", availableDays: [0, 1, 2, 3, 4],
  daysPerWeek: 4, sessionMinutes: 60, split: "AUTO", fullBodyDay: false, priorityMuscles: ["CHEST", "ARMS"],
  lowPriorityMuscles: [], injuries: ["KNEE"], activityLevel: "DESK", sleepHours: 6.5, sleepQuality: "VARIES", trainTime: "EVENING",
  busyness: "PACKED", warmup: true, cardioLikes: ["football", "walk"], blockers: ["TIME"],
};
const diet: DietInput = {
  pattern: "OMNIVORE", allergies: [], dislikes: "", favouriteDishes: ["jollof", "waakye", "banku", "oats"],
  mealPattern: "THREE", prep: "BATCH_FEW_DAYS", fasting: "NO", struggles: ["WEEKENDS"],
};

test("health gate: any flag screens out", () => {
  const none = { heartCondition: false, highBloodPressure: false, diabetes: false, pregnant: false, recentSurgeryOrInjury: false, chestPainOrDizziness: false, under18: false };
  assert.equal(isScreenedOut(none), false);
  assert.equal(isScreenedOut({ ...none, diabetes: true }), true);
});

test("targets: Mifflin-St Jeor, deficit, protein and floors", () => {
  const t = computeTargets(jay);
  assert.equal(t.bmr, Math.round(10 * 81.2 + 6.25 * 168 - 5 * 30 + 5));
  assert.ok(t.kcal < t.tdee, "fat loss eats below maintenance");
  assert.ok(t.kcal >= 1500, "male floor");
  assert.equal(t.proteinG, Math.round(81.2 * 2.0));
  const tiny = computeTargets({ ...jay, sex: "FEMALE", weightKg: 45, heightCm: 150, age: 60, pace: "AMBITIOUS", activityLevel: "DESK", sessionMinutes: 30, daysPerWeek: 2 });
  assert.ok(tiny.kcal >= 1250, "female floor");
});

test("more training days raise the calorie target", () => {
  assert.ok(computeTargets(jay, 5).kcal > computeTargets(jay, 3).kcal);
});

test("projection: weeks and end date", () => {
  const p = computeProjection(jay, "2026-10-27");
  assert.ok(p);
  assert.ok(p!.weeks > 10 && p!.weeks < 30);
  assert.equal(p!.endDate > "2027-01-01", true);
  assert.equal(computeProjection({ ...jay, goal: "MAINTAIN", pace: null }, "2026-10-27"), null);
});

test("±1 day range is anchored to the onboarding answer", () => {
  assert.deepEqual(dayRange(4), { min: 3, max: 5 });
  assert.deepEqual(dayRange(2), { min: 2, max: 3 });
  assert.deepEqual(dayRange(6), { min: 5, max: 6 });
});

test("splits, including the full-body-day toggle", () => {
  assert.deepEqual(splitTypes(4, jay), ["UPPER", "LOWER", "UPPER", "LOWER"]);
  assert.deepEqual(splitTypes(4, { ...jay, fullBodyDay: true }), ["UPPER", "LOWER", "UPPER", "FULL"]);
  assert.deepEqual(splitTypes(2, { ...jay, fullBodyDay: true }), ["FULL", "FULL"]);
  assert.deepEqual(splitTypes(3, { ...jay, experience: "NEW" }), ["FULL", "FULL", "FULL"]);
  assert.deepEqual(splitTypes(3, { ...jay, split: "MUSCLE_FOCUS" }), ["UPPER", "LOWER", "FULL"], "focus falls back below 4 days");
});

test("pickDays spaces sessions within available days", () => {
  assert.deepEqual(pickDays(3, [0, 1, 2, 3, 4]), [0, 2, 4]);
  const four = pickDays(4, [0, 1, 2, 3, 4]);
  assert.equal(four.length, 4);
  assert.ok(four.every((d) => d <= 4));
  assert.equal(pickDays(5, [0, 1, 2, 3]).length, 5, "goes outside availability only when it must");
});

test("every session has core work, warm-up and injury swaps", () => {
  const w = buildWeek(jay);
  for (const s of w.sessions) {
    assert.ok(s.exercises.some((e) => e.isCore), `${s.name} has core`);
    assert.equal(s.warmup.length, 4);
  }
  const lower = exercisesFor("LOWER", jay);
  const squat = lower.find((e) => e.replaces === "Back squat");
  assert.equal(squat?.name, "Box squat to bench");
  assert.equal(squat?.swapped, true);
  const noWarm = buildWeek({ ...jay, warmup: false });
  assert.equal(noWarm.sessions[0].warmup.length, 0);
});

test("prioritising core adds a second core move; short sessions pay for the warm-up", () => {
  const ex = exercisesFor("UPPER", { ...jay, priorityMuscles: ["CORE"] });
  assert.equal(ex.filter((e) => e.isCore).length, 2);
  assert.equal(exercisesFor("UPPER", { ...jay, sessionMinutes: 45 }).length, 4);
  assert.equal(exercisesFor("UPPER", { ...jay, sessionMinutes: 45, warmup: false }).length, 5);
});

test("priority muscles get an exercise, extra sets and go first", () => {
  const plain = { ...jay, priorityMuscles: [] };
  const ex = exercisesFor("UPPER", { ...plain, priorityMuscles: ["ARMS"] });
  assert.equal(ex.length, exercisesFor("UPPER", plain).length, "same session length");
  assert.equal(targetMuscle(ex[0].name), "ARMS", "arms work goes first");
  assert.equal(ex[0].sets, 5);
  assert.ok(ex.filter((e) => e.isCore).length >= 1, "core still closes the session");
  assert.ok(ex[ex.length - 1].isCore);
});

test("low-priority muscles keep their big lifts but lose isolation work and a set", () => {
  const plain = { ...jay, priorityMuscles: [] };
  const base = exercisesFor("UPPER", plain);
  const ex = exercisesFor("UPPER", { ...plain, lowPriorityMuscles: ["SHOULDERS"] });
  assert.equal(ex.length, base.length);
  assert.ok(base.some((e) => /lateral raise/i.test(e.name)), "the plain plan has lateral raises");
  assert.ok(!ex.some((e) => targetMuscle(e.name) === "SHOULDERS" && isIsolation(e.name)), "no shoulder isolation");
  const press = ex.find((e) => /shoulder press/i.test(e.name))!;
  assert.equal(press.sets, 3, "compound kept at maintenance volume");
  assert.equal(ex.find((e) => e.name === "Bench press")?.sets, 4, "other muscles unchanged");
  // Nothing to replace with: the isolation move stays, at fewer sets.
  const legs = exercisesFor("LEGS", { ...plain, injuries: [], lowPriorityMuscles: ["LEGS"] });
  assert.ok(legs.every((e) => e.isCore || e.sets === 3));
  assert.ok(generatePlan({ ...plain, lowPriorityMuscles: ["SHOULDERS"] }, diet, "2026-10-27").adaptations.some((a) => /maintenance/.test(a.text)));
});

test("weekly day swaps: training days only, capped, and no new back-to-back clashes", () => {
  // Mon Upper, Tue Lower, Thu Upper, Fri Lower
  const plan = weekTypes([{ weekday: 0, type: "UPPER" }, { weekday: 1, type: "LOWER" }, { weekday: 3, type: "UPPER" }, { weekday: 4, type: "LOWER" }]);
  assert.deepEqual(swappedOrder([[0, 1], [1, 3]]), [1, 3, 2, 0, 4, 5, 6]);
  assert.equal(swapIssue(plan, [], 0, 1), null, "Upper/Lower trade places");
  assert.match(swapIssue(plan, [], 0, 2)!, /training days/);
  assert.match(swapIssue(plan, [], 0, 3)!, /same workout/);
  assert.match(swapIssue(plan, [], 1, 3)!, /back-to-back/, "Upper Mon + Upper Tue");
  assert.match(swapIssue(plan, [[0, 1], [3, 4]], 0, 1)!, /2 swaps/);
  // Push Mon, Pull Tue, Legs Wed, Full Fri: Push and Pull can trade.
  const ppl = weekTypes([{ weekday: 0, type: "PUSH" }, { weekday: 1, type: "PULL" }, { weekday: 2, type: "LEGS" }, { weekday: 4, type: "FULL" }]);
  assert.equal(swapIssue(ppl, [], 0, 1), null);
  assert.match(swapIssue(ppl, [], 2, 4)!, /back-to-back/, "Full body next to Pull");
});

test("load suggestions", () => {
  assert.equal(suggestLoadKg("Push-up", jay), null);
  assert.equal(suggestLoadKg("Bench press", { ...jay, equipment: "BODYWEIGHT" }), null);
  const bench = suggestLoadKg("Bench press", jay)!;
  assert.equal(bench % 2.5, 0);
  assert.ok(bench > 20 && bench < 60);
});

test("menus respect diet and allergens and hit the calorie target", () => {
  const t = computeTargets(jay);
  const m = menuFor("2026-10-27", diet, t);
  assert.equal(m.items.length, 3);
  const total = m.items.reduce((a, x) => a + x.kcal, 0);
  assert.ok(Math.abs(total - t.kcal) <= 30);
  assert.equal(new Set(m.items.map((x) => x.recipeKey)).size, 3);
  const vegan = menuFor("2026-10-27", { ...diet, pattern: "VEGAN", allergies: ["PEANUTS", "SOY"] }, t);
  for (const it of vegan.items) {
    const rec = RECIPES.find((r) => r.key === it.recipeKey)!;
    assert.ok(rec.diets.includes("VEGAN"), `${rec.key} is vegan`);
    assert.ok(!rec.allergens.includes("PEANUTS") && !rec.allergens.includes("SOY"), `${rec.key} avoids allergens`);
  }
  const swapped = menuFor("2026-10-27", diet, t, { 1: "redred-plantain" });
  assert.equal(swapped.items[1].recipeKey, "redred-plantain");
});

test("every diet pattern has at least one recipe per slot with no allergies", () => {
  for (const pattern of ["OMNIVORE", "HALAL", "PESCATARIAN", "VEGETARIAN", "VEGAN", "OTHER"] as const) {
    for (const slot of ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const) {
      assert.ok(RECIPES.some((r) => r.slot === slot && r.diets.includes(pattern)), `${pattern} ${slot}`);
    }
  }
});

test("validation", () => {
  assert.deepEqual(validateIntake(jay, diet), []);
  assert.match(targetWeightIssue({ ...jay, targetWeightKg: 45 })!, /healthy range/);
  assert.match(targetWeightIssue({ ...jay, targetWeightKg: 85 })!, /below your current/);
  const issues = validateIntake({ ...jay, age: 16, availableDays: [1], daysPerWeek: 4 }, { ...diet, favouriteDishes: ["jollof"] });
  assert.deepEqual(issues.map((x) => x.field).sort(), ["age", "availableDays", "daysPerWeek", "favouriteDishes"]);
  assert.deepEqual(validateIntake({ ...jay, lowPriorityMuscles: ["LEGS", "GLUTES"] }, diet), []);
  for (const low of [["CHEST"], ["CORE"], ["LEGS", "GLUTES", "BACK"]] as const) {
    assert.deepEqual(validateIntake({ ...jay, lowPriorityMuscles: [...low] }, diet).map((x) => x.field), ["lowPriorityMuscles"], low.join());
  }
});

test("activity calories and dates", () => {
  assert.equal(estimateActivityKcal("WALK", 60, 80), 280);
  assert.equal(estimateActivityKcal("FOOTBALL", 60, 80, "HARD"), Math.round(7 * 1.2 * 80));
  assert.equal(weekdayOf("2026-10-26"), 0, "Monday");
  assert.equal(weekdayOf("2026-11-01"), 6, "Sunday");
});

test("generatePlan bundles everything and every exercise is seedable", () => {
  const p = generatePlan(jay, diet, "2026-10-27");
  assert.equal(p.week.sessions.length, 4);
  assert.equal(p.week.restDays.length, 3);
  assert.ok(p.adaptations.length >= 4);
  const known = new Set(allGeneratorExercises());
  for (const s of buildWeek({ ...jay, priorityMuscles: ["CORE"], injuries: ["KNEE", "LOWER_BACK", "SHOULDER", "ELBOW", "WRIST", "HIP"] }, 6).sessions)
    for (const e of s.exercises) assert.ok(known.has(e.name), `${e.name} is in the seed list`);
});
