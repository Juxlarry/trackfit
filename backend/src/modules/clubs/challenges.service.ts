import { randomUUID } from "node:crypto";
import { assertIsoDate, badInput, forbidden, notFound } from "../../shared/errors.js";
import { getMediaStore } from "../../shared/media/store.js";
import type { UserRow } from "../identity/identity.repository.js";
import { usersWantingChallengePush } from "../notifications/notifications.repository.js";
import { sendPushToUser } from "../notifications/push.js";
import { localNow } from "../notifications/reminders.js";
import { foodLogsOn, waterOn } from "../nutrition/nutrition.service.js";
import { foodByKey } from "../planning/engine/foods.js";
import { ACTIVITY_TYPES, addDaysIso, mondayOf, toIsoDate } from "../planning/engine/index.js";
import { exercisesByIds, getActivityLog, logWorkoutSession } from "../tracking/tracking.service.js";
import { getMembership, listMembers, lockClub, type ClubRow, type MemberRow } from "./clubs.repository.js";
import { requireActiveMember, tx } from "./clubs.service.js";
import { getMedia, insertMedia, insertPost } from "./feed.repository.js";
import { claimMedia } from "./feed.service.js";
import {
  countSetInWeek, deleteChallengeCommentRow, endChallengeRow, getChallenge, getChallengeComment, getParticipant, hasWinPost,
  insertChallenge, insertChallengeComment, insertEntry, listChallengesForUser, listEntries, markCompleted, provedPeriods,
  setEntrySession, setParticipant, type ChallengeFields, type ChallengeKind, type ChallengeRow,
} from "./challenges.repository.js";
import { periodOf, progressOf, stateOf, winDraft, type Cadence } from "./challenge-schedule.js";
import { activityCounts } from "./routine-schedule.js";

/**
 * Clubs v1, build step 4: coach challenges (README "Clubs v1", "Coach challenges").
 * Coaches set them, at most 3 a week each (Monday to Sunday in the club's
 * time zone). Members take them on from the daily pop-up, prove each day
 * (or week) with a photo or video, and are offered a win post at the end.
 */
export const CHALLENGE_LIMITS = {
  perCoachPerWeek: 3,
  /** Longest a challenge can run. */
  maxDays: 28,
  /** How far ahead one can start. */
  maxDaysAhead: 28,
  exercises: 15, maxSets: 10, maxReps: 100, maxTimeLimitMinutes: 180,
  noteChars: 300, commentChars: 500,
};

/** The club's date now. Weeks for the cap run Monday to Sunday in this zone. */
export const clubToday = (club: Pick<ClubRow, "timeZone">, now = new Date()) => localNow(now, club.timeZone || "Africa/Accra").date;

export interface ChallengeInput {
  title: string;
  description?: string | null;
  cadence: Cadence;
  kind: ChallengeKind;
  /** Default: today, in the club's time zone. */
  startsOn?: string | null;
  /** Default: the Sunday of the start's week. */
  endsOn?: string | null;
  videoMediaId?: string | null;
  exercises?: { exerciseId: string; sets: number; reps: number }[] | null;
  timeLimitMinutes?: number | null;
  activityType?: string | null;
  minDistanceKm?: number | null;
  minMinutes?: number | null;
  foodKey?: string | null;
  foodName?: string | null;
  foodGrams?: number | null;
  waterMl?: number | null;
}

const intIn = (v: number | null | undefined, lo: number, hi: number) => v != null && Number.isInteger(v) && v >= lo && v <= hi;

