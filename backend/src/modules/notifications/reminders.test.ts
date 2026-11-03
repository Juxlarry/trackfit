import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFS, dueReminders, localNow, type ReminderPlan } from "./reminders.js";

// 2026-11-02 is a Monday. Sessions Mon/Wed/Fri (weekday 0 = Monday).
const plan: ReminderPlan = {
  reminderTime: "17:30",
  prefs: DEFAULT_PREFS,
  startDate: "2026-11-02",
  endDate: "2026-12-13",
  sessions: [{ weekday: 0, name: "Upper A" }, { weekday: 2, name: "Lower A" }, { weekday: 4, name: "Upper B" }],
  swaps: [],
};
const at = (date: string, hhmm: string) => ({ date, minutes: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) });
const none = { loggedToday: false, loggedYesterday: false, weighedRecently: false };
const kinds = (p: ReminderPlan, date: string, hhmm: string, facts = none) => dueReminders(p, at(date, hhmm), facts).map((r) => r.kind);

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

test("training-day reminder: skipped once today's workout is logged", () => {
  assert.deepEqual(kinds(plan, "2026-11-02", "17:30", { ...none, loggedToday: true }), []);
});

test("weigh-in: 07:30 on plan days 7, 14, 21, 28 and 35, unless weighed in the last 3 days", () => {
  assert.deepEqual(kinds(plan, "2026-11-02", "07:30"), [], "day 0 is on the Today checklist instead");
  assert.deepEqual(kinds(plan, "2026-11-09", "07:29"), []);
  assert.deepEqual(kinds(plan, "2026-11-09", "07:30"), ["WEIGH_IN"], "day 7");
  assert.deepEqual(kinds(plan, "2026-11-10", "07:30"), [], "day 8");
  assert.deepEqual(kinds(plan, "2026-11-30", "07:45"), ["WEIGH_IN"], "day 28");
  assert.deepEqual(kinds(plan, "2026-12-14", "07:30"), ["CHECKIN_READY"], "day 42 belongs to the check-in");
  assert.deepEqual(kinds(plan, "2026-11-09", "07:30", { ...none, weighedRecently: true }), []);
  assert.deepEqual(kinds({ ...plan, prefs: { ...DEFAULT_PREFS, weighIn: false } }, "2026-11-09", "07:30"), []);
});

test("photo slots: one morning notification with the weigh-in, or alone when the weigh-in isn't needed", () => {
  const both = dueReminders(plan, at("2026-11-16", "07:30"), none);
  assert.deepEqual(both.map((r) => r.kind), ["WEIGH_IN"], "day 14: a single notification");
  assert.equal(both[0].msg.title, "Weigh-in day, and your Week 3 photo");
  assert.equal(both[0].msg.url, "/progress");
  const alone = dueReminders(plan, at("2026-12-07", "07:30"), { ...none, weighedRecently: true });
  assert.deepEqual(alone.map((r) => [r.kind, r.msg.title]), [["PROGRESS_PHOTO", "Your Week 6 photo slot is open"]], "day 35");
  assert.deepEqual(kinds({ ...plan, prefs: { ...DEFAULT_PREFS, weighIn: false } }, "2026-11-16", "07:30"), ["PROGRESS_PHOTO"]);
  assert.equal(dueReminders({ ...plan, prefs: { ...DEFAULT_PREFS, progressPhotos: false } }, at("2026-11-16", "07:30"), none)[0].msg.title, "Weigh-in day");
});

test("missed session: 08:00 the morning after a planned session with nothing logged", () => {
  const r = dueReminders(plan, at("2026-11-03", "08:00"), none);
  assert.deepEqual(r.map((x) => [x.kind, x.msg.title]), [["MISSED_SESSION", "Missed Upper A yesterday?"]]);
  assert.deepEqual(kinds(plan, "2026-11-03", "08:00", { ...none, loggedYesterday: true }), []);
  assert.deepEqual(kinds(plan, "2026-11-04", "08:00"), [], "yesterday was a rest day");
  assert.deepEqual(kinds(plan, "2026-11-02", "08:00"), [], "no session the day before the plan");
  assert.deepEqual(kinds(plan, "2026-12-14", "08:00"), ["CHECKIN_READY"], "no missed session after a rest day (Sunday), just the check-in");
  assert.deepEqual(kinds({ ...plan, prefs: { ...DEFAULT_PREFS, missedSession: false } }, "2026-11-03", "08:00"), []);
});

test("check-in: 07:30 on days 40, 41 and 42, not switchable", () => {
  const off = { ...plan, prefs: { weighIn: false, progressPhotos: false, missedSession: false } };
  assert.deepEqual(kinds(off, "2026-12-11", "07:30"), [], "day 39");
  assert.deepEqual(kinds(off, "2026-12-12", "07:30"), ["CHECKIN_READY"], "day 40");
  assert.deepEqual(kinds(off, "2026-12-13", "07:30"), ["CHECKIN_READY"]);
  const last = dueReminders(off, at("2026-12-14", "07:30"), none);
  assert.equal(last[0].msg.title, "Your cycle is done. Check in to start the next one", "day 42, the day after the cycle ends");
  assert.equal(last[0].msg.url, "/checkin");
  assert.deepEqual(kinds(off, "2026-12-15", "07:30"), [], "day 43: stops");
});
