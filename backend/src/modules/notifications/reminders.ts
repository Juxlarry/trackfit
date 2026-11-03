import { addDaysIso, daysBetween, sessionOnDate, weekdayOf } from "../planning/engine/index.js";
import { listActiveSessions, listScheduleSwaps, type ScheduleSwapRow } from "../planning/planning.repository.js";
import {
  claimReminder, listReminderCandidates, reminderFacts, releaseReminder, type ReminderCandidate, type ReminderFacts, type ReminderKind, type ReminderPrefsRow,
} from "./notifications.repository.js";
import { pushPublicKey, sendPushToUser, type PushMessage } from "./push.js";

/**
 * Reminders, sent as push notifications (times are the user's local time):
 *  - TRAINING_DAY at the user's reminder time, on days with a session,
 *    unless they've already logged a workout that day.
 *  - PLAN_START_EVE at 19:00 the evening before their first session.
 *  - WEIGH_IN at 07:30 on days 7, 14, 21, 28 and 35 of the plan, unless they
 *    weighed in during the last 3 days. On days 14 and 35 it also says the
 *    Week 3 / Week 6 photo slot is open, so that morning is one notification.
 *  - PROGRESS_PHOTO at 07:30 on days 14 and 35, only when the weigh-in
 *    reminder is off or not needed.
 *  - MISSED_SESSION at 08:00 the day after a planned session with no workout
 *    logged.
 *  - CHECKIN_READY at 07:30 on days 40, 41 and 42 until the week-6 check-in is
 *    done (doing it starts a new cycle, so the days no longer match). Always on.
 * The last three can each be turned off (notifications.reminder_prefs).
 *
 * runReminderJob is called every few minutes (in-process timer, plus an
 * external cron hitting POST /jobs/reminders so a sleeping server wakes up).
 * Each reminder may go out up to WINDOW_MIN late, never twice: reminder_log
 * records it per local date.
 */
export const WINDOW_MIN = 90;
const EVE_MINUTES = 19 * 60;
const MORNING_MINUTES = 7 * 60 + 30;
const MISSED_MINUTES = 8 * 60;
const WEIGH_IN_DAYS = [7, 14, 21, 28, 35];
const PHOTO_DAYS: Record<number, string> = { 14: "Week 3", 35: "Week 6" };
const CHECKIN_DAYS = [40, 41, 42];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export interface LocalNow { date: string; minutes: number }

