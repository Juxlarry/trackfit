import { test } from "node:test";
import assert from "node:assert/strict";
import { periodOf, periodsOf, progressOf, progressText, stateOf, winDraft } from "./challenge-schedule.js";

// 2026-11-09 is a Monday.
const daily = { cadence: "DAILY" as const, startsOn: "2026-11-11", endsOn: "2026-11-15" };
const weekly = { cadence: "WEEKLY" as const, startsOn: "2026-11-12", endsOn: "2026-11-25" };

test("a daily challenge counts each day it runs", () => {
  assert.equal(periodOf(daily, "2026-11-10"), null);
  assert.equal(periodOf(daily, "2026-11-13"), "2026-11-13");
  assert.equal(periodOf(daily, "2026-11-16"), null);
  assert.deepEqual(periodsOf(daily), ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
});

test("a weekly challenge counts once per Monday-to-Sunday week, cut to its own dates", () => {
  assert.equal(periodOf(weekly, "2026-11-15"), "2026-11-12", "Thursday to Sunday is the first week");
  assert.equal(periodOf(weekly, "2026-11-16"), "2026-11-16");
  assert.equal(periodOf(weekly, "2026-11-25"), "2026-11-23");
  assert.deepEqual(periodsOf(weekly), ["2026-11-12", "2026-11-16", "2026-11-23"]);
  assert.deepEqual(periodsOf({ cadence: "WEEKLY", startsOn: "2026-11-09", endsOn: "2026-11-15" }), ["2026-11-09"]);
});

test("progress: complete only when every day or week has proof", () => {
  assert.deepEqual(progressOf(daily, ["2026-11-11", "2026-11-12", "2026-11-01"]), { done: 2, total: 5, complete: false });
  assert.deepEqual(progressOf(weekly, ["2026-11-12", "2026-11-16", "2026-11-23"]), { done: 3, total: 3, complete: true });
  assert.equal(progressText(daily, 5, 7), "5 of 7 days");
  assert.equal(progressText(weekly, 1, 1), "1 of 1 week");
});

test("state and the drafted win", () => {
  assert.equal(stateOf({ ...daily, endedAt: null }, "2026-11-10"), "UPCOMING");
  assert.equal(stateOf({ ...daily, endedAt: null }, "2026-11-15"), "RUNNING");
  assert.equal(stateOf({ ...daily, endedAt: null }, "2026-11-16"), "FINISHED");
  assert.equal(stateOf({ ...daily, endedAt: new Date() }, "2026-11-12"), "ENDED");
  assert.equal(winDraft({ ...daily, title: "Drink 500 ml" }, 5), "Challenge done: Drink 500 ml, all 5 days with proof.");
  assert.equal(winDraft({ ...weekly, title: "Run 3 km" }, 1), "Challenge done: Run 3 km.");
});
