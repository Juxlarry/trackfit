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
 *  - PLAN_START_EVE at 19:00 the evening before the first session of each
 *    cycle (the first plan, and each cycle a check-in starts).
 *  - WEIGH_IN every morning at the user's weigh-in time (default 07:30), on
 *    plan days 1 to 39, unless they've already weighed in that day (README
 *    "Weigh-ins that are easy to find"). Days 40-42 belong to the check-in.
 *    On days 14 and 35 it also says the Week 3 / Week 6 photo slot is open,
 *    so that morning is one notification.
 *  - PROGRESS_PHOTO on days 14 and 35 (at the weigh-in time, or 07:30 with
 *    weigh-ins off), only when the weigh-in reminder is off or not needed. Either one skips the photo when that
 *    slot already holds a photo from this cycle (tracking.progress_photos).
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
const WEIGH_IN_FIRST_DAY = 1;
const WEIGH_IN_LAST_DAY = 39;
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
export const DEFAULT_PREFS: ReminderPrefs = { weighIn: true, progressPhotos: true, missedSession: true, clubChallenges: true, weighInTime: "07:30" };
/** When the weigh-in (and photo-slot) reminder goes out. */
const weighMinutes = (p: ReminderPrefs) => (p.weighIn ? toMinutes(p.weighInTime) : MORNING_MINUTES);
const weighDay = (day: number) => day >= WEIGH_IN_FIRST_DAY && day <= WEIGH_IN_LAST_DAY;

export interface ReminderPlan {
  reminderTime: string | null;
  prefs: ReminderPrefs;
  cycleNumber: number;
  startDate: string;
  endDate: string;
  sessions: { weekday: number; name: string }[];
  swaps: ScheduleSwapRow[];
}

const sessionOn = (plan: ReminderPlan, iso: string) => sessionOnDate(plan.sessions, plan.swaps, iso);

export interface DueReminder { kind: ReminderKind; msg: PushMessage }

const NO_FACTS: ReminderFacts = { loggedToday: false, loggedYesterday: false, weighedToday: false, photosThisCycle: [] };

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
        msg: { title: plan.cycleNumber > 1 ? `Cycle ${plan.cycleNumber} starts tomorrow` : "Your plan starts tomorrow", body: `${s.name} on ${DAY_NAMES[weekdayOf(tomorrow)]}. Lay out your kit tonight.`, url: "/today", tag: `start-${tomorrow}` },
      });
    }
  }

  if (inWindow(now.minutes, weighMinutes(plan.prefs))) {
    const weigh = plan.prefs.weighIn && weighDay(day) && !facts.weighedToday;
    const slot = PHOTO_DAYS[day];
    const photo = plan.prefs.progressPhotos && slot && !facts.photosThisCycle.includes(slot) ? slot : undefined;
    if (weigh) {
      due.push({
        kind: "WEIGH_IN",
        msg: photo
          ? { title: `Weigh-in day, and your ${photo} photo`, body: "Weigh in before breakfast, then take your photo in the same spot and light as Day 1.", url: "/progress", tag: `weigh-${now.date}` }
          : { title: "Morning weigh-in", body: "Step on the scale before breakfast, after the bathroom. It keeps your 7-day average honest.", url: "/today?weigh=1", tag: `weigh-${now.date}` },
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
  if (inWindow(now.minutes, weighMinutes(c.prefs)) && ((c.prefs.weighIn && weighDay(day)) || (c.prefs.progressPhotos && PHOTO_DAYS[day]))) return true;
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
          listActiveSessions(c.programId), listScheduleSwaps(c.programId), reminderFacts(c.userId, c.timeZone, now.date, c.startDate),
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
