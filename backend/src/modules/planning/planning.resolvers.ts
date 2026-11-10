import type { GraphQLContext } from "../../shared/auth/context.js";
import { requireUser } from "../../shared/auth/context.js";
import type { DietInput, TrainingBasics, TrainingDetails, TrainingInput } from "./engine/index.js";
import {
  completeFuelSetup, completeOnboarding, completeQuickOnboarding, fineTuneTraining, getActivePlan, previewPlan, resetWeekSchedule, setStartDate, setTrainingDays, setWorkoutReminder, swapSessionDays,
  type ActivePlan, type OnboardingSubmission,
} from "./planning.service.js";
import { completeCheckin, getCheckin, previewNextCycle } from "./checkin.service.js";
import { listCycles } from "./planning.repository.js";
import type { CheckinAnswers } from "./engine/index.js";

/** GraphQL leaves optional fields undefined; keep the stored answers explicit. */
const toAnswers = (a: CheckinAnswers): CheckinAnswers => ({
  feel: a.feel, eating: a.eating, days: a.days, goalChoice: a.goalChoice ?? null, newTargetKg: a.newTargetKg ?? null, keep: a.keep ?? [],
});

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
      priorityMuscles: p.profile.priorityMuscles, lowPriorityMuscles: p.profile.lowPriorityMuscles, reminderTime: p.profile.reminderTime,
      dietPattern: p.profile.diet?.pattern ?? null, allergies: p.profile.diet?.allergies ?? [], mealPattern: p.profile.diet?.mealPattern ?? null,
      fasting: p.profile.diet?.fasting ?? null, prep: p.profile.diet?.prep ?? null, favouriteDishes: p.profile.diet?.favouriteDishes ?? [],
    },
  };
}

type BasicsArg = Omit<TrainingBasics, "bodyFatLevel" | "targetWeightKg" | "pace"> & {
  bodyFatLevel?: number | null; targetWeightKg?: number | null; pace?: TrainingBasics["pace"]; injuryNote?: string | null; motivations?: string[] | null;
};
type DetailsArg = Omit<TrainingDetails, "lowPriorityMuscles" | "sleepQuality"> & {
  lowPriorityMuscles?: TrainingDetails["lowPriorityMuscles"] | null; sleepQuality?: TrainingDetails["sleepQuality"]; cardioFrequency?: string | null;
};
type FuelArg = { diet: DietArg; activityLevel: TrainingInput["activityLevel"]; trainTime?: TrainingInput["trainTime"]; busyness?: TrainingInput["busyness"] };

const toBasics = (b: BasicsArg): TrainingBasics => ({
  sex: b.sex, age: b.age, heightCm: b.heightCm, weightKg: b.weightKg, bodyFatLevel: b.bodyFatLevel ?? null, goal: b.goal,
  targetWeightKg: b.targetWeightKg ?? null, pace: b.pace ?? null, experience: b.experience, equipment: b.equipment,
  availableDays: [...new Set(b.availableDays)].sort(), daysPerWeek: b.daysPerWeek,
  sessionMinutes: b.sessionMinutes as TrainingBasics["sessionMinutes"], injuries: b.injuries,
});
const toDetails = (d: DetailsArg): TrainingDetails => ({
  liftComfort: d.liftComfort, split: d.split, fullBodyDay: d.fullBodyDay, priorityMuscles: d.priorityMuscles,
  lowPriorityMuscles: [...new Set(d.lowPriorityMuscles ?? [])], cardioLikes: d.cardioLikes, warmup: d.warmup,
  sleepHours: d.sleepHours, sleepQuality: d.sleepQuality ?? null,
});
const toFuel = (f: FuelArg) => ({
  diet: toDiet(f.diet),
  dietExtras: { calorieAwareness: f.diet.calorieAwareness ?? null, proteinAwareness: f.diet.proteinAwareness ?? null },
  lifestyle: { activityLevel: f.activityLevel, trainTime: f.trainTime ?? null, busyness: f.busyness ?? null },
});

