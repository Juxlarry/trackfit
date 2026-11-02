import { test } from "node:test";
import assert from "node:assert/strict";
import { dueReminders, localNow, type ReminderPlan } from "./reminders.js";

// 2026-11-02 is a Monday. Sessions Mon/Wed/Fri (weekday 0 = Monday).
const plan: ReminderPlan = {
  reminderTime: "17:30",
  startDate: "2026-11-02",
  endDate: "2026-12-13",
  sessions: [{ weekday: 0, name: "Upper A" }, { weekday: 2, name: "Lower A" }, { weekday: 4, name: "Upper B" }],
  swaps: [],
};
const at = (date: string, hhmm: string) => ({ date, minutes: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) });
const kinds = (p: ReminderPlan, date: string, hhmm: string) => dueReminders(p, at(date, hhmm)).map((r) => r.kind);

test("local time follows the user's time zone, not the server's", () => {
  const now = new Date("2026-11-02T23:30:00Z");
  assert.deepEqual(localNow(now, "Africa/Accra"), { date: "2026-11-02", minutes: 23 * 60 + 30 });
  assert.deepEqual(localNow(now, "Europe/Berlin"), { date: "2026-11-03", minutes: 30 });
  assert.deepEqual(localNow(now, "America/New_York"), { date: "2026-11-02", minutes: 18 * 60 + 30 });
});

test("training-day reminder: from the set time, for the catch-up window, training days only", () => {
  assert.deepEqual(kinds(plan, "2026-11-02", "17:29"), []);
  assert.deepEqual(kinds(plan, "2026-11-02", "17:30"), ["TRAINING_DAY"]);
  assert.deepEqual(kinds(plan, "2026-11-02", "18:45"), ["TRAINING_DAY"]);
  assert.deepEqual(kinds(plan, "2026-11-02", "19:00"), []);
  assert.deepEqual(kinds(plan, "2026-11-03", "17:30"), [], "Tuesday is a rest day");
  assert.equal(dueReminders(plan, at("2026-11-04", "17:40"))[0].msg.title, "Lower A today");
});

test("training-day reminder: off when no time is set or outside the plan", () => {
  assert.deepEqual(kinds({ ...plan, reminderTime: null }, "2026-11-02", "17:30"), []);
  assert.deepEqual(kinds(plan, "2026-12-14", "17:30"), [], "day after the cycle ends");
});

test("training-day reminder follows this week's day swaps", () => {
  const swapped = { ...plan, swaps: [{ weekStart: "2026-11-02", dayA: 2, dayB: 3 }] };
  assert.deepEqual(kinds(swapped, "2026-11-04", "17:30"), []);
  assert.equal(dueReminders(swapped, at("2026-11-05", "17:30"))[0].msg.title, "Lower A today");
  assert.deepEqual(kinds(swapped, "2026-11-11", "17:30"), ["TRAINING_DAY"], "next week is back to normal");
});

test("evening-before reminder: 19:00 the day before the first session, with or without a reminder time", () => {
  const late = { ...plan, reminderTime: null, startDate: "2026-11-03" }; // Tuesday start, first session Wednesday
  assert.deepEqual(kinds(late, "2026-11-02", "19:00"), []);
  assert.deepEqual(kinds(late, "2026-11-03", "18:59"), []);
  const eve = dueReminders(late, at("2026-11-03", "19:10"));
  assert.deepEqual(eve.map((r) => r.kind), ["PLAN_START_EVE"]);
  assert.equal(eve[0].msg.body, "Lower A on Wednesday. Lay out your kit tonight.");
  assert.deepEqual(kinds(late, "2026-11-05", "19:00"), [], "only before the first session");
});