async function checkInput(input: ChallengeInput, today: string): Promise<ChallengeFields> {
  const title = input.title.trim();
  if (title.length < 2 || title.length > 60) throw badInput("A challenge name needs 2 to 60 characters.", [{ field: "title", message: "2 to 60 characters." }]);
  const description = input.description?.trim() || null;
  if (description && description.length > 1000) throw badInput("Keep the description under 1,000 characters.");
  if (input.cadence !== "DAILY" && input.cadence !== "WEEKLY") throw badInput("Pick daily or weekly.");

  const startsOn = input.startsOn ? assertIsoDate(input.startsOn, "startsOn") : today;
  const endsOn = input.endsOn ? assertIsoDate(input.endsOn, "endsOn") : addDaysIso(mondayOf(startsOn), 6);
  if (startsOn < today) throw badInput("A challenge can't start in the past.", [{ field: "startsOn", message: "Today or later." }]);
  if (startsOn > addDaysIso(today, CHALLENGE_LIMITS.maxDaysAhead)) throw badInput(`Start it within the next ${CHALLENGE_LIMITS.maxDaysAhead} days.`);
  if (endsOn < startsOn) throw badInput("The end date comes before the start.", [{ field: "endsOn", message: "After the start." }]);
  if (endsOn > addDaysIso(startsOn, CHALLENGE_LIMITS.maxDays - 1)) throw badInput(`A challenge can run for up to ${CHALLENGE_LIMITS.maxDays / 7} weeks.`);

  const base: ChallengeFields = {
    title, description, cadence: input.cadence, kind: input.kind, startsOn, endsOn, videoMediaId: input.videoMediaId ?? null,
    exercises: [], timeLimitMinutes: null, activityType: null, minDistanceKm: null, minMinutes: null, foodKey: null, foodName: null, foodGrams: null, waterMl: null,
  };

  switch (input.kind) {
    case "WORKOUT": {
      const exercises = input.exercises ?? [];
      if (!exercises.length || exercises.length > CHALLENGE_LIMITS.exercises) throw badInput(`Add 1 to ${CHALLENGE_LIMITS.exercises} exercises.`, [{ field: "exercises", message: "Add an exercise." }]);
      for (const e of exercises) {
        if (!intIn(e.sets, 1, CHALLENGE_LIMITS.maxSets)) throw badInput(`Sets must be 1 to ${CHALLENGE_LIMITS.maxSets}.`);
        if (!intIn(e.reps, 1, CHALLENGE_LIMITS.maxReps)) throw badInput(`Reps must be 1 to ${CHALLENGE_LIMITS.maxReps}.`);
      }
      const ids = [...new Set(exercises.map((e) => e.exerciseId))];
      if (ids.length !== exercises.length) throw badInput("Each exercise can only be in a challenge once.");
      const found = await exercisesByIds(ids);
      if (found.length !== ids.length || found.some((e) => e.isCustom)) throw badInput("Pick exercises from the TrackFit list.");
      const limit = input.timeLimitMinutes ?? null;
      if (limit != null && !intIn(limit, 1, CHALLENGE_LIMITS.maxTimeLimitMinutes)) throw badInput(`A time limit is 1 to ${CHALLENGE_LIMITS.maxTimeLimitMinutes} minutes.`);
      return { ...base, exercises: exercises.map(({ exerciseId, sets, reps }) => ({ exerciseId, sets, reps })), timeLimitMinutes: limit };
    }
    case "ACTIVITY": {
      const type = input.activityType ?? "";
      if (!ACTIVITY_TYPES[type]) throw badInput("Pick the activity, such as running.", [{ field: "activityType", message: "Pick one." }]);
      const km = input.minDistanceKm ?? null;
      const min = input.minMinutes ?? null;
      if (km == null && min == null) throw badInput("Set a distance or a time to reach.", [{ field: "minDistanceKm", message: "Distance or time." }]);
      if (km != null && (!(km > 0) || km > 300)) throw badInput("Distance must be between 0 and 300 km.");
      if (km != null && !ACTIVITY_TYPES[type].distance) throw badInput(`${ACTIVITY_TYPES[type].label} doesn't take a distance. Set a time instead.`);
      if (min != null && !intIn(min, 1, 600)) throw badInput("Minutes must be 1 to 600.");
      return { ...base, activityType: type, minDistanceKm: km, minMinutes: min };
    }
    case "FOOD": {
      const grams = input.foodGrams ?? null;
      if (!intIn(grams, 1, 5000)) throw badInput("Set an amount between 1 and 5,000 g.", [{ field: "foodGrams", message: "1 to 5,000." }]);
      if (input.foodKey) {
        const food = foodByKey(input.foodKey);
        if (!food) throw badInput("That food isn't in the list.");
        return { ...base, foodKey: food.key, foodName: food.name, foodGrams: grams };
      }
      const name = (input.foodName ?? "").trim().replace(/\s+/g, " ");
      if (name.length < 2 || name.length > 80) throw badInput("Pick a food from the list, or type one in (2 to 80 characters).", [{ field: "foodName", message: "Required." }]);
      return { ...base, foodName: name, foodGrams: grams };
    }
    case "WATER": {
      if (!intIn(input.waterMl, 100, 10000)) throw badInput("Set a daily amount between 100 and 10,000 ml.", [{ field: "waterMl", message: "100 to 10,000." }]);
      return { ...base, waterMl: input.waterMl! };
    }
    default:
      throw badInput("A challenge is a workout, an activity, a food or water.");
  }
}

