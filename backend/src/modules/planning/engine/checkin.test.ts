import { test } from "node:test";
import assert from "node:assert/strict";
import { addDaysIso, buildWeek, checkinOpen, computeTargets, cycleResults, kcalCorrection, nextLoads, planNextCycle } from "./index.js";
import type { CheckinAnswers, CycleInput, CycleResults, LoggedSet, TrainingInput } from "./index.js";

// 81 kg, losing 0.75 %/week → planned −3.6 kg over 6 weeks. 2026-11-02 is a Monday.
const t: TrainingInput = {
  sex: "MALE", age: 30, heightCm: 168, weightKg: 81, bodyFatLevel: 2, goal: "LOSE_FAT", targetWeightKg: 71, pace: "MODERATE",
  experience: "SOME", liftComfort: "LEARNING", equipment: "FULL_GYM", availableDays: [0, 1, 2, 3, 4], daysPerWeek: 4, sessionMinutes: 60,
  split: "AUTO", fullBodyDay: false, priorityMuscles: [], lowPriorityMuscles: [], injuries: [], activityLevel: "DESK", sleepHours: 7,
  sleepQuality: null, trainTime: null, busyness: null, warmup: true, cardioLikes: [], blockers: [],
};
const start = "2026-11-02", end = addDaysIso(start, 41), today = addDaysIso(start, 41);
const planned = Array.from({ length: 42 }, (_, k) => addDaysIso(start, k)).filter((_, k) => [0, 1, 3, 4].includes(k % 7)); // 24
const input = (o: Partial<CycleInput> = {}): CycleInput => ({
  training: t, startDate: start, endDate: end, today,
  weights: [{ date: start, kg: 81 }, ...[35, 37, 39, 41].map((k) => ({ date: addDaysIso(start, k), kg: 78 }))],
  plannedDates: planned, workoutDates: planned.slice(0, 20), sets: [], ...o,
});
const answers: CheckinAnswers = { feel: "ABOUT_RIGHT", eating: "MOST_DAYS", days: 4 };

test("check-in opens on day 40", () => {
  assert.equal(checkinOpen(start, addDaysIso(start, 39)), false);
  assert.equal(checkinOpen(start, addDaysIso(start, 40)), true);
});

test("results: weight from start and end averages, sessions, best main lift", () => {
  const sets: LoggedSet[] = [
    { name: "Back squat", date: addDaysIso(start, 1), weightKg: 60, reps: 8 },
    { name: "Back squat", date: addDaysIso(start, 36), weightKg: 72.5, reps: 8 },
    { name: "Bench press", date: addDaysIso(start, 0), weightKg: 50, reps: 8 },
    { name: "Bench press", date: addDaysIso(start, 35), weightKg: 55, reps: 8 },
    { name: "EZ-bar curl", date: addDaysIso(start, 35), weightKg: 99, reps: 8 },
  ];
  const r = cycleResults(input({ sets }), 4, 4);
  assert.equal(r.startKg, 81);
  assert.equal(r.endKg, 78);
  assert.equal(r.changeKg, -3);
  assert.equal(r.plannedChangeKg, -3.6);
  assert.deepEqual([r.sessionsDone, r.sessionsPlanned], [20, 24]);
  assert.deepEqual(r.bestLift, { name: "Back squat", fromKg: 60, toKg: 72.5 }, "accessories don't count");
  assert.equal(r.needsWeighIn, false);
  assert.equal(r.goalReached, false);
  assert.equal(r.suggestedDays, 4);
});

test("results: asks for a weigh-in, falls back to intake weight, suggests one fewer day under 60%", () => {
  const r = cycleResults(input({ weights: [], workoutDates: planned.slice(0, 12) }), 4, 4);
  assert.equal(r.startKg, 81);
  assert.equal(r.endKg, null);
  assert.equal(r.needsWeighIn, true);
  assert.equal(r.suggestedDays, 3, "12 of 24 is 50%");
  assert.equal(cycleResults(input({ workoutDates: planned.slice(0, 12) }), 3, 4).suggestedDays, 3, "never below the range");
});

test("results: goal reached suggests a next target, never below a healthy weight", () => {
  const near = (kg: number) => [35, 41].map((k) => ({ date: addDaysIso(start, k), kg }));
  const r = cycleResults(input({ training: { ...t, targetWeightKg: 78 }, weights: near(78.3) }), 4, 4);
  assert.equal(r.goalReached, true);
  assert.equal(r.suggestedTargetKg, 74.8, "another 6 weeks at the same pace");
  const lean = cycleResults(input({ training: { ...t, targetWeightKg: 53 }, weights: near(53) }), 4, 4);
  assert.equal(lean.suggestedTargetKg, null, "18.5 BMI at 168 cm is 52.2 kg, under a kilo away");
});

const res = (o: Partial<CycleResults>): CycleResults => ({ ...cycleResults(input(), 4, 4), ...o });

