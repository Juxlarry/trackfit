import { addDaysIso, mondayOf, weekdayOf } from "../planning/engine/index.js";

/**
 * Club routines: when they fall, what counts, and how they're tallied
 * (README "Clubs v1", "Club routines"). Pure, so it's unit-tested.
 * Dates are YYYY-MM-DD; weekdays are 0 = Monday … 6 = Sunday.
 */

export interface ActivityRule { activityType: string | null; minDistanceKm: number | null; minMinutes: number | null }
export interface LoggedActivity { performedOn: string; activityType: string; durationMinutes: number; distanceKm: number | null }

/** An activity counts if it's the right type and meets any minimums. */
export function activityCounts(rule: ActivityRule, a: Omit<LoggedActivity, "performedOn">): boolean {
  if (rule.activityType && a.activityType !== rule.activityType) return false;
  if (rule.minMinutes != null && a.durationMinutes < rule.minMinutes) return false;
  // A tolerance of 10 m, so "5 km" isn't missed by a watch rounding 4.996.
  if (rule.minDistanceKm != null && (a.distanceKm ?? 0) + 0.01 < rule.minDistanceKm) return false;
  return true;
}

export const isScheduled = (weekdays: number[], iso: string) => weekdays.includes(weekdayOf(iso));

/** Scheduled days from `from` to `to`, inclusive. */
export function scheduledDays(weekdays: number[], from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) if (isScheduled(weekdays, d)) out.push(d);
  return out;
}

/** Days the routine was done: activity routines from the log, on scheduled days only. */
export function activityDoneDays(weekdays: number[], rule: ActivityRule, log: LoggedActivity[]): Set<string> {
  return new Set(log.filter((a) => isScheduled(weekdays, a.performedOn) && activityCounts(rule, a)).map((a) => a.performedOn));
}

/**
 * Scheduled days in a row that were done, counting back from today. Today
 * only counts once it's done, so an unfinished day never breaks a streak.
 * Days before `start` (the routine was made, or the member joined) aren't counted.
 */
export function streak(weekdays: number[], start: string, today: string, done: Set<string>): number {
  let n = 0;
  for (let d = today; d >= start; d = addDaysIso(d, -1)) {
    if (!isScheduled(weekdays, d)) continue;
    if (done.has(d)) n += 1;
    else if (d !== today) break;
  }
  return n;
}

export interface WeekTally { weekStart: string; done: number; scheduled: number }

/**
 * The last `weeks` weeks (Monday to Sunday), oldest first. `scheduled` counts
 * the week's scheduled days from `start` on, including ones still to come.
 */
export function weeklyTally(weekdays: number[], start: string, today: string, done: Set<string>, weeks: number): WeekTally[] {
  const thisWeek = mondayOf(today);
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDaysIso(thisWeek, -7 * (weeks - 1 - i));
    const from = weekStart < start ? start : weekStart;
    const days = from > addDaysIso(weekStart, 6) ? [] : scheduledDays(weekdays, from, addDaysIso(weekStart, 6));
    return { weekStart, done: days.filter((d) => done.has(d) && d <= today).length, scheduled: days.length };
  });
}