export function localNow(now: Date, timeZone: string): LocalNow {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const inWindow = (minutes: number, from: number) => minutes >= from && minutes < from + WINDOW_MIN;

export type ReminderPrefs = ReminderPrefsRow;
export const DEFAULT_PREFS: ReminderPrefs = { weighIn: true, progressPhotos: true, missedSession: true };

export interface ReminderPlan {
  reminderTime: string | null;
  prefs: ReminderPrefs;
  startDate: string;
  endDate: string;
  sessions: { weekday: number; name: string }[];
  swaps: ScheduleSwapRow[];
}

const sessionOn = (plan: ReminderPlan, iso: string) => sessionOnDate(plan.sessions, plan.swaps, iso);

export interface DueReminder { kind: ReminderKind; msg: PushMessage }

const NO_FACTS: ReminderFacts = { loggedToday: false, loggedYesterday: false, weighedRecently: false };

/** Which reminders are due right now. Pure, so it's unit-tested; the job looks up the facts. */
export function dueReminders(plan: ReminderPlan, now: LocalNow, facts: ReminderFacts = NO_FACTS): DueReminder[] {
  const due: DueReminder[] = [];
  const inPlan = (iso: string) => iso >= plan.startDate && iso <= plan.endDate;
  const day = daysBetween(plan.startDate, now.date);

  if (plan.reminderTime && inPlan(now.date) && inWindow(now.minutes, toMinutes(plan.reminderTime)) && !facts.loggedToday) {
    const s = sessionOn(plan, now.date);
    if (s) {
      due.push({
        kind: "TRAINING_DAY",
        msg: { title: `${s.name} today`, body: "Your session is ready. Tap to see today's workout.", url: "/today", tag: `train-${now.date}` },
      });
    }
  }

  if (inWindow(now.minutes, EVE_MINUTES)) {
    const tomorrow = addDaysIso(now.date, 1);
    let first: string | null = null;
    for (let k = 0; k < 7 && !first; k++) if (sessionOn(plan, addDaysIso(plan.startDate, k))) first = addDaysIso(plan.startDate, k);
    const s = first === tomorrow ? sessionOn(plan, tomorrow) : undefined;
    if (s) {
      due.push({
        kind: "PLAN_START_EVE",
        msg: { title: "Your plan starts tomorrow", body: `${s.name} on ${DAY_NAMES[weekdayOf(tomorrow)]}. Lay out your kit tonight.`, url: "/today", tag: `start-${tomorrow}` },
      });
    }
  }

  if (inWindow(now.minutes, MORNING_MINUTES)) {
    const weigh = plan.prefs.weighIn && WEIGH_IN_DAYS.includes(day) && !facts.weighedRecently;
    const photo = plan.prefs.progressPhotos ? PHOTO_DAYS[day] : undefined;
    if (weigh) {
      due.push({
        kind: "WEIGH_IN",
        msg: photo
          ? { title: `Weigh-in day, and your ${photo} photo`, body: "Weigh in before breakfast, then take your photo in the same spot and light as Day 1.", url: "/progress", tag: `weigh-${now.date}` }
          : { title: "Weigh-in day", body: "Step on the scale before breakfast, after the bathroom. It keeps your 7-day average honest.", url: "/today", tag: `weigh-${now.date}` },
      });
    } else if (photo) {
      due.push({
        kind: "PROGRESS_PHOTO",
        msg: { title: `Your ${photo} photo slot is open`, body: "Same spot, same light as Day 1. It takes 30 seconds.", url: "/progress", tag: `photo-${now.date}` },
      });
    }
  }

  if (inWindow(now.minutes, MORNING_MINUTES) && CHECKIN_DAYS.includes(day)) {
    due.push({
      kind: "CHECKIN_READY",
      msg: day < 42
        ? { title: "Your week-6 check-in is open", body: "Two minutes, three questions, then your next cycle is built from your results.", url: "/checkin", tag: "checkin" }
        : { title: "Your cycle is done. Check in to start the next one", body: "See what 6 weeks did, then get a plan built from it. Two minutes.", url: "/checkin", tag: "checkin" },
    });
  }

  if (plan.prefs.missedSession && inWindow(now.minutes, MISSED_MINUTES) && !facts.loggedYesterday) {
    const yesterday = addDaysIso(now.date, -1);
    const s = inPlan(yesterday) ? sessionOn(plan, yesterday) : undefined;
    if (s) {
      due.push({
        kind: "MISSED_SESSION",
        msg: { title: `Missed ${s.name} yesterday?`, body: "No stress. One missed day doesn't undo your progress. Just pick up with your next session.", url: "/today", tag: `missed-${now.date}` },
      });
    }
  }
  return due;
}

/** Cheap check before loading the plan: could anything be due at this local time? */
function maybeDue(c: ReminderCandidate, now: LocalNow): boolean {
  const day = daysBetween(c.startDate, now.date);
  if (inWindow(now.minutes, EVE_MINUTES) && day < 7) return true;
  if (inWindow(now.minutes, MORNING_MINUTES) && (c.prefs.weighIn || c.prefs.progressPhotos) && WEIGH_IN_DAYS.includes(day)) return true;
  if (inWindow(now.minutes, MORNING_MINUTES) && CHECKIN_DAYS.includes(day)) return true;
  if (inWindow(now.minutes, MISSED_MINUTES) && c.prefs.missedSession && day >= 1 && now.date <= addDaysIso(c.endDate, 1)) return true;
  return !!c.reminderTime && inWindow(now.minutes, toMinutes(c.reminderTime)) && now.date >= c.startDate && now.date <= c.endDate;
}

let running = false;

export async function runReminderJob(at = new Date()): Promise<{ sent: number; skipped?: string }> {
  if (!pushPublicKey()) return { sent: 0, skipped: "push not configured" };
  if (running) return { sent: 0, skipped: "already running" };
  running = true;
  let sent = 0;
  try {
    for (const c of await listReminderCandidates()) {
      try {
        const now = localNow(at, c.timeZone);
        if (!maybeDue(c, now)) continue;
        const [sessions, swaps, facts] = await Promise.all([
          listActiveSessions(c.programId), listScheduleSwaps(c.programId), reminderFacts(c.userId, c.timeZone, now.date),
        ]);
        for (const r of dueReminders({ ...c, sessions, swaps }, now, facts)) {
          if (!(await claimReminder(c.userId, r.kind, now.date))) continue;
          const delivered = await sendPushToUser(c.userId, r.msg);
          if (delivered) sent += 1;
          else await releaseReminder(c.userId, r.kind, now.date);
        }
      } catch (err) {
        console.error(`Reminder for user ${c.userId} failed:`, err);
      }
    }
  } finally {
    running = false;
  }
  return { sent };
}
