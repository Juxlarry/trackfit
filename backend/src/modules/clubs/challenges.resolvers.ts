import type { GraphQLContext } from "../../shared/auth/context.js";
import { pool } from "../../shared/db/pool.js";
import { foodByKey } from "../planning/engine/foods.js";
import { ACTIVITY_TYPES, mondayOf } from "../planning/engine/index.js";
import { exercisesByIds } from "../tracking/tracking.service.js";
import { getClub, getMembership, type MemberRow } from "./clubs.repository.js";
import { caller } from "./clubs.resolvers.js";
import type { PersonRef } from "./feed.repository.js";
import { loadPost, mediaOut } from "./feed.resolvers.js";
import {
  countJoined, countSetInWeek, getChallenge, getParticipant, hasWinPost, listChallengeComments, listClubChallenges, listEntries, listJoined,
  type ChallengeCommentRow, type ChallengeRow, type EntryRow, type ParticipantStatus,
} from "./challenges.repository.js";
import {
  CHALLENGE_LIMITS, addChallengeComment, clubToday, createChallenge, deleteChallengeComment, endChallenge, myChallengesOn,
  pendingChallenges, postWin, requireChallengeAccess, respond, submitEntry, type ChallengeInput, type EntryInput, type MyChallenge,
} from "./challenges.service.js";
import { periodOf, periodsOf, progressOf, stateOf, winDraft } from "./challenge-schedule.js";

type Ctx = GraphQLContext;

/** A challenge as the resolvers see it: the row and who's looking. */
interface ChallengeParent extends ChallengeRow {
  viewer: { userId: string; isAdmin: boolean };
  clubName?: string;
  /** undefined: not looked up yet. null: not answered. */
  myAnswer?: ParticipantStatus | null;
}

const withViewer = (c: ChallengeRow & { clubName?: string; status?: ParticipantStatus | null }, viewer: { userId: string; isAdmin: boolean }): ChallengeParent =>
  ({ ...c, viewer, myAnswer: c.status === undefined ? undefined : c.status });

const personOut = (p: PersonRef, viewerId: string) => ({ ...p, isMe: p.userId === viewerId });
const iso = (d: Date) => d.toISOString();

async function todayFor(clubId: string) {
  const club = await getClub(clubId);
  return clubToday(club ?? { timeZone: "Africa/Accra" });
}

function myOut(m: MyChallenge, viewer: { userId: string; isAdmin: boolean }) {
  return { ...m, challenge: withViewer({ ...m.challenge, status: "JOINED" }, viewer) };
}

/** The challenge page. */
async function loadPage(challengeId: string, userId: string) {
  const { challenge: ch, club, viewer } = await requireChallengeAccess(challengeId, userId);
  const v = { userId, isAdmin: viewer.isAdmin };
  const [joined, entries, comments, answer] = await Promise.all([listJoined(ch.id), listEntries(ch.id), listChallengeComments(ch.id), getParticipant(ch.id, userId)]);
  const byUser = new Map<string, EntryRow[]>();
  for (const e of entries) (byUser.get(e.userId) ?? byUser.set(e.userId, []).get(e.userId)!).push(e);
  const participants = joined.map((p) => {
    const mine = byUser.get(p.userId) ?? [];
    const prog = progressOf(ch, mine.map((e) => e.periodStart));
    return { person: personOut(p.person, userId), done: prog.done, total: prog.total, completed: prog.complete, entries: mine };
  }).sort((a, b) => Number(b.completed) - Number(a.completed) || b.done - a.done || a.person.displayName.localeCompare(b.person.displayName));

  let mine = null;
  if (answer?.status === "JOINED") {
    const own = byUser.get(userId) ?? [];
    const prog = progressOf(ch, own.map((e) => e.periodStart));
    const period = periodOf(ch, clubToday(club));
    mine = {
      challenge: withViewer({ ...ch, clubName: club.name, status: "JOINED" }, v),
      doneForPeriod: !!period && own.some((e) => e.periodStart === period), done: prog.done, total: prog.total, completed: prog.complete,
      winDraft: prog.complete && !(await hasWinPost(ch.id, userId)) ? winDraft(ch, prog.total) : null,
    };
  }
  return {
    challenge: withViewer({ ...ch, clubName: club.name, status: answer?.status ?? null }, v),
    mine,
    participants,
    comments: comments.map((k: ChallengeCommentRow) => ({ ...k, author: personOut(k.author, userId), viewer })),
  };
}

