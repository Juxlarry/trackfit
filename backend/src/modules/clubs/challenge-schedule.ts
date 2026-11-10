import { addDaysIso, mondayOf } from "../planning/engine/index.js";

/**
 * Coach challenges: which day or week a date counts for, and progress
 * (README "Clubs v1", "Coach challenges"). Pure, so it's unit-tested.
 * Dates are YYYY-MM-DD.
 *
 * A DAILY challenge needs proof on every day it runs. A WEEKLY one needs it
 * once in each Monday-to-Sunday week it runs; a week is cut to the
 * challenge's own dates, so a Thursday-to-Sunday challenge has one "week".
 */
export type Cadence = "DAILY" | "WEEKLY";
export interface Span { cadence: Cadence; startsOn: string; endsOn: string }

/** The day (DAILY) or the first day of the week (WEEKLY) that a date counts for, or null outside the challenge. */
export function periodOf(c: Span, date: string): string | null {
  if (date < c.startsOn || date > c.endsOn) return null;
  if (c.cadence === "DAILY") return date;
  const monday = mondayOf(date);
  return monday < c.startsOn ? c.startsOn : monday;
}

/** Every period, in order. */
export function periodsOf(c: Span): string[] {
  const out: string[] = [];
  for (let d = c.startsOn; d <= c.endsOn; d = addDaysIso(d, 1)) {
    const p = periodOf(c, d)!;
    if (out[out.length - 1] !== p) out.push(p);
  }
  return out;
}

/** Periods with proof, of all of them. Complete when every one has proof. */
export function progressOf(c: Span, proved: Iterable<string>): { done: number; total: number; complete: boolean } {
  const all = new Set(periodsOf(c));
  const done = new Set([...proved].filter((p) => all.has(p))).size;
  return { done, total: all.size, complete: done === all.size };
}

export type ChallengeState = "UPCOMING" | "RUNNING" | "FINISHED" | "ENDED";

export function stateOf(c: Span & { endedAt: Date | null }, today: string): ChallengeState {
  if (c.endedAt) return "ENDED";
  if (today < c.startsOn) return "UPCOMING";
  return today > c.endsOn ? "FINISHED" : "RUNNING";
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** "5 of 7 days", "1 of 2 weeks". */
export const progressText = (c: Span, done: number, total: number) => `${done} of ${plural(total, c.cadence === "DAILY" ? "day" : "week")}`;

/** The drafted win post. */
export function winDraft(c: Span & { title: string }, total: number): string {
  if (c.cadence === "DAILY") return total === 1 ? `Challenge done: ${c.title}.` : `Challenge done: ${c.title}, all ${total} days with proof.`;
  return total === 1 ? `Challenge done: ${c.title}.` : `Challenge done: ${c.title}, every week for ${total} weeks.`;
}
