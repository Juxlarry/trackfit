import type { GraphQLContext } from "../../shared/auth/context.js";
import { requireUser } from "../../shared/auth/context.js";
import { assertIsoDate } from "../../shared/errors.js";
import {
  createWorkoutTemplate,
  deleteActivityLog,
  findTemplateName,
  listActivityLogs,
  listWorkoutSessionsBetween,
  findExerciseById,
  listMilestonesForSession,
  listSetLogsForSession,
  listTemplateExercises,
  listWeightHistory,
  listWorkoutHistory,
  listWorkoutTemplates,
  searchExercises,
  type ExerciseRow,
  type MilestoneRow,
  type SetLogRow,
  type WorkoutSessionRow,
  type WorkoutTemplateExerciseRow,
  type WorkoutTemplateRow,
} from "./tracking.repository.js";
import { countSessionsThisWeek, logActivity, logWeight, logWorkoutSession, type LogActivityInput } from "./tracking.service.js";

// NOTE on N+1 queries below: field resolvers fetch related rows individually
// (e.g. SetLog.exercise loads one exercise per set). Fine at MVP1 scale/traffic;
// worth a DataLoader pass before this sees real concurrent load.

export const trackingResolvers = {
  Query: {
    weightHistory: (_p: unknown, args: { limit: number }, ctx: GraphQLContext) =>
      listWeightHistory(requireUser(ctx).id, args.limit),

    exercises: (_p: unknown, args: { search?: string | null }) => searchExercises(args.search),

    workoutTemplates: (_p: unknown, _a: unknown, ctx: GraphQLContext) =>
      listWorkoutTemplates(requireUser(ctx).id),

    workoutHistory: (_p: unknown, args: { limit: number }, ctx: GraphQLContext) =>
      listWorkoutHistory(requireUser(ctx).id, args.limit),

    dashboard: async (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      const user = requireUser(ctx);
      const [weightTrend, recentSessions, sessionsThisWeek] = await Promise.all([
        listWeightHistory(user.id, 30),
        listWorkoutHistory(user.id, 5),
        countSessionsThisWeek(user.id),
      ]);
      return {
        latestWeight: weightTrend[0] ?? null,
        weightTrend,
        recentSessions,
        sessionsThisWeek,
      };
    },

    workoutSessionsBetween: (_p: unknown, args: { from: string; to: string }, ctx: GraphQLContext) =>
      listWorkoutSessionsBetween(requireUser(ctx).id, assertIsoDate(args.from, "from"), assertIsoDate(args.to, "to")),

    activityLogs: (_p: unknown, args: { from: string; to: string }, ctx: GraphQLContext) =>
      listActivityLogs(requireUser(ctx).id, assertIsoDate(args.from, "from"), assertIsoDate(args.to, "to")),
  },

  Mutation: {
    logWeight: (
      _p: unknown,
      args: { input: { weightKg: number; bodyFatPercent?: number; recordedAt?: string } },
      ctx: GraphQLContext,
    ) =>
      logWeight({
        userId: requireUser(ctx).id,
        weightKg: args.input.weightKg,
        bodyFatPercent: args.input.bodyFatPercent,
        recordedAt: args.input.recordedAt ? new Date(args.input.recordedAt) : undefined,
      }),

    createWorkoutTemplate: (
      _p: unknown,
      args: {
        input: {
          name: string;
          exercises: { exerciseId: string; order: number; targetSets: number; targetReps: number }[];
        };
      },
      ctx: GraphQLContext,
    ) => createWorkoutTemplate(requireUser(ctx).id, args.input.name, args.input.exercises),

    logWorkoutSession: async (
      _p: unknown,
      args: {
        input: {
          templateId?: string | null;
          durationMinutes?: number | null;
          notes?: string | null;
          shareToClubs?: boolean;
          startedAt?: string | null;
          sets: { exerciseId: string; setNumber: number; reps: number; weightKg: number; rpe?: number }[];
        };
      },
      ctx: GraphQLContext,
    ) => {
      const { startedAt, ...rest } = args.input;
      const result = await logWorkoutSession({
        userId: requireUser(ctx).id, ...rest, startedAt: startedAt ? new Date(startedAt) : null,
      });
      return result.session;
    },

    logActivity: (_p: unknown, args: { input: Omit<LogActivityInput, "userId"> }, ctx: GraphQLContext) =>
      logActivity({ ...args.input, userId: requireUser(ctx).id }),

    deleteActivity: (_p: unknown, args: { id: string }, ctx: GraphQLContext) =>
      deleteActivityLog(requireUser(ctx).id, args.id),
  },

  // GraphQL's default String scalar coerces a Date via .valueOf() (epoch ms)
  // before ever checking .toJSON(), so every Date-typed field below needs an
  // explicit resolver to come out as ISO-8601 rather than a raw number.
  WeightEntry: {
    recordedAt: (parent: { recordedAt: Date }) => parent.recordedAt.toISOString(),
  },

  WorkoutTemplate: {
    createdAt: (parent: WorkoutTemplateRow) => parent.createdAt.toISOString(),
    exercises: (parent: WorkoutTemplateRow) => listTemplateExercises(parent.id),
  },

  WorkoutTemplateExercise: {
    exercise: (parent: WorkoutTemplateExerciseRow) => findExerciseById(parent.exerciseId),
  },

  WorkoutSession: {
    startedAt: (parent: WorkoutSessionRow) => parent.startedAt.toISOString(),
    templateName: (parent: WorkoutSessionRow) => (parent.templateId ? findTemplateName(parent.templateId) : null),
    setCount: async (parent: WorkoutSessionRow) => (await listSetLogsForSession(parent.id)).length,
    volumeKg: async (parent: WorkoutSessionRow) =>
      Math.round((await listSetLogsForSession(parent.id)).reduce((a, s) => a + s.weightKg * s.reps, 0)),
    sets: (parent: WorkoutSessionRow) => listSetLogsForSession(parent.id),
    milestones: (parent: WorkoutSessionRow) => listMilestonesForSession(parent.id),
  },

  SetLog: {
    exercise: (parent: SetLogRow) => findExerciseById(parent.exerciseId),
  },

  Milestone: {
    achievedAt: (parent: MilestoneRow) => parent.achievedAt.toISOString(),
    exercise: (parent: MilestoneRow) => findExerciseById(parent.exerciseId),
  },
};

// Re-exported for the composed resolver map in graphql/schema.ts, kept here
// so each module owns its own GraphQL wiring end to end.
export type { ExerciseRow };
