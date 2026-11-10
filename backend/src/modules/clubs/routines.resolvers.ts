import type { GraphQLContext } from "../../shared/auth/context.js";
import { ACTIVITY_TYPES } from "../planning/engine/index.js";
import { exercisesByIds } from "../tracking/tracking.service.js";
import { getClub, type MemberRow } from "./clubs.repository.js";
import { caller } from "./clubs.resolvers.js";
import { listRoutines, type RoutineRow } from "./routines.repository.js";
import {
  ROUTINE_LIMITS, archiveRoutine, createRoutine, logRoutineWorkout, myRoutinesOn, routineProgress, updateRoutine, type RoutineInput,
} from "./routines.service.js";

type Ctx = GraphQLContext;
/** A routine as the resolvers see it; clubName is filled in when the query already has it. */
type RoutineParent = RoutineRow & { clubName?: string };

export const routinesResolvers = {
  Query: {
    clubRoutineProgress: async (_p: unknown, a: { id: string; today: string; weeks: number }, ctx: Ctx) => {
      const user = caller(ctx);
      try {
        const p = await routineProgress(user, a.id, a.today, a.weeks);
        return {
          routine: p.routine, weekStarts: p.weekStarts,
          members: p.members.map((m) => ({ userId: m.member.userId, displayName: m.member.displayName, isMe: m.member.userId === user.id, weeks: m.weeks, streak: m.streak, doneToday: m.doneToday })),
        };
      } catch (err) {
        if ((err as { extensions?: { code?: string } }).extensions?.code === "BAD_USER_INPUT") throw err;
        return null;
      }
    },
    myClubRoutines: async (_p: unknown, a: { date: string }, ctx: Ctx) =>
      (await myRoutinesOn(caller(ctx), a.date)).map((x) => ({ routine: { ...x.routine, clubName: x.clubName }, done: x.done })),
  },
  Mutation: {
    createClubRoutine: (_p: unknown, a: { clubId: string; input: RoutineInput }, ctx: Ctx) => createRoutine(caller(ctx), a.clubId, a.input),
    updateClubRoutine: (_p: unknown, a: { id: string; input: RoutineInput }, ctx: Ctx) => updateRoutine(caller(ctx), a.id, a.input),
    archiveClubRoutine: async (_p: unknown, a: { id: string }, ctx: Ctx) => {
      await archiveRoutine(caller(ctx), a.id);
      return true;
    },
    logClubRoutineWorkout: async (_p: unknown, a: { routineId: string; date: string; durationMinutes?: number | null; weights?: { exerciseId: string; weightKg?: number | null }[] | null }, ctx: Ctx) => {
      const { routine } = await logRoutineWorkout(caller(ctx), a.routineId, a);
      return { routine, done: true };
    },
  },
  Club: {
    routines: (c: { id: string; viewer: MemberRow }) => listRoutines(c.id),
    routineLimit: () => ROUTINE_LIMITS.activePerClub,
  },
  ClubRoutine: {
    clubName: async (r: RoutineParent) => r.clubName ?? (await getClub(r.clubId))?.name ?? "",
    activityLabel: (r: RoutineParent) => (r.activityType ? ACTIVITY_TYPES[r.activityType]?.label ?? r.activityType : null),
    exercises: async (r: RoutineParent) => {
      if (!r.exercises.length) return [];
      const names = new Map((await exercisesByIds(r.exercises.map((e) => e.exerciseId))).map((e) => [e.id, e.name]));
      return r.exercises.map((e) => ({ ...e, name: names.get(e.exerciseId) ?? "Exercise" }));
    },
    createdAt: (r: RoutineParent) => r.createdAt.toISOString(),
  },
};
