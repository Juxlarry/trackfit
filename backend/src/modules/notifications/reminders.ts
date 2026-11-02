import { addDaysIso, mondayOf, swappedOrder, weekdayOf, type DaySwap } from "../planning/engine/index.js";
import { listActiveSessions, listScheduleSwaps, type ScheduleSwapRow } from "../planning/planning.repository.js";
import {
  claimReminder, listReminderCandidates, releaseReminder, workoutLoggedOn, type ReminderCandidate, type ReminderKind,
} from "./notifications.repository.js";
import { pushPublicKey, sendPushToUser, type PushMessage } from "./push.js";

/**
 * Workout reminders, sent as push notifications:
 *  - TRAINING_DAY at the user's reminder time, on days with a session,
 *    unless they've already logged a workout that day.
 *  - PLAN_START_EVE at 19:00 the evening before their first session.
 *
 * runReminderJob is called every few minutes (in-process timer, plus an
 * external cron hitting POST /jobs/reminders so a sleeping server wakes up).
 * Each reminder may go out up to WINDOW_MIN late, never twice: reminder_log
 * records it per local date.
 */
export const WINDOW_MIN = 90;
const EVE_MINUTES = 19 * 60;
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

export interface ReminderPlan {
  reminderTime: string | null;
  startDate: string;
  endDate: string;
  sessions: { weekday: number; name: string }[];
  swaps: ScheduleSwapRow[];
}

/** The session on a date after that week's swaps (mirrors web planUtil.sessionOn). */
export function sessionOn(plan: ReminderPlan, iso: string) {
  const swaps: DaySwap[] = plan.swaps.filter((s) => s.weekStart === mondayOf(iso)).map((s) => [s.dayA, s.dayB]);
  const weekday = swappedOrder(swaps)[weekdayOf(iso)];
  return plan.sessions.find((s) => s.weekday === weekday);
}

export interface DueReminder { kind: ReminderKind; msg: PushMessage }

/** Which reminders are due right now. Pure, so it's unit-tested; the job adds the "already logged" check. */
export function dueReminders(plan: ReminderPlan, now: LocalNow): DueReminder[] {
  const due: DueReminder[] = [];
  const inPlan = now.date >= plan.startDate && now.date <= plan.endDate;
  if (plan.reminderTime && inPlan && inWindow(now.minutes, toMinutes(plan.reminderTime))) {
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
  return due;
}

/** Cheap check before loading the plan: could anything be due at this local time? */
function maybeDue(c: ReminderCandidate, now: LocalNow): boolean {
  if (inWindow(now.minutes, EVE_MINUTES) && now.date < addDaysIso(c.startDate, 7)) return true;
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
        const [sessions, swaps] = await Promise.all([listActiveSessions(c.programId), listScheduleSwaps(c.programId)]);
        for (const r of dueReminders({ ...c, sessions, swaps }, now)) {
          if (r.kind === "TRAINING_DAY" && (await workoutLoggedOn(c.userId, c.timeZone, now.date))) continue;
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
