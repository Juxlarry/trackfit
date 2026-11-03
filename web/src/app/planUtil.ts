import { CHECKIN_OPENS_DAY, addDaysIso, checkinOpen, daysBetween, mondayOf, swappedOrder, weekdayOf, type DaySwap, type MealSlot } from "@engine";
import type { ActivePlanDto, PlannedSessionDto, SessionSummaryDto } from "../graphql/types";
import { readJson, writeJson } from "../lib/storage";

export const CYCLE_DAYS = 42;

export const SLOT_LABEL: Record<MealSlot, string> = { BREAKFAST: "Breakfast", LUNCH: "Lunch", DINNER: "Dinner", SNACK: "Snack" };

/** Local calendar date (YYYY-MM-DD) of an ISO timestamp. */
export function localDateOf(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Day swaps made for the week containing a date. */
export const swapsFor = (plan: ActivePlanDto, iso: string): DaySwap[] =>
  plan.scheduleSwaps.filter((s) => s.weekStart === mondayOf(iso)).map((s) => [s.dayA, s.dayB]);

/** The plan weekday whose session falls on this date, after this week's swaps. */
export const plannedWeekdayOn = (plan: ActivePlanDto, iso: string) => swappedOrder(swapsFor(plan, iso))[weekdayOf(iso)];

export const sessionOn = (plan: ActivePlanDto, iso: string): PlannedSessionDto | undefined =>
  plan.sessions.find((s) => s.weekday === plannedWeekdayOn(plan, iso));

/** True when this week's swaps moved a different session onto this date. */
export const isMoved = (plan: ActivePlanDto, iso: string) => plannedWeekdayOn(plan, iso) !== weekdayOf(iso);

/** First planned session on or after a date. */
export function firstSessionFrom(plan: ActivePlanDto, iso: string): { session: PlannedSessionDto; date: string; offset: number } {
  for (let k = 0; k < 7; k++) {
    const date = addDaysIso(iso, k);
    const session = sessionOn(plan, date);
    if (session) return { session, date, offset: k };
  }
  return { session: plan.sessions[0], date: iso, offset: 0 };
}

export function cycleWeek(plan: ActivePlanDto, today: string): number {
  const n = Math.floor(daysBetween(mondayOf(plan.startDate), today) / 7) + 1;
  return Math.min(6, Math.max(1, n));
}

export const weekDates = (today: string) => [0, 1, 2, 3, 4, 5, 6].map((k) => addDaysIso(mondayOf(today), k));

/** Logged workouts keyed by local date. */
export function sessionsByDate(list: SessionSummaryDto[] | undefined): Map<string, SessionSummaryDto> {
  const m = new Map<string, SessionSummaryDto>();
  for (const s of list ?? []) m.set(localDateOf(s.startedAt), s);
  return m;
}

/** Day 1 essentials the server doesn't track (preview, meal audit), per program. */
export interface LocalFlags { previewed?: boolean; audit?: { pick: string; size: string } }
const flagsKey = (programId: string) => `trackfit.flags.${programId}`;
export const readFlags = (programId: string) => readJson<LocalFlags>(flagsKey(programId), {});
export const writeFlags = (programId: string, f: LocalFlags) => writeJson(flagsKey(programId), { ...readFlags(programId), ...f });

/** The week-6 check-in opens on day CHECKIN_OPENS_DAY (engine/checkin.ts). */
export const checkinIsOpen = (plan: ActivePlanDto, today: string) => checkinOpen(plan.startDate, today);

export function checkinText(plan: ActivePlanDto, today: string): string {
  if (checkinIsOpen(plan, today)) return `Your check-in is ready. Three quick questions, then cycle ${plan.cycleNumber + 1} is built from your results.`;
  const opens = addDaysIso(plan.startDate, CHECKIN_OPENS_DAY);
  const n = daysBetween(today, opens);
  const d = new Date(opens + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return `Opens in ${n} day${n === 1 ? "" : "s"}, on ${d}. Three quick questions, then cycle ${plan.cycleNumber + 1} is built from your results.`;
}

export const MUSCLES: Record<string, string[]> = {
  UPPER: ["Chest", "Back", "Shoulders", "Arms"], LOWER: ["Quads", "Glutes", "Hamstrings"], PUSH: ["Chest", "Shoulders", "Triceps"],
  PULL: ["Back", "Biceps", "Rear delts"], LEGS: ["Quads", "Glutes", "Hamstrings"], FULL: ["Full body"],
};
export const musclesFor = (type: string) => [...(MUSCLES[type] ?? ["Full body"]), "Abs & core"];

export const REFETCH_LOGS = ["SessionsBetween", "ActivityLogs", "WeightHistory", "LastSets"];
