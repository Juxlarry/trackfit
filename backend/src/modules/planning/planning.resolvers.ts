import type { GraphQLContext } from "../../shared/auth/context.js";
import { requireUser } from "../../shared/auth/context.js";
import type { DietInput, TrainingInput } from "./engine/index.js";
import {
  completeOnboarding, getActivePlan, previewPlan, resetWeekSchedule, setStartDate, setTrainingDays, setWorkoutReminder, swapSessionDays,
  type ActivePlan, type OnboardingSubmission,
} from "./planning.service.js";

type TrainingArg = Omit<TrainingInput, "lowPriorityMuscles"> & { lowPriorityMuscles?: TrainingInput["lowPriorityMuscles"] | null; motivations?: string[] | null; injuryNote?: string | null; cardioFrequency?: string | null; energy?: string | null };
type DietArg = Omit<DietInput, "dislikes" | "prep"> & { dislikes?: string | null; prep?: DietInput["prep"] | null; calorieAwareness?: string | null; proteinAwareness?: string | null };

/** GraphQL leaves optional fields undefined; the engine expects explicit nulls. */
function toTraining(t: TrainingArg): TrainingInput {
  return {
    sex: t.sex, age: t.age, heightCm: t.heightCm, weightKg: t.weightKg, bodyFatLevel: t.bodyFatLevel ?? null, goal: t.goal,
    targetWeightKg: t.targetWeightKg ?? null, pace: t.pace ?? null, experience: t.experience, liftComfort: t.liftComfort,
    equipment: t.equipment, availableDays: [...new Set(t.availableDays)].sort(), daysPerWeek: t.daysPerWeek,
    sessionMinutes: t.sessionMinutes as TrainingInput["sessionMinutes"], split: t.split, fullBodyDay: t.fullBodyDay,
    priorityMuscles: t.priorityMuscles, lowPriorityMuscles: [...new Set(t.lowPriorityMuscles ?? [])], injuries: t.injuries, activityLevel: t.activityLevel, sleepHours: t.sleepHours,
    sleepQuality: t.sleepQuality ?? null, trainTime: t.trainTime ?? null, busyness: t.busyness ?? null, warmup: t.warmup,
    cardioLikes: t.cardioLikes, blockers: t.blockers,
  };
}
function toDiet(d: DietArg): DietInput {
  return {
    pattern: d.pattern, allergies: d.allergies, dislikes: d.dislikes ?? "", favouriteDishes: d.favouriteDishes,
    mealPattern: d.mealPattern, prep: d.prep ?? null, fasting: d.fasting, struggles: d.struggles,
  };
}

function presentPlan(p: ActivePlan) {
  return {
    ...p,
    profile: {
      goal: p.profile.goal, targetWeightKg: p.profile.targetWeightKg, startWeightKg: p.profile.weightKg, heightCm: p.profile.heightCm,
      sessionMinutes: p.profile.sessionMinutes, sleepHours: p.profile.sleepHours, equipment: p.profile.equipment,
      experience: p.profile.experience, warmup: p.profile.warmup, cardioLikes: p.profile.cardioLikes,
      priorityMuscles: p.profile.priorityMuscles, lowPriorityMuscles: p.profile.lowPriorityMuscles, reminderTime: p.profile.reminderTime, dietPattern: p.profile.diet.pattern,
      allergies: p.profile.diet.allergies, mealPattern: p.profile.diet.mealPattern, fasting: p.profile.diet.fasting,
      prep: p.profile.diet.prep, favouriteDishes: p.profile.diet.favouriteDishes,
    },
  };
}

export const planningResolvers = {
  Query: {
    previewPlan: (_p: unknown, args: { training: TrainingArg; diet: DietArg; startDate: string }) => {
      const plan = previewPlan(toTraining(args.training), toDiet(args.diet), args.startDate);
      return {
        ...plan,
        splitLabel: plan.week.splitLabel, daysPerWeek: plan.week.daysPerWeek, sessions: plan.week.sessions, restDays: plan.week.restDays,
        sampleMenu: { ...plan.sampleMenu, items: plan.sampleMenu.items.map((i) => ({ ...i, eaten: false })), targets: plan.targets },
      };
    },
    myPlan: async (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      const plan = await getActivePlan(requireUser(ctx).id);
      return plan ? presentPlan(plan) : null;
    },
  },
  Mutation: {
    completeOnboarding: async (
      _p: unknown,
      args: { input: { displayName?: string | null; email?: string | null; screening: OnboardingSubmission["screening"]; training: TrainingArg; diet: DietArg; mindset?: Record<string, unknown> | null; startDate: string } },
      ctx: GraphQLContext,
    ) => {
      const user = requireUser(ctx);
      const i = args.input;
      const result = await completeOnboarding(user, {
        displayName: i.displayName?.trim() || null,
        email: i.email?.trim() || null,
        screening: i.screening,
        training: toTraining(i.training),
        trainingExtras: {
          motivations: i.training.motivations ?? [], injuryNote: i.training.injuryNote ?? null,
          cardioFrequency: i.training.cardioFrequency ?? null, energy: i.training.energy ?? null, mindset: i.mindset ?? {},
        },
        diet: toDiet(i.diet),
        dietExtras: { calorieAwareness: i.diet.calorieAwareness ?? null, proteinAwareness: i.diet.proteinAwareness ?? null },
        startDate: i.startDate,
      }, ctx.auth ?? null);
      return { ...result, plan: result.plan ? presentPlan(result.plan) : null };
    },
    setTrainingDays: async (_p: unknown, args: { days: number }, ctx: GraphQLContext) =>
      presentPlan(await setTrainingDays(requireUser(ctx).id, args.days)),
    setStartDate: async (_p: unknown, args: { date: string }, ctx: GraphQLContext) =>
      presentPlan(await setStartDate(requireUser(ctx).id, args.date)),
    swapSessionDays: async (_p: unknown, args: { dateA: string; dateB: string }, ctx: GraphQLContext) =>
      presentPlan(await swapSessionDays(requireUser(ctx).id, args.dateA, args.dateB)),
    resetWeekSchedule: async (_p: unknown, args: { date: string }, ctx: GraphQLContext) =>
      presentPlan(await resetWeekSchedule(requireUser(ctx).id, args.date)),
    setWorkoutReminder: async (_p: unknown, args: { time?: string | null }, ctx: GraphQLContext) =>
      presentPlan(await setWorkoutReminder(requireUser(ctx).id, args.time ?? null)),
  },
};