test("calories: ±150 against the planned pace, never tighter when eating was hard", () => {
  assert.equal(kcalCorrection("LOSE_FAT", res({ changeKg: -3 }), "MOST_DAYS").delta, 0, "83% of plan");
  assert.equal(kcalCorrection("LOSE_FAT", res({ changeKg: -1 }), "MOST_DAYS").delta, -150, "28% of plan");
  assert.equal(kcalCorrection("LOSE_FAT", res({ changeKg: -1 }), "SOME_DAYS").delta, 0);
  assert.equal(kcalCorrection("LOSE_FAT", res({ changeKg: -1 }), "HARD").delta, 0);
  assert.equal(kcalCorrection("LOSE_FAT", res({ changeKg: -6 }), "MOST_DAYS").delta, 150, "too fast");
  assert.equal(kcalCorrection("BUILD_MUSCLE", res({ changeKg: 0.2, plannedChangeKg: 1.9 }), "MOST_DAYS").delta, 150);
  assert.equal(kcalCorrection("BUILD_MUSCLE", res({ changeKg: 3.5, plannedChangeKg: 1.9 }), "MOST_DAYS").delta, -150);
  assert.equal(kcalCorrection("RECOMP", res({ changeKg: 1.4, plannedChangeKg: 0 }), "MOST_DAYS").delta, -150);
  assert.equal(kcalCorrection("RECOMP", res({ changeKg: -0.6, plannedChangeKg: 0 }), "MOST_DAYS").delta, 0);
  assert.equal(kcalCorrection("LOSE_FAT", res({ endKg: null, changeKg: null }), "MOST_DAYS").delta, 0);
});

const base = { training: t, onboardingDays: 4, currentDays: 4, cycleNumber: 1, currentKcal: computeTargets(t).kcal, prevKcalOffset: 0, sets: [], startDate: start, today };

test("next cycle: new weight lowers calories, slow loss cuts 150 more, offset carries and is capped", () => {
  const same = planNextCycle({ ...base, results: res({}), answers });
  assert.equal(same.training.weightKg, 78);
  assert.equal(same.kcalOffset, 0);
  assert.ok(same.targets.kcal < base.currentKcal, "lighter body, fewer calories");
  const slow = planNextCycle({ ...base, results: res({ changeKg: -1 }), answers });
  assert.equal(slow.kcalOffset, -150);
  assert.equal(slow.targets.kcal, computeTargets({ ...t, weightKg: 78 }, 4, -150).kcal);
  assert.equal(planNextCycle({ ...base, prevKcalOffset: -400, results: res({ changeKg: -1 }), answers }).kcalOffset, -450);
  const floor = computeTargets({ ...t, weightKg: 50, heightCm: 150, age: 60, sex: "FEMALE" }, 2, -450);
  assert.ok(floor.kcal >= 1250, "the safety floor still wins");
});

test("next cycle: days, sets, rotation and the change list", () => {
  const easy = planNextCycle({ ...base, results: res({}), answers: { ...answers, feel: "TOO_EASY", days: 3 } });
  assert.equal(easy.days, 3);
  assert.equal(easy.week.sessions.length, 3);
  const bench = easy.week.sessions.flatMap((s) => s.exercises).find((e) => e.name === "Bench press")!;
  assert.equal(bench.sets, 5, "main lift +1");
  assert.ok(easy.changes.some((c) => c.title === "4 → 3 training days a week"));
  assert.ok(easy.changes.some((c) => /new accessory/.test(c.title)));
  assert.ok(easy.week.sessions.flatMap((s) => s.exercises).some((e) => e.rotatedFrom), "accessories rotate in cycle 2");

  const hard = planNextCycle({ ...base, results: res({}), answers: { ...answers, feel: "TOO_HARD" } });
  const all = hard.week.sessions.flatMap((s) => s.exercises);
  assert.equal(all.find((e) => e.name === "Bench press")!.sets, 4, "main lifts keep their sets");
  assert.ok(all.filter((e) => !e.isCore && /lateral|curl|lunge/i.test(e.name)).every((e) => e.sets === 3), "accessories −1");

  const kept = planNextCycle({ ...base, results: res({}), answers: { ...answers, keep: ["Cable lateral raise"] } });
  assert.ok(kept.week.sessions.flatMap((s) => s.exercises).some((e) => e.name === "Cable lateral raise"), "kept instead of rotated");
});

test("next cycle: goal reached → new target or maintain at this weight", () => {
  const r = res({ goalReached: true, endKg: 71, changeKg: -10 });
  const next = planNextCycle({ ...base, results: r, answers: { ...answers, goalChoice: "NEW_TARGET", newTargetKg: 68 } });
  assert.equal(next.training.targetWeightKg, 68);
  assert.equal(next.training.goal, "LOSE_FAT");
  assert.equal(next.changes[0].title, "New target: 68 kg");
  const hold = planNextCycle({ ...base, prevKcalOffset: -150, results: r, answers: { ...answers, goalChoice: "MAINTAIN" } });
  assert.equal(hold.training.goal, "RECOMP");
  assert.equal(hold.training.targetWeightKg, null);
  assert.equal(hold.kcalOffset, 0, "new goal, fresh calories");
});

test("starting weights: weeks 5-6 heaviest set, +2.5 kg lower / +1.25 kg upper at the top of the range", () => {
  const week = buildWeek(t);
  const d = addDaysIso(start, 36);
  const loads = nextLoads(week, [
    { name: "Back squat", date: d, weightKg: 70, reps: 10 },
    { name: "Bench press", date: d, weightKg: 55, reps: 10 },
    { name: "Lat pulldown", date: d, weightKg: 50, reps: 7 },
    { name: "Lat pulldown", date: addDaysIso(start, 10), weightKg: 60, reps: 10 },
  ], start, today);
  assert.deepEqual(loads, { "Back squat": 72.5, "Bench press": 56.25, "Lat pulldown": 50 });
});
