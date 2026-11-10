import { test } from "node:test";
import assert from "node:assert/strict";
import { activityDraft, activityPostKind, headlinePrs, paceText, workoutDraft } from "./share-draft.js";

const push = {
  name: "Push day", durationMinutes: 52, setCount: 18, volumeKg: 4350,
  exercises: [{ name: "Bench Press" }, { name: "Overhead Press" }, { name: "Dips" }, { name: "Lateral Raise" }, { name: "Triceps Pushdown" }],
  prs: [
    { exerciseName: "Bench Press", type: "HEAVIEST_SET" as const, weightKg: 80, reps: 5, value: 80 },
    { exerciseName: "Bench Press", type: "ESTIMATED_1RM" as const, weightKg: 80, reps: 5, value: 93.3 },
    { exerciseName: "Dips", type: "MOST_REPS_AT_WEIGHT" as const, weightKg: 0, reps: 15, value: 15 },
  ],
};

test("workout draft: the README's example, in kg", () => {
  assert.equal(workoutDraft(push, "METRIC"), "Push day done in 52 min: 5 exercises, 18 sets, 4,350 kg moved. New best: Bench Press 80 kg × 5.");
});

test("workout draft: pounds for an imperial member, and no PR line without a headline PR", () => {
  assert.equal(
    workoutDraft({ ...push, prs: push.prs.filter((p) => p.type === "MOST_REPS_AT_WEIGHT") }, "IMPERIAL"),
    "Push day done in 52 min: 5 exercises, 18 sets, 9,590 lb moved.",
  );
});

test("workout draft: bodyweight sessions skip the volume; long sessions show hours", () => {
  assert.equal(
    workoutDraft({ name: "Workout", durationMinutes: 75, setCount: 1, volumeKg: 0, exercises: [{ name: "Plank" }], prs: [] }, "METRIC"),
    "Workout done in 1 h 15 min: 1 exercise, 1 set.",
  );
});

test("headline PRs: heaviest set wins over the estimate for the same lift; most-reps is left out", () => {
  const out = headlinePrs([
    { exerciseName: "Squat", type: "ESTIMATED_1RM", weightKg: 100, reps: 3, value: 110 },
    ...push.prs,
  ]);
  assert.deepEqual(out.map((p) => `${p.exerciseName}:${p.type}`), ["Bench Press:HEAVIEST_SET", "Squat:ESTIMATED_1RM"]);
});

test("activity drafts: run pace, cycling speed, sport and routine wording", () => {
  assert.equal(activityDraft({ activityType: "RUN", durationMinutes: 28, distanceKm: 5.2 }, "METRIC"), "Ran 5.2 km in 28 min (5:23 /km).");
  assert.equal(activityDraft({ activityType: "CYCLE", durationMinutes: 50, distanceKm: 20 }, "METRIC"), "Cycled 20 km in 50 min (24.0 km/h).");
  assert.equal(activityDraft({ activityType: "RUN", durationMinutes: 30, distanceKm: null }, "METRIC"), "Ran for 30 min.");
  assert.equal(activityDraft({ activityType: "FOOTBALL", durationMinutes: 90, distanceKm: null }, "METRIC"), "Played football for 1 h 30 min.");
  assert.equal(activityDraft({ activityType: "ABS", durationMinutes: 8, distanceKm: null }, "METRIC"), "Did the abs finisher (8 min).");
  assert.equal(activityDraft({ activityType: "RUN", durationMinutes: 30, distanceKm: 4.828 }, "IMPERIAL"), "Ran 3 mi in 30 min (10:00 /mi).");
});

test("pace rounds 59.6 seconds up to the next minute", () => {
  assert.equal(paceText(5.995, 1, "METRIC"), "6:00 /km");
});

test("activity post kinds", () => {
  assert.deepEqual(["RUN", "CYCLE", "WALK", "SWIM"].map(activityPostKind), ["RUN", "CYCLE", "ACTIVITY", "ACTIVITY"]);
});