/** "Run 3 km", "500 ml of water a day": for pushes and drafts. */
export function challengeRule(c: Pick<ChallengeRow, "kind" | "cadence" | "exercises" | "timeLimitMinutes" | "activityType" | "minDistanceKm" | "minMinutes" | "foodKey" | "foodName" | "foodGrams" | "waterMl">): string {
  const per = c.cadence === "DAILY" ? "every day" : "once a week";
  switch (c.kind) {
    case "WORKOUT": return `${c.exercises.length} exercise${c.exercises.length === 1 ? "" : "s"}${c.timeLimitMinutes ? ` in ${c.timeLimitMinutes} min` : ""}, ${per}`;
    case "ACTIVITY": {
      const label = ACTIVITY_TYPES[c.activityType ?? ""]?.label ?? "Activity";
      const goal = [c.minDistanceKm != null ? `${c.minDistanceKm} km` : "", c.minMinutes != null ? `${c.minMinutes} min` : ""].filter(Boolean).join(", ");
      return `${label}, ${goal}, ${per}`;
    }
    case "FOOD": {
      const unit = c.foodKey && foodByKey(c.foodKey)?.liquid ? "ml" : "g";
      return `${c.foodGrams} ${unit} ${c.foodName?.toLowerCase()}, ${per}`;
    }
    case "WATER": return `${c.waterMl} ml of water a day`;
  }
}

// ── Setting and ending ──────────────────────────────────────────────────

export async function createChallenge(user: UserRow, clubId: string, input: ChallengeInput): Promise<string> {
  const { club } = await requireActiveMember(clubId, user.id);
  const fields = await checkInput(input, clubToday(club));
  const id = await tx(async (c) => {
    // Locked, so two quick taps can't both take the 3rd slot.
    const locked = await lockClub(c, clubId);
    const me = locked ? await getMembership(clubId, user.id, c) : null;
    if (!locked || locked.closedAt || !me || me.status !== "ACTIVE") throw notFound("Club not found.");
    if (!me.isCoach) throw forbidden("Only coaches set challenges. An Admin who wants to can give themselves the Coach role.");
    const today = clubToday(locked);
    const setWeek = mondayOf(today);
    if ((await countSetInWeek(c, clubId, user.id, setWeek)) >= CHALLENGE_LIMITS.perCoachPerWeek) {
      throw badInput(`You've set ${CHALLENGE_LIMITS.perCoachPerWeek} challenges this week, the most a coach can. You can set more from Monday.`);
    }
    if (fields.videoMediaId) {
      const media = await claimMedia(c, fields.videoMediaId, user, clubId, "CHALLENGE");
      if (media.kind !== "VIDEO") throw badInput("A challenge takes a video.");
    }
    return insertChallenge(c, clubId, user.id, setWeek, fields);
  });
  await announce(clubId, user.id, id).catch((err) => console.error("Challenge push failed", err));
  return id;
}

/** Push to the club's other members who haven't turned it off. */
async function announce(clubId: string, coachId: string, challengeId: string) {
  const ch = (await getChallenge(challengeId))!;
  const others = (await listMembers(clubId, "ACTIVE")).filter((m) => m.userId !== coachId).map((m) => m.userId);
  const to = await usersWantingChallengePush(others);
  await Promise.all(to.map((userId) => sendPushToUser(userId, {
    title: `New challenge from ${ch.coachName}`, body: `${ch.title}: ${challengeRule(ch)}.`,
    url: `/clubs/${clubId}/challenges/${challengeId}`, tag: `club-challenge-${challengeId}`,
  })));
}

