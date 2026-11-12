import { test } from "node:test";
import assert from "node:assert/strict";
import { lighterStep, progressionOffer, repRange, weightStep, type Ease, type ExerciseSessionLog } from "./index.js";

const PLAN = { sets: 4, reps: "6-10" };
/** Sessions oldest first: [kg, reps, ease, sets?]. */
const hist = (...s: [number, number, Ease | null, number?][]): ExerciseSessionLog[] =>
  s.map(([kg, reps, ease, sets = 4], i) => ({ startedAt: `2026-11-${String(i + 1).padStart(2, "0")}T10:00:00Z`, ease, sets: Array.from({ length: sets }, () => ({ reps, weightKg: kg })) }));
const offer = (h: ExerciseSessionLog[], name = "Bench press", plan = PLAN) => progressionOffer(name, plan, h);

test("rep ranges", () => {
  assert.deepEqual(repRange("6-10"), { low: 6, high: 10, timed: false });
  assert.deepEqual(repRange("12"), { low: 12, high: 12, timed: false });
  assert.deepEqual(repRange("30-45s"), { low: 30, high: 45, timed: true });
});

test("no history or unrated latest: no offer", () => {
  assert.equal(offer([]), null);
  assert.equal(offer(hist([40, 8, "EASY"], [40, 8, null])), null);
});

test("one steady session: +1 rep as a goal only", () => {
  const o = offer(hist([40, 8, "EASY"]))!;
  assert.equal(o.kind, "GOAL");
  assert.equal(o.reps, 9);
  assert.equal(o.weightKg, 40);
});

test("2 and 3 steady sessions offer +1 rep, Easy or Okay", () => {
  assert.deepEqual(offer(hist([40, 8, "OKAY"], [40, 8, "EASY"]))!.kind, "REPS_UP");
  assert.equal(offer(hist([40, 8, "OKAY"], [40, 8, "OKAY"]))!.reps, 9);
  const o = offer(hist([40, 8, "EASY"], [40, 8, "EASY"], [40, 9, "OKAY"]))!;
  assert.equal(o.kind, "REPS_UP");
  assert.equal(o.reps, 10);
  assert.equal(o.steady, 3);
});

test("reps stop at the top of the range until the weight step", () => {
  assert.equal(offer(hist([40, 10, "EASY"], [40, 10, "EASY"])), null);
});

test("4 steady sessions offer the next weight, reps back to the bottom", () => {
  const o = offer(hist([40, 8, "EASY"], [40, 8, "EASY"], [40, 9, "OKAY"], [40, 10, "EASY"]))!;
  assert.equal(o.kind, "WEIGHT_UP");
  assert.equal(o.weightKg, 42.5);
  assert.equal(o.reps, 6);
  assert.equal(o.fromWeightKg, 40);
});

test("the count restarts at a new weight", () => {
  const o = offer(hist([40, 8, "EASY"], [40, 8, "EASY"], [40, 9, "EASY"], [40, 10, "EASY"], [42.5, 6, "EASY"]))!;
  assert.equal(o.kind, "GOAL");
  assert.equal(o.steady, 1);
});

test("a Hard session or a missed set breaks the streak", () => {
  assert.equal(offer(hist([40, 8, "HARD"], [40, 8, "EASY"]))!.kind, "GOAL");
  assert.equal(offer(hist([40, 8, "EASY"], [40, 8, "EASY", 3]))!.kind, "GOAL");
  assert.equal(offer(hist([40, 8, "EASY", 3], [40, 8, "EASY"], [40, 8, "EASY"], [40, 8, "EASY"]))!.kind, "REPS_UP");
});

test("latest Hard holds; Hard twice offers about 10% lighter", () => {
  assert.equal(offer(hist([40, 8, "EASY"], [40, 8, "HARD"])), null);
  const o = offer(hist([40, 8, "HARD"], [40, 7, "HARD"]))!;
  assert.equal(o.kind, "LIGHTER");
  assert.equal(o.weightKg, 35);
  assert.equal(o.reps, 6);
});

test("weight steps per equipment and unit", () => {
  assert.equal(weightStep("Bench press", 40, "METRIC"), 42.5);
  assert.equal(weightStep("Incline DB press", 16, "METRIC"), 18);
  assert.equal(weightStep("Machine chest press", 30, "METRIC"), 32.5);
  assert.equal(Math.round(weightStep("Bench press", 100 * 0.45359237, "IMPERIAL") / 0.45359237), 105);
  assert.equal(lighterStep("Incline DB press", 20, "METRIC"), 18);
});

test("bodyweight moves count sessions at the same reps", () => {
  const plan = { sets: 3, reps: "8-12" };
  const two = progressionOffer("Push-up", plan, hist([0, 10, "EASY", 3], [0, 10, "OKAY", 3]))!;
  assert.equal(two.kind, "REPS_UP");
  assert.equal(two.reps, 11);
  assert.equal(two.weightKg, null);
  const four = progressionOffer("Push-up", plan, hist([0, 10, "EASY", 3], [0, 10, "EASY", 3], [0, 10, "EASY", 3], [0, 10, "EASY", 3]))!;
  assert.equal(four.reps, 12);
  const timed = progressionOffer("Plank", { sets: 3, reps: "30-45s" }, hist([0, 30, "EASY", 3], [0, 30, "EASY", 3]))!;
  assert.equal(timed.reps, 35);
  assert.equal(progressionOffer("Push-up", plan, hist([0, 10, "HARD", 3], [0, 10, "HARD", 3])), null);
});