export const planningResolvers = {
  Query: {
    myCycles: (_p: unknown, _a: unknown, ctx: GraphQLContext) => listCycles(requireUser(ctx).id),
    previewPlan: (_p: unknown, args: { training: TrainingArg; diet: DietArg; startDate: string }) => {
      const plan = previewPlan(toTraining(args.training), toDiet(args.diet), args.startDate);
      return {
        ...plan,
        splitLabel: plan.week.splitLabel, daysPerWeek: plan.week.daysPerWeek, sessions: plan.week.sessions, restDays: plan.week.restDays,
        sampleMenu: {
          ...plan.sampleMenu, items: plan.sampleMenu.items.map((i) => ({ ...i, eaten: false, skipped: false })), targets: plan.targets,
          foods: [], water: null, eaten: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
        },
      };
    },
    myPlan: async (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      const plan = await getActivePlan(requireUser(ctx).id);
      return plan ? presentPlan(plan) : null;
    },
    cycleCheckin: async (_p: unknown, args: { today: string }, ctx: GraphQLContext) => {
      const userId = requireUser(ctx).id;
      return (await getActivePlan(userId)) ? getCheckin(userId, args.today) : null;
    },
    previewNextCycle: async (_p: unknown, args: { today: string; answers: CheckinAnswers; details?: DetailsArg | null }, ctx: GraphQLContext) => {
      const user = requireUser(ctx);
      const next = await previewNextCycle(user.id, args.today, toAnswers(args.answers), user.units, args.details ? toDetails(args.details) : null);
      return {
        changes: next.changes, targets: next.targets, daysPerWeek: next.days, splitLabel: next.week.splitLabel,
        sessions: next.week.sessions.map((s) => ({ ...s, exercises: s.exercises.map((e) => ({ ...e, startLoadKg: next.loads[e.name] ?? null })) })),
      };
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
    completeQuickOnboarding: async (
      _p: unknown,
      args: { input: { displayName?: string | null; email?: string | null; screening: OnboardingSubmission["screening"]; basics: BasicsArg; details?: DetailsArg | null; fuel?: FuelArg | null; mindset?: Record<string, unknown> | null; startDate: string } },
      ctx: GraphQLContext,
    ) => {
      const user = requireUser(ctx);
      const i = args.input;
      const result = await completeQuickOnboarding(user, {
        displayName: i.displayName?.trim() || null,
        email: i.email?.trim() || null,
        screening: i.screening,
        basics: toBasics(i.basics),
        details: i.details ? toDetails(i.details) : null,
        fuel: i.fuel ? toFuel(i.fuel) : null,
        trainingExtras: {
          motivations: i.basics.motivations ?? [], injuryNote: i.basics.injuryNote ?? null,
          cardioFrequency: i.details?.cardioFrequency ?? null, energy: null, mindset: i.mindset ?? {},
        },
        startDate: i.startDate,
      }, ctx.auth ?? null);
      return { ...result, plan: result.plan ? presentPlan(result.plan) : null };
    },
    completeFuelSetup: async (_p: unknown, args: { input: FuelArg }, ctx: GraphQLContext) =>
      presentPlan(await completeFuelSetup(requireUser(ctx).id, toFuel(args.input))),
    fineTuneTraining: async (_p: unknown, args: { input: DetailsArg }, ctx: GraphQLContext) =>
      presentPlan(await fineTuneTraining(requireUser(ctx).id, toDetails(args.input))),
    setTrainingDays: async (_p: unknown, args: { days: number }, ctx: GraphQLContext) =>
      presentPlan(await setTrainingDays(requireUser(ctx).id, args.days)),
    setStartDate: async (_p: unknown, args: { date: string }, ctx: GraphQLContext) =>
      presentPlan(await setStartDate(requireUser(ctx).id, args.date)),
    swapSessionDays: async (_p: unknown, args: { dateA: string; dateB: string }, ctx: GraphQLContext) =>
      presentPlan(await swapSessionDays(requireUser(ctx).id, args.dateA, args.dateB)),
    resetWeekSchedule: async (_p: unknown, args: { date: string }, ctx: GraphQLContext) =>
      presentPlan(await resetWeekSchedule(requireUser(ctx).id, args.date)),
    completeCheckin: async (_p: unknown, args: { today: string; answers: CheckinAnswers; startDate: string; details?: DetailsArg | null }, ctx: GraphQLContext) => {
      const user = requireUser(ctx);
      return presentPlan(await completeCheckin(user.id, args.today, toAnswers(args.answers), args.startDate, user.units, args.details ? toDetails(args.details) : null));
    },
    setWorkoutReminder: async (_p: unknown, args: { time?: string | null }, ctx: GraphQLContext) =>
      presentPlan(await setWorkoutReminder(requireUser(ctx).id, args.time ?? null)),
  },
};