export const challengesResolvers = {
  Query: {
    clubChallenge: async (_p: unknown, { id }: { id: string }, ctx: Ctx) => {
      const user = caller(ctx);
      try { return await loadPage(id, user.id); } catch { return null; }
    },
    pendingClubChallenges: async (_p: unknown, a: { date: string }, ctx: Ctx) => {
      const user = caller(ctx);
      return (await pendingChallenges(user, a.date)).map((c) => withViewer(c, { userId: user.id, isAdmin: false }));
    },
    myClubChallenges: async (_p: unknown, a: { date: string }, ctx: Ctx) => {
      const user = caller(ctx);
      return (await myChallengesOn(user, a.date)).map((m) => myOut(m, { userId: user.id, isAdmin: false }));
    },
  },
  Mutation: {
    createClubChallenge: async (_p: unknown, a: { clubId: string; input: ChallengeInput }, ctx: Ctx) => {
      const user = caller(ctx);
      const id = await createChallenge(user, a.clubId, a.input);
      return (await loadPage(id, user.id)).challenge;
    },
    endClubChallenge: async (_p: unknown, { id }: { id: string }, ctx: Ctx) => {
      await endChallenge(caller(ctx), id);
      return true;
    },
    respondToClubChallenge: async (_p: unknown, a: { id: string; join: boolean }, ctx: Ctx) => {
      const user = caller(ctx);
      await respond(user, a.id, a.join);
      return (await loadPage(a.id, user.id)).challenge;
    },
    submitClubChallengeEntry: async (_p: unknown, a: { challengeId: string; input: EntryInput }, ctx: Ctx) => {
      const user = caller(ctx);
      const { completed } = await submitEntry(user, a.challengeId, a.input);
      const mine = (await myChallengesOn(user, a.input.date)).find((m) => m.challenge.id === a.challengeId);
      // Normally found; fall back to the page (e.g. a date the member's list doesn't cover).
      return { completed, mine: mine ? myOut(mine, { userId: user.id, isAdmin: false }) : (await loadPage(a.challengeId, user.id)).mine };
    },
    postClubChallengeWin: async (_p: unknown, a: { challengeId: string; body?: string | null }, ctx: Ctx) => {
      const user = caller(ctx);
      return loadPost(await postWin(user, a.challengeId, a.body), user.id);
    },
    commentOnClubChallenge: async (_p: unknown, a: { id: string; body: string }, ctx: Ctx) => {
      const user = caller(ctx);
      await addChallengeComment(user, a.id, a.body);
      return loadPage(a.id, user.id);
    },
    deleteClubChallengeComment: async (_p: unknown, { id }: { id: string }, ctx: Ctx) => {
      const user = caller(ctx);
      return loadPage(await deleteChallengeComment(user, id), user.id);
    },
  },
  Club: {
    challenges: async (c: { id: string; name: string; viewer: MemberRow }) =>
      (await listClubChallenges(c.id)).map((ch) => withViewer({ ...ch, clubName: c.name }, { userId: c.viewer.userId, isAdmin: c.viewer.isAdmin })),
    challengeQuota: async (c: { id: string; timeZone: string; viewer: MemberRow }) => {
      if (!c.viewer.isCoach) return null;
      return { limit: CHALLENGE_LIMITS.perCoachPerWeek, usedThisWeek: await countSetInWeek(pool, c.id, c.viewer.userId, mondayOf(clubToday(c))) };
    },
  },
  ClubMemberOverview: {
    challengesTaken: async (o: { member: { clubId: string; userId: string } }) => (await countJoined(o.member.clubId, o.member.userId)).taken,
    challengesCompleted: async (o: { member: { clubId: string; userId: string } }) => (await countJoined(o.member.clubId, o.member.userId)).completed,
  },
  ClubPost: {
    challenge: async (p: { challengeId: string | null; viewer: MemberRow }) => {
      if (!p.challengeId) return null;
      const ch = await getChallenge(p.challengeId);
      return ch ? withViewer(ch, { userId: p.viewer.userId, isAdmin: p.viewer.isAdmin }) : null;
    },
  },
  ClubChallenge: {
    clubName: async (c: ChallengeParent) => c.clubName ?? (await getClub(c.clubId))?.name ?? "",
    coach: async (c: ChallengeParent) => {
      const m = await getMembership(c.clubId, c.coachId);
      return { userId: c.coachId, displayName: c.coachName, isAdmin: !!m?.isAdmin, isCoach: !!m?.isCoach, inClub: m?.status === "ACTIVE", isMe: c.coachId === c.viewer.userId };
    },
    state: async (c: ChallengeParent) => stateOf(c, await todayFor(c.clubId)),
    video: (c: ChallengeParent) => mediaOut(c.videoMediaId),
    exercises: async (c: ChallengeParent) => {
      if (!c.exercises.length) return [];
      const names = new Map((await exercisesByIds(c.exercises.map((e) => e.exerciseId))).map((e) => [e.id, e.name]));
      return c.exercises.map((e) => ({ ...e, name: names.get(e.exerciseId) ?? "Exercise" }));
    },
    activityLabel: (c: ChallengeParent) => (c.activityType ? ACTIVITY_TYPES[c.activityType]?.label ?? c.activityType : null),
    foodUnit: (c: ChallengeParent) => (c.kind !== "FOOD" ? null : c.foodKey && foodByKey(c.foodKey)?.liquid ? "ml" : "g"),
    createdAt: (c: ChallengeParent) => iso(c.createdAt),
    totalPeriods: (c: ChallengeParent) => periodsOf(c).length,
    joinedCount: async (c: ChallengeParent) => (await listJoined(c.id)).length,
    myAnswer: async (c: ChallengeParent) => (c.myAnswer !== undefined ? c.myAnswer : (await getParticipant(c.id, c.viewer.userId))?.status ?? null),
    canEnd: async (c: ChallengeParent) => {
      if (c.coachId !== c.viewer.userId && !c.viewer.isAdmin) return false;
      const s = stateOf(c, await todayFor(c.clubId));
      return s === "UPCOMING" || s === "RUNNING";
    },
  },
  ClubChallengeEntry: {
    proof: (e: EntryRow) => mediaOut(e.mediaId),
    createdAt: (e: EntryRow) => iso(e.createdAt),
  },
  ClubChallengeComment: {
    createdAt: (k: ChallengeCommentRow) => iso(k.createdAt),
    canDelete: (k: ChallengeCommentRow & { author: { isMe: boolean }; viewer: MemberRow }) => k.author.isMe || k.viewer.isAdmin,
  },
};
