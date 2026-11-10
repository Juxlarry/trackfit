import { test } from "node:test";
import assert from "node:assert/strict";
import { activityCounts, activityDoneDays, scheduledDays, streak, weeklyTally } from "./routine-schedule.js";

// 2026-11-10 is a Tuesday (weekday 1).
const TUE = [1];
const run5k = { activityType: "RUN", minDistanceKm: 5, minMinutes: null };

test("what counts: type, distance (with a little rounding slack) and minutes", () => {
  assert.equal(activityCounts(run5k, { activityType: "RUN", durationMinutes: 30, distanceKm: 5.2 }), true);
  assert.equal(activityCounts(run5k, { activityType: "RUN", durationMinutes: 30, distanceKm: 4.996 }), true);
  assert.equal(activityCounts(run5k, { activityType: "RUN", durationMinutes: 30, distanceKm: 4.9 }), false);
  assert.equal(activityCounts(run5k, { activityType: "RUN", durationMinutes: 30, distanceKm: null }), false, "no distance logged");
  assert.equal(activityCounts(run5k, { activityType: "WALK", durationMinutes: 60, distanceKm: 6 }), false);
  assert.equal(activityCounts({ activityType: "FOOTBALL", minDistanceKm: null, minMinutes: 45 }, { activityType: "FOOTBALL", durationMinutes: 44, distanceKm: null }), false);
  assert.equal(activityCounts({ activityType: null, minDistanceKm: null, minMinutes: 20 }, { activityType: "SWIM", durationMinutes: 20, distanceKm: null }), true, "any type");
});

test("scheduled days and done days", () => {
  assert.deepEqual(scheduledDays([1, 3], "2026-11-09", "2026-11-22"), ["2026-11-10", "2026-11-12", "2026-11-17", "2026-11-19"]);
  const done = activityDoneDays(TUE, run5k, [
    { performedOn: "2026-11-10", activityType: "RUN", durationMinutes: 28, distanceKm: 5.2 },
    { performedOn: "2026-11-11", activityType: "RUN", durationMinutes: 28, distanceKm: 5.2 },
    { performedOn: "2026-11-03", activityType: "RUN", durationMinutes: 20, distanceKm: 3 },
  ]);
  assert.deepEqual([...done], ["2026-11-10"], "only scheduled days, and only runs that meet the bar");
});

test("streak counts back from today; an unfinished today doesn't break it", () => {
  const done = new Set(["2026-10-27", "2026-11-03"]);
  assert.equal(streak(TUE, "2026-10-01", "2026-11-10", done), 2, "today not done yet");
  assert.equal(streak(TUE, "2026-10-01", "2026-11-10", new Set([...done, "2026-11-10"])), 3);
  assert.equal(streak(TUE, "2026-10-01", "2026-11-11", done), 0, "yesterday's Tuesday was missed");
  assert.equal(streak(TUE, "2026-11-01", "2026-11-10", new Set(["2026-11-03"])), 1, "nothing before the start");
  assert.equal(streak([0, 1, 2, 3, 4, 5, 6], "2026-11-01", "2026-11-10", new Set(["2026-11-08", "2026-11-09"])), 2, "every day");
});

test("weekly tally: oldest week first, from the start, future days scheduled but not done", () => {
  const t = weeklyTally([1, 3], "2026-11-04", "2026-11-10", new Set(["2026-11-05", "2026-11-10"]), 3);
  assert.deepEqual(t, [
    { weekStart: "2026-10-26", done: 0, scheduled: 0 },
    { weekStart: "2026-11-02", done: 1, scheduled: 1 },
    { weekStart: "2026-11-09", done: 1, scheduled: 2 },
  ]);
});
