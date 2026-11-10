import { pool } from "../../shared/db/pool.js";
import { assertIsoDate, badInput, forbidden, notFound } from "../../shared/errors.js";
import type { UserRow } from "../identity/identity.repository.js";
import { ACTIVITY_TYPES, addDaysIso, mondayOf, toIsoDate } from "../planning/engine/index.js";
import { exercisesByIds, listActivityLogsSince, logWorkoutSession } from "../tracking/tracking.service.js";
import { listMembers, lockClub, getMembership, type MemberRow } from "./clubs.repository.js";
import { requireActiveMember, requireClubAdmin, tx } from "./clubs.service.js";
import {
  archiveRoutineRow, countActiveRoutines, getRoutine, insertCompletion, insertRoutine, listCompletions, listRoutinesForUser, updateRoutineRow,
  type RoutineFields, type RoutineKind, type RoutineRow,
} from "./routines.repository.js";
import { activityDoneDays, isScheduled, streak, weeklyTally, type WeekTally } from "./routine-schedule.js";

/**
 * Clubs v1, build step 3: club routines (README "Clubs v1", "Club routines").
 * Admins set them; they recur on chosen weekdays; members can do them or not.
 * Activity routines tick themselves from the activity log. Workout routines
 * are logged as a session from the routine. Plans never change.
 */
export const ROUTINE_LIMITS = { activePerClub: 5, exercises: 15, maxSets: 10, maxReps: 100, weeksShown: 6 };

export interface RoutineInput {
  title: string;
  description?: string | null;
  kind: RoutineKind;
  weekdays: number[];
  activityType?: string | null;
  minDistanceKm?: number | null;
  minMinutes?: number | null;
  exercises?: { exerciseId: string; sets: number; reps: number }[] | null;
}