/** A challenge in an open club the caller is active in. */
export async function requireChallengeAccess(challengeId: string, userId: string): Promise<{ challenge: ChallengeRow; club: ClubRow; viewer: MemberRow }> {
  const challenge = await getChallenge(challengeId);
  if (!challenge) throw notFound("Challenge not found.");
  const { club, member } = await requireActiveMember(challenge.clubId, userId);
  return { challenge, club, viewer: member };
}

/** The coach who set it, or an Admin. It leaves Today and the pop-up; entries stay on its page. */
export async function endChallenge(user: UserRow, challengeId: string) {
  const { challenge, viewer } = await requireChallengeAccess(challengeId, user.id);
  if (challenge.coachId !== user.id && !viewer.isAdmin) throw forbidden("Only the coach who set it, or an Admin, can end this challenge.");
  await endChallengeRow(challenge.id);
  return challenge.clubId;
}

// ── Taking part ─────────────────────────────────────────────────────────

/** "Take on challenge" or "Not for me". Members can change their mind until it's over. */
export async function respond(user: UserRow, challengeId: string, join: boolean) {
  const { challenge, club } = await requireChallengeAccess(challengeId, user.id);
  const state = stateOf(challenge, clubToday(club));
  if (state === "ENDED" || state === "FINISHED") throw badInput("This challenge is over.");
  const now = await getParticipant(challengeId, user.id);
  if (!join && now?.status === "JOINED" && (await listEntries(challengeId, user.id)).length) {
    throw badInput("You've already sent proof for this challenge, so you can't drop out of it.");
  }
  await setParticipant(challengeId, user.id, join ? "JOINED" : "DECLINED");
}

/**
 * The daily pop-up: challenges in the caller's clubs that aren't over and
 * that they haven't answered. Their own challenges aren't offered.
 */
export async function pendingChallenges(user: UserRow, dateIso: string) {
  assertIsoDate(dateIso, "date");
  return (await listChallengesForUser(user.id, dateIso)).filter((c) => c.status === null && c.coachId !== user.id);
}

export interface MyChallenge {
  challenge: ChallengeRow & { clubName: string };
  /** Proof is in for the day (or week) this date falls in. */
  doneForPeriod: boolean;
  done: number;
  total: number;
  completed: boolean;
  /** Offered once complete, until a win is posted. */
  winDraft: string | null;
}

/** Joined challenges running on this date, for Today, the session page and the loggers. */
export async function myChallengesOn(user: UserRow, dateIso: string): Promise<MyChallenge[]> {
  assertIsoDate(dateIso, "date");
  const list = (await listChallengesForUser(user.id, dateIso)).filter((c) => c.status === "JOINED" && c.startsOn <= dateIso);
  const proved = await provedPeriods(user.id, list.map((c) => c.id));
  return Promise.all(list.map(async (c) => {
    const p = proved.get(c.id) ?? new Set<string>();
    const prog = progressOf(c, p);
    const period = periodOf(c, dateIso);
    return {
      challenge: c, doneForPeriod: !!period && p.has(period), done: prog.done, total: prog.total, completed: prog.complete,
      winDraft: prog.complete && !(await hasWinPost(c.id, user.id)) ? winDraft(c, prog.total) : null,
    };
  }));
}

export interface EntryInput {
  date: string;
  /** From requestClubUpload with purpose PROOF. Required. */
  mediaId: string;
  note?: string | null;
  /** WORKOUT: time taken or reps (at least one). */
  resultSeconds?: number | null;
  resultReps?: number | null;
  /** WORKOUT: optional weights for the logged session. */
  weights?: { exerciseId: string; weightKg?: number | null }[] | null;
  /** ACTIVITY: the logged activity that meets the challenge. */
  activityId?: string | null;
}

/**
 * "Submit result": proof plus the result, checked against the member's own
 * log where the app has one. Returns whether this entry completed it.
 */
export async function submitEntry(user: UserRow, challengeId: string, input: EntryInput): Promise<{ completed: boolean; clubId: string }> {
  const date = assertIsoDate(input.date, "date");
  const { challenge: ch } = await requireChallengeAccess(challengeId, user.id);
  if ((await getParticipant(ch.id, user.id))?.status !== "JOINED") throw badInput("Take on the challenge first.");
  if (ch.endedAt) throw badInput("This challenge has ended.");
  const period = periodOf(ch, date);
  if (!period) throw badInput(`This challenge runs from ${ch.startsOn} to ${ch.endsOn}.`);
  const serverToday = toIsoDate(new Date());
  if (date > addDaysIso(serverToday, 1)) throw badInput("That day hasn't happened yet.");
  if (date < addDaysIso(serverToday, -2)) throw badInput("Proof has to go in within a day or two.");
  if (!input.mediaId) throw badInput("Add a photo or video as proof.");
  const note = input.note?.trim() || null;
  if (note && note.length > CHALLENGE_LIMITS.noteChars) throw badInput(`Keep the note under ${CHALLENGE_LIMITS.noteChars} characters.`);

  const entry = {
    challengeId: ch.id, userId: user.id, periodStart: period, onDate: date, note, mediaId: input.mediaId,
    resultSeconds: null as number | null, resultReps: null as number | null, distanceKm: null as number | null, minutes: null as number | null,
    waterMl: null as number | null, activityId: null as string | null, foodLogId: null as string | null,
  };

  switch (ch.kind) {
    case "WORKOUT": {
      const secs = input.resultSeconds ?? null, reps = input.resultReps ?? null;
      if (secs == null && reps == null) throw badInput("Add the time it took or the reps you did.");
      if (secs != null && !intIn(secs, 1, 86400)) throw badInput("That time doesn't look right.");
      if (reps != null && !intIn(reps, 1, 10000)) throw badInput("That rep count doesn't look right.");
      if (secs != null && ch.timeLimitMinutes && secs > ch.timeLimitMinutes * 60) {
        throw badInput(`That's over the ${ch.timeLimitMinutes}-minute limit, so it doesn't count this time.`);
      }
      for (const w of input.weights ?? []) if (w.weightKg != null && (w.weightKg < 0 || w.weightKg > 500)) throw badInput("Weights must be between 0 and 500 kg.");
      Object.assign(entry, { resultSeconds: secs, resultReps: reps });
      break;
    }
    case "ACTIVITY": {
      const a = input.activityId ? await getActivityLog(input.activityId) : null;
      if (!a || a.userId !== user.id) throw badInput("Log the activity first, then send proof for it.");
      if (a.performedOn !== date) throw badInput("That activity was logged for a different day.");
      if (!activityCounts(ch, a)) {
        throw badInput(`That ${ACTIVITY_TYPES[a.activityType]?.label.toLowerCase() ?? "activity"} doesn't meet the challenge: ${challengeRule(ch)}.`);
      }
      Object.assign(entry, { activityId: a.id, distanceKm: a.distanceKm, minutes: a.durationMinutes });
      break;
    }
    case "FOOD": {
      // A food from the list must be logged on Fuel; a typed-in one rests on the proof.
      if (ch.foodKey) {
        const log = (await foodLogsOn(user.id, date)).find((f) => f.foodKey === ch.foodKey);
        if (!log) throw badInput(`Log ${ch.foodName?.toLowerCase()} on Fuel for that day first.`);
        entry.foodLogId = log.id;
      }
      break;
    }
    case "WATER": {
      const ml = await waterOn(user.id, date);
      if (ml < ch.waterMl!) throw badInput(`You've logged ${ml.toLocaleString("en-GB")} ml so far. The challenge is ${ch.waterMl!.toLocaleString("en-GB")} ml.`);
      entry.waterMl = ml;
      break;
    }
  }

  const { entryId, completed } = await tx(async (c) => {
    await claimMedia(c, input.mediaId, user, ch.clubId, "PROOF");
    const id = await insertEntry(c, entry);
    if (!id) throw badInput(`You've already sent proof for ${ch.cadence === "DAILY" ? "this day" : "this week"}.`);
    const prog = progressOf(ch, (await listEntries(ch.id, user.id, c)).map((e) => e.periodStart));
    return { entryId: id, completed: prog.complete && (await markCompleted(c, ch.id, user.id)) };
  });

  if (ch.kind === "WORKOUT") {
    // Logged after the entry, so a rejected entry never leaves a stray session.
    const weights = new Map((input.weights ?? []).map((w) => [w.exerciseId, w.weightKg ?? 0]));
    const sets = ch.exercises.flatMap((e) => Array.from({ length: e.sets }, (_, i) => ({
      exerciseId: e.exerciseId, setNumber: i + 1, reps: e.reps, weightKg: Math.round((weights.get(e.exerciseId) ?? 0) * 100) / 100,
    })));
    const { session } = await logWorkoutSession({
      userId: user.id, templateId: null, notes: `Club challenge: ${ch.title}`, sets,
      durationMinutes: entry.resultSeconds ? Math.max(1, Math.round(entry.resultSeconds / 60)) : null,
      startedAt: date === serverToday ? null : new Date(`${date}T12:00:00Z`),
    });
    await setEntrySession(entryId, session.id);
  }
  return { completed, clubId: ch.clubId };
}