async function checkInput(input: RoutineInput): Promise<RoutineFields> {
  const title = input.title.trim();
  if (title.length < 2 || title.length > 60) throw badInput("A routine name needs 2 to 60 characters.", [{ field: "title", message: "2 to 60 characters." }]);
  const description = input.description?.trim() || null;
  if (description && description.length > 500) throw badInput("Keep the description under 500 characters.");
  const weekdays = [...new Set(input.weekdays)].sort((a, b) => a - b);
  if (!weekdays.length || weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw badInput("Pick at least one day.", [{ field: "weekdays", message: "Pick a day." }]);

  if (input.kind === "ACTIVITY") {
    const type = input.activityType ?? "";
    if (!ACTIVITY_TYPES[type]) throw badInput("Pick the activity that counts, such as running.", [{ field: "activityType", message: "Pick one." }]);
    const km = input.minDistanceKm ?? null;
    if (km != null && (!(km > 0) || km > 300)) throw badInput("Distance must be between 0 and 300 km.");
    if (km != null && !ACTIVITY_TYPES[type].distance) throw badInput(`${ACTIVITY_TYPES[type].label} doesn't take a distance.`);
    const min = input.minMinutes ?? null;
    if (min != null && (!Number.isInteger(min) || min < 1 || min > 600)) throw badInput("Minutes must be 1 to 600.");
    return { title, description, kind: "ACTIVITY", weekdays, activityType: type, minDistanceKm: km, minMinutes: min, exercises: [] };
  }
  if (input.kind !== "WORKOUT") throw badInput("A routine is an activity or a workout.");
  const exercises = input.exercises ?? [];
  if (!exercises.length || exercises.length > ROUTINE_LIMITS.exercises) throw badInput(`Add 1 to ${ROUTINE_LIMITS.exercises} exercises.`, [{ field: "exercises", message: "Add an exercise." }]);
  for (const e of exercises) {
    if (!Number.isInteger(e.sets) || e.sets < 1 || e.sets > ROUTINE_LIMITS.maxSets) throw badInput(`Sets must be 1 to ${ROUTINE_LIMITS.maxSets}.`);
    if (!Number.isInteger(e.reps) || e.reps < 1 || e.reps > ROUTINE_LIMITS.maxReps) throw badInput(`Reps must be 1 to ${ROUTINE_LIMITS.maxReps}.`);
  }
  const ids = [...new Set(exercises.map((e) => e.exerciseId))];
  if (ids.length !== exercises.length) throw badInput("Each exercise can only be in a routine once.");
  // Catalogue exercises only: a member's own custom exercises aren't shared.
  const found = await exercisesByIds(ids);
  if (found.length !== ids.length || found.some((e) => e.isCustom)) throw badInput("Pick exercises from the TrackFit list.");
  return { title, description, kind: "WORKOUT", weekdays, activityType: null, minDistanceKm: null, minMinutes: null, exercises: exercises.map(({ exerciseId, sets, reps }) => ({ exerciseId, sets, reps })) };
}

async function requireRoutineAdmin(user: UserRow, routineId: string): Promise<RoutineRow> {
  const r = await getRoutine(routineId);
  if (!r || r.archivedAt) throw notFound("Routine not found.");
  await requireClubAdmin(r.clubId, user.id);
  return r;
}

export async function createRoutine(user: UserRow, clubId: string, input: RoutineInput): Promise<RoutineRow> {
  const fields = await checkInput(input);
  return tx(async (c) => {
    // Locked, so two Admins can't both add the 5th.
    const club = await lockClub(c, clubId);
    const me = club ? await getMembership(clubId, user.id, c) : null;
    if (!club || club.closedAt || !me || me.status !== "ACTIVE") throw notFound("Club not found.");
    if (!me.isAdmin) throw forbidden("Only the club's Admins can set routines.");
    if ((await countActiveRoutines(c, clubId)) >= ROUTINE_LIMITS.activePerClub) {
      throw badInput(`A club can have up to ${ROUTINE_LIMITS.activePerClub} routines. End one before adding another.`);
    }
    return insertRoutine(c, clubId, user.id, fields);
  });
}

/** Changes the details. The kind stays, so past completions keep their meaning. */
export async function updateRoutine(user: UserRow, routineId: string, input: RoutineInput): Promise<RoutineRow> {
  const r = await requireRoutineAdmin(user, routineId);
  if (input.kind !== r.kind) throw badInput("A routine can't switch between activity and workout. End it and make a new one.");
  return updateRoutineRow(routineId, await checkInput(input));
}

/** "End routine": it leaves Today and the club, and frees a slot. */
export async function archiveRoutine(user: UserRow, routineId: string) {
  const r = await requireRoutineAdmin(user, routineId);
  await archiveRoutineRow(r.id);
  return r.clubId;
}

// ── Who did it ──────────────────────────────────────────────────────────

const dateOf = (d: Date) => toIsoDate(d);
const later = (a: string, b: string) => (a > b ? a : b);

/** Days this member did the routine, on or after `from`. */
async function doneDays(r: RoutineRow, userId: string, from: string, completions?: Map<string, Set<string>>): Promise<Set<string>> {
  if (r.kind === "WORKOUT") return (completions ?? await listCompletions(r.id, from, userId)).get(userId) ?? new Set();
  const log = await listActivityLogsSince(userId, from, 500);
  return activityDoneDays(r.weekdays, r, log);
}

export interface MemberProgress { member: MemberRow; weeks: WeekTally[]; streak: number; doneToday: boolean }

/** The routine's page: every active member's last few weeks and streak. */
export async function routineProgress(user: UserRow, routineId: string, todayIso: string, weeks = ROUTINE_LIMITS.weeksShown) {
  assertIsoDate(todayIso, "today");
  const r = await getRoutine(routineId);
  if (!r || r.archivedAt) throw notFound("Routine not found.");
  await requireActiveMember(r.clubId, user.id);
  const shown = Math.min(Math.max(weeks, 1), 12);
  const created = dateOf(r.createdAt);
  // Enough history for a long streak, not just the weeks on screen.
  const from = later(created, addDaysIso(mondayOf(todayIso), -7 * 26));
  const members = await listMembers(r.clubId, "ACTIVE");
  const completions = r.kind === "WORKOUT" ? await listCompletions(r.id, from) : undefined;
  const rows: MemberProgress[] = await Promise.all(members.filter((m) => m.joinedAt).map(async (m) => {
    const start = later(created, dateOf(m.joinedAt!));
    const done = await doneDays(r, m.userId, later(from, start), completions);
    return {
      member: m,
      weeks: weeklyTally(r.weekdays, start, todayIso, done, shown),
      streak: streak(r.weekdays, start, todayIso, done),
      doneToday: done.has(todayIso),
    };
  }));
  // Longest streaks first, then by name.
  rows.sort((a, b) => b.streak - a.streak || a.member.displayName.localeCompare(b.member.displayName));
  return { routine: r, weekStarts: rows[0]?.weeks.map((w) => w.weekStart) ?? weeklyTally(r.weekdays, created, todayIso, new Set(), shown).map((w) => w.weekStart), members: rows };
}

/** Today's routines across the member's clubs, for the Today page. */
export async function myRoutinesOn(user: UserRow, dateIso: string) {
  assertIsoDate(dateIso, "date");
  const routines = (await listRoutinesForUser(user.id)).filter((r) => isScheduled(r.weekdays, dateIso) && dateIso >= dateOf(r.createdAt));
  return Promise.all(routines.map(async (r) => ({ routine: r, clubName: r.clubName, done: (await doneDays(r, user.id, dateIso)).has(dateIso) })));
}

/**
 * Logs a workout routine as a session from its exercises, and ticks it.
 * Allowed for today or yesterday (the server's date can be a day off the member's).
 */
export async function logRoutineWorkout(user: UserRow, routineId: string, input: {
  date: string; durationMinutes?: number | null; weights?: { exerciseId: string; weightKg?: number | null }[] | null;
}) {
  const date = assertIsoDate(input.date, "date");
  const r = await getRoutine(routineId);
  if (!r || r.archivedAt) throw notFound("Routine not found.");
  await requireActiveMember(r.clubId, user.id);
  if (r.kind !== "WORKOUT") throw badInput("This routine ticks itself when you log a matching activity.");
  const serverToday = toIsoDate(new Date());
  if (date < addDaysIso(serverToday, -2) || date > addDaysIso(serverToday, 1)) throw badInput("You can log a routine for today or yesterday.");
  if (!isScheduled(r.weekdays, date)) throw badInput("This routine isn't on that day.");
  if ((await doneDays(r, user.id, date)).has(date)) throw badInput("You've already logged this routine for that day.");
  const minutes = input.durationMinutes ?? null;
  if (minutes != null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 600)) throw badInput("Minutes must be 1 to 600.");
  const weights = new Map((input.weights ?? []).map((w) => [w.exerciseId, w.weightKg ?? 0]));
  for (const kg of weights.values()) if (kg < 0 || kg > 500) throw badInput("Weights must be between 0 and 500 kg.");

  const sets = r.exercises.flatMap((e) => Array.from({ length: e.sets }, (_, i) => ({
    exerciseId: e.exerciseId, setNumber: i + 1, reps: e.reps, weightKg: Math.round((weights.get(e.exerciseId) ?? 0) * 100) / 100,
  })));
  const { session } = await logWorkoutSession({
    userId: user.id, templateId: null, durationMinutes: minutes, notes: `Club routine: ${r.title}`, sets,
    // Today keeps the real time; a past day is logged at midday, like a missed planned session.
    startedAt: date === serverToday ? null : new Date(`${date}T12:00:00Z`),
  });
  await insertCompletion(pool, { routineId: r.id, userId: user.id, onDate: date, sessionId: session.id });
  return { routine: r, sessionId: session.id };
}