/**
 * The win post, once every day (or week) has proof. It goes to the
 * challenge's club with a copy of the latest proof.
 */
export async function postWin(user: UserRow, challengeId: string, rawBody: string | null | undefined): Promise<string> {
  const { challenge: ch } = await requireChallengeAccess(challengeId, user.id);
  const part = await getParticipant(ch.id, user.id);
  if (part?.status !== "JOINED" || !part.completedAt) throw badInput("Finish the challenge first.");
  if (await hasWinPost(ch.id, user.id)) throw badInput("You've already posted this win.");
  const entries = await listEntries(ch.id, user.id);
  const body = (rawBody ?? "").trim() || winDraft(ch, progressOf(ch, entries.map((e) => e.periodStart)).total);
  if (body.length > 1000) throw badInput("Keep it under 1000 characters.");

  const proof = [...entries].reverse().find((e) => e.mediaId);
  const src = proof?.mediaId ? await getMedia(proof.mediaId) : null;
  let copy: string | null = null;
  try {
    return await tx(async (c) => {
      let mediaId: string | null = null;
      if (src && src.status === "READY") {
        // A copy, so deleting the post never removes the proof on the challenge page.
        const id = randomUUID();
        copy = `clubs/${ch.clubId}/${id}${src.storagePath.slice(src.storagePath.lastIndexOf("."))}`;
        await getMediaStore().copy(src.storagePath, copy);
        await insertMedia(c, { ...src, id, purpose: "POST", storagePath: copy, status: "READY" });
        mediaId = id;
      }
      const postId = await insertPost(c, {
        clubId: ch.clubId, authorId: user.id, kind: "CHALLENGE_WIN", body, sessionId: null, activityId: null,
        weightChangeKg: null, hasPr: false, mediaId, challengeId: ch.id,
      });
      copy = null;
      return postId;
    });
  } catch (err) {
    if (copy) await getMediaStore().remove(copy).catch(() => {});
    if ((err as { code?: string }).code === "23505") throw badInput("You've already posted this win.");
    throw err;
  }
}

// ── The challenge page ──────────────────────────────────────────────────

export async function addChallengeComment(user: UserRow, challengeId: string, rawBody: string) {
  await requireChallengeAccess(challengeId, user.id);
  const body = rawBody.replace(/\r\n/g, "\n").trim();
  if (!body) throw badInput("Write a comment first.");
  if (body.length > CHALLENGE_LIMITS.commentChars) throw badInput(`Keep it under ${CHALLENGE_LIMITS.commentChars} characters.`);
  await insertChallengeComment(challengeId, user.id, body);
}

export async function deleteChallengeComment(user: UserRow, commentId: string): Promise<string> {
  const k = await getChallengeComment(commentId);
  if (!k || k.deleted) throw notFound("Comment not found.");
  const { viewer } = await requireChallengeAccess(k.challengeId, user.id);
  if (k.authorId !== user.id && !viewer.isAdmin) throw forbidden("Only the person who wrote it, or an Admin, can delete this.");
  await deleteChallengeCommentRow(commentId);
  return k.challengeId;
}
