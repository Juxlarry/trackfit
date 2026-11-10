import { pool } from "../../shared/db/pool.js";
import { getMailer } from "../../shared/email/mailer.js";
import { eventBus } from "../../shared/events/bus.js";
import { badInput, notFound, assertIsoDate } from "../../shared/errors.js";
import type { UserRow } from "../identity/identity.repository.js";
import {
  addDaysIso, adaptations, buildWeek, computeProjection, computeTargets, dayRange, generatePlan, isScreenedOut, mondayOf,
  restSuggestion, suggestLoadKg, swapIssue, swappedOrder, toIsoDate, validateDiet, validateIntake, validateTraining, weekTypes, weekdayOf,
  PLACEHOLDER_DIET, quickTraining,
  type DaySwap, type DietInput, type FuelLifestyle, type GeneratedPlan, type HealthScreening, type IntakeSection, type TrainingBasics,
  type TrainingDetails, type TrainingInput,
} from "./engine/index.js";
import {
  archiveActiveProgram, deactivateProgramTemplates, deleteScheduleSwaps, getActiveProgram, getIntake, insertGeneratedTemplates,
  insertProgram, insertScheduleSwap, emailTakenByOther, listActiveSessions, listScheduleSwaps, lockProgram, markOnboarded,
  saveFuelLifestyle, saveTrainingDetails, setReminderTime, templateLoggedNear, updateProgramSchedule, upsertHealthScreening, upsertIntake,
  type IntakeExtras, type ScheduleSwapRow, type StoredSession,
} from "./planning.repository.js";
import {
  archiveActiveNutritionPlan, getActiveNutritionPlan, getDietaryProfile, insertNutritionPlan,
  updateActiveNutritionTargets, upsertDietaryProfile, type DietExtras,
} from "../nutrition/nutrition.repository.js";
import { welcomeEmail } from "./welcome-email.js";

export const CYCLE_DAYS = 42; // 6-week cycle (spec §4.8.7, §9.4)
export const todayIso = () => toIsoDate(new Date());

/** Start dates: from yesterday (time-zone slack) up to 4 weeks out (onboarding-flow.md). */
function checkStartDate(startIso: string) {
  assertIsoDate(startIso, "startDate");
  const t = todayIso();
  if (startIso < addDaysIso(t, -1) || startIso > addDaysIso(t, 28)) {
    throw badInput("Pick a start date between today and 4 weeks from now.", [{ field: "startDate", message: "Out of range." }]);
  }
}

export function previewPlan(training: TrainingInput, diet: DietInput, startIso: string): GeneratedPlan {
  assertIsoDate(startIso, "startDate");
  const issues = validateIntake(training, diet);
  if (issues.length) throw badInput("Some answers need another look.", issues);
  return generatePlan(training, diet, startIso);
}

export interface OnboardingSubmission {
  displayName: string | null;
  email: string | null;
  screening: HealthScreening;
  training: TrainingInput;
  trainingExtras: IntakeExtras;
  diet: DietInput;
  dietExtras: DietExtras;
  startDate: string;
}

export type OnboardingResult =
  | { screenedOut: true; message: string; plan: null }
  | { screenedOut: false; message: null; plan: ActivePlan };

/**
 * spec §4.8: gate → save intake → generate program + nutrition plan in one step → welcome email.
 * Re-running it (e.g. "Change my answers") archives the current cycle and starts a fresh one.
 */
export async function completeOnboarding(
  user: UserRow,
  input: OnboardingSubmission,
  auth: { emailVerified: boolean; signInProvider: string | null } | null,
): Promise<OnboardingResult> {
  return onboard(user, { ...input, trainingExtras: { ...input.trainingExtras, onboardingPath: "FULL", pendingSections: [] } }, auth);
}

type Auth = { emailVerified: boolean; signInProvider: string | null } | null;

export interface QuickOnboardingSubmission {
  displayName: string | null;
  email: string | null;
  screening: HealthScreening;
  basics: TrainingBasics;
  /** Sent when the user answered them anyway (e.g. switched paths partway). */
  details: TrainingDetails | null;
  fuel: { diet: DietInput; dietExtras: DietExtras; lifestyle: FuelLifestyle } | null;
  trainingExtras: Omit<IntakeExtras, "onboardingPath" | "pendingSections">;
  startDate: string;
}

/**
 * Quick start (README "Quick start onboarding"): only the basics are required.
 * Anything not answered gets the engine's defaults and is remembered as owed.
 * Answers from an earlier cycle are kept rather than reset to defaults.
 */
export async function completeQuickOnboarding(user: UserRow, input: QuickOnboardingSubmission, auth: Auth): Promise<OnboardingResult> {
  const [prior, priorDiet] = await Promise.all([getIntake(user.id), getDietaryProfile(user.id)]);
  const knownDetails = prior && !prior.pendingSections.includes("TRAINING_DETAILS") ? prior.training : null;
  const knownLifestyle = prior && !prior.pendingSections.includes("FUEL") ? prior.training : null;
  const details = input.details ?? knownDetails;
  const lifestyle = input.fuel?.lifestyle ?? knownLifestyle;
  const diet = input.fuel?.diet ?? priorDiet;
  const pending: IntakeSection[] = [...(diet ? [] : ["FUEL" as const]), ...(details ? [] : ["TRAINING_DETAILS" as const])];
  return onboard(user, {
    displayName: input.displayName, email: input.email, screening: input.screening, startDate: input.startDate,
    training: quickTraining(input.basics, details && pick(details), lifestyle && { activityLevel: lifestyle.activityLevel, trainTime: lifestyle.trainTime, busyness: lifestyle.busyness }),
    trainingExtras: { ...input.trainingExtras, onboardingPath: "QUICK", pendingSections: pending },
    diet, dietExtras: input.fuel?.dietExtras ?? { calorieAwareness: null, proteinAwareness: null },
  }, auth);
}

const pick = (t: TrainingDetails): TrainingDetails => ({
  liftComfort: t.liftComfort, split: t.split, fullBodyDay: t.fullBodyDay, priorityMuscles: t.priorityMuscles,
  lowPriorityMuscles: t.lowPriorityMuscles, cardioLikes: t.cardioLikes, warmup: t.warmup, sleepHours: t.sleepHours, sleepQuality: t.sleepQuality,
});

/** Both paths: gate, save, generate the program and nutrition targets, then the welcome email. */
async function onboard(
  user: UserRow,
  input: Omit<OnboardingSubmission, "diet"> & { diet: DietInput | null },
  auth: Auth,
): Promise<OnboardingResult> {
  const screenedOut = isScreenedOut(input.screening);
  if (screenedOut) {
    await upsertHealthScreening(pool, user.id, input.screening, true);
    return {
      screenedOut: true, plan: null,
      message: "Based on your answers, please speak with a doctor or qualified trainer before starting a generated program. You can still use TrackFit's logging tools.",
    };
  }
  const issues = [...validateTraining(input.training), ...(input.diet ? validateDiet(input.diet) : [])];
  if (issues.length) throw badInput("Some answers need another look.", issues);
  checkStartDate(input.startDate);
  if (!user.email && input.email && (await emailTakenByOther(user.id, input.email))) {
    throw badInput("That email already has a TrackFit account. Sign in instead.", [{ field: "email", message: "Already registered." }]);
  }

  // Calories and the week don't depend on the diet; without one, no menu is kept.
  const plan = generatePlan(input.training, input.diet ?? PLACEHOLDER_DIET, input.startDate);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await upsertHealthScreening(client, user.id, input.screening, false);
    await upsertIntake(client, user.id, input.training, input.trainingExtras);
    if (input.diet) await upsertDietaryProfile(client, user.id, input.diet, input.dietExtras);
    const previousCycle = await archiveActiveProgram(client, user.id);
    await archiveActiveNutritionPlan(client, user.id);
    const cycleNumber = previousCycle + 1;
    const program = await insertProgram(client, {
      userId: user.id, cycleNumber, startDate: input.startDate, endDate: addDaysIso(input.startDate, CYCLE_DAYS - 1),
      onboardingDays: input.training.daysPerWeek, daysPerWeek: input.training.daysPerWeek, splitLabel: plan.week.splitLabel,
    });
    await insertGeneratedTemplates(client, user.id, program.id, plan.week);
    await insertNutritionPlan(client, user.id, cycleNumber, plan.targets);
    await markOnboarded(client, user.id, input.displayName, input.email);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const active = (await getActivePlan(user.id))!;
  eventBus.publish({ type: "PlanGenerated", userId: user.id, programId: active.programId, cycleNumber: active.cycleNumber, daysPerWeek: active.daysPerWeek });
  const to = user.email ?? input.email;
  if (to) {
    try {
      await getMailer().send(welcomeEmail({
        to, firstName: (input.displayName ?? user.displayName ?? "").trim().split(/\s+/)[0] ?? "",
        todayIso: todayIso(), startIso: input.startDate, sessions: plan.week.sessions,
        daysPerWeek: plan.week.daysPerWeek, sessionMinutes: input.training.sessionMinutes, targets: plan.targets,
        projection: plan.projection, targetWeightKg: input.training.targetWeightKg,
        planUrl: `${process.env.APP_URL ?? "http://localhost:5173"}/today`,
        needsVerification: auth?.signInProvider === "password" && !auth.emailVerified,
      }));
    } catch (err) {
      // The plan is saved; a failed welcome email must not fail onboarding.
      // eslint-disable-next-line no-console
      console.error("Welcome email failed", err);
    }
  }
  return { screenedOut: false, message: null, plan: active };
}

export interface ActivePlan {
  programId: string;
  cycleNumber: number;
  startDate: string;
  endDate: string;
  onboardingDays: number;
  daysPerWeek: number;
  dayRange: { min: number; max: number };
  splitLabel: string;
  targets: ReturnType<typeof computeTargets>;
  projection: ReturnType<typeof computeProjection>;
  sessions: (StoredSession & { exercises: (StoredSession["exercises"][number] & { suggestedLoadKg: number | null; startLoadKg: number | null })[] })[];
  restDays: { weekday: number; suggestion: string }[];
  adaptations: ReturnType<typeof adaptations>;
  /** Day swaps the user made, per week, in order. The plan's week (sessions) is unchanged by them. */
  scheduleSwaps: ScheduleSwapRow[];
  /** diet is null until a quick start user sets up Fuel. */
  profile: TrainingInput & { reminderTime: string | null; diet: DietInput | null };
  onboardingPath: "FULL" | "QUICK";
  /** Question blocks still owed (quick start). */
  pendingSections: IntakeSection[];
}

export async function getActivePlan(userId: string): Promise<ActivePlan | null> {
  const program = await getActiveProgram(userId);
  if (!program) return null;
  const [intake, diet, nplan, sessions, scheduleSwaps] = await Promise.all([
    getIntake(userId), getDietaryProfile(userId), getActiveNutritionPlan(userId), listActiveSessions(program.id), listScheduleSwaps(program.id),
  ]);
  if (!intake || !nplan) throw notFound("Plan data is incomplete. Please redo onboarding.");
  const t = intake.training;
  const computed = computeTargets(t, program.daysPerWeek);
  const used = new Set(sessions.map((s) => s.weekday));
  const restDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !used.has(d)).map((weekday) => ({ weekday, suggestion: restSuggestion(weekday, t.cardioLikes) }));
  const week = { daysPerWeek: program.daysPerWeek, splitLabel: program.splitLabel, sessions, restDays };
  return {
    programId: program.id, cycleNumber: program.cycleNumber, startDate: program.startDate, endDate: program.endDate,
    onboardingDays: program.onboardingDays, daysPerWeek: program.daysPerWeek, dayRange: dayRange(program.onboardingDays),
    splitLabel: program.splitLabel,
    targets: { bmr: computed.bmr, tdee: computed.tdee, kcal: nplan.dailyKcal, proteinG: nplan.proteinG, carbsG: nplan.carbsG, fatG: nplan.fatG },
    projection: computeProjection(t, program.startDate),
    sessions: sessions.map((s) => ({
      ...s,
      exercises: s.exercises.map((e) => ({ ...e, suggestedLoadKg: suggestLoadKg(e.name, t), startLoadKg: program.startLoads[e.name] ?? null })),
    })),
    restDays,
    adaptations: adaptations(t, diet, week),
    scheduleSwaps,
    profile: { ...t, reminderTime: intake.reminderTime, diet },
    onboardingPath: intake.onboardingPath,
    pendingSections: intake.pendingSections,
  };
}

// ── Questions asked later (quick start) ─────────────────────────────────

/**
 * "Set up Fuel": the diet and the two lifestyle answers that change calories
 * and meal timing. Recalculates the targets, keeping any check-in correction.
 */
export async function completeFuelSetup(
  userId: string, input: { diet: DietInput; dietExtras: DietExtras; lifestyle: FuelLifestyle },
): Promise<ActivePlan> {
  const program = await getActiveProgram(userId);
  const intake = await getIntake(userId);
  if (!program || !intake) throw notFound("No active plan.");
  const issues = validateDiet(input.diet);
  if (issues.length) throw badInput("Some answers need another look.", issues);
  const training = { ...intake.training, ...input.lifestyle };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await upsertDietaryProfile(client, userId, input.diet, input.dietExtras);
    await saveFuelLifestyle(client, userId, input.lifestyle);
    await updateActiveNutritionTargets(client, userId, computeTargets(training, program.daysPerWeek, program.kcalOffset));
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return (await getActivePlan(userId))!;
}

/**
 * "Fine-tune your training". Rebuilds the weekly plan the way ±1 training
 * days does: check-in adjustments stay, logged workouts keep their history,
 * and this week's day swaps are cleared.
 */
export async function fineTuneTraining(userId: string, details: TrainingDetails): Promise<ActivePlan> {
  const program = await getActiveProgram(userId);
  const intake = await getIntake(userId);
  if (!program || !intake) throw notFound("No active plan.");
  const training = { ...intake.training, ...pick(details) };
  const issues = validateTraining(training);
  if (issues.length) throw badInput("Some answers need another look.", issues);
  const week = buildWeek(training, program.daysPerWeek, program.buildOptions);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockProgram(client, program.id);
    await saveTrainingDetails(client, userId, pick(details));
    await deactivateProgramTemplates(client, program.id);
    await deleteScheduleSwaps(client, program.id);
    await insertGeneratedTemplates(client, userId, program.id, week);
    await updateProgramSchedule(client, program.id, { splitLabel: week.splitLabel });
    await updateActiveNutritionTargets(client, userId, computeTargets(training, program.daysPerWeek, program.kcalOffset));
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return (await getActivePlan(userId))!;
}

export { pick as pickTrainingDetails };

/** The ±1 rule: regenerate the week and calorie target for a new day count. */
export async function setTrainingDays(userId: string, days: number): Promise<ActivePlan> {
  const program = await getActiveProgram(userId);
  const intake = await getIntake(userId);
  if (!program || !intake) throw notFound("No active plan.");
  const range = dayRange(program.onboardingDays);
  if (!Number.isInteger(days) || days < range.min || days > range.max) {
    throw badInput(`You can train ${range.min} to ${range.max} days a week, based on the ${program.onboardingDays} you chose.`, [{ field: "days", message: "Out of range." }]);
  }
  if (days !== program.daysPerWeek) {
    // Keep what the week-6 check-in decided (rotation, set changes, calorie correction).
    const week = buildWeek(intake.training, days, program.buildOptions);
    const targets = computeTargets(intake.training, days, program.kcalOffset);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await deactivateProgramTemplates(client, program.id);
      // Swaps point at weekdays of the old week, which no longer exists.
      await deleteScheduleSwaps(client, program.id);
      await insertGeneratedTemplates(client, userId, program.id, week);
      await updateProgramSchedule(client, program.id, { daysPerWeek: days, splitLabel: week.splitLabel });
      await updateActiveNutritionTargets(client, userId, targets);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    eventBus.publish({ type: "TrainingDaysChanged", userId, programId: program.id, from: program.daysPerWeek, to: days });
  }
  return (await getActivePlan(userId))!;
}

export async function setStartDate(userId: string, startIso: string): Promise<ActivePlan> {
  checkStartDate(startIso);
  const program = await getActiveProgram(userId);
  if (!program) throw notFound("No active plan.");
  await updateProgramSchedule(pool, program.id, { startDate: startIso, endDate: addDaysIso(startIso, CYCLE_DAYS - 1) });
  return (await getActivePlan(userId))!;
}

/**
 * Swap the sessions on two training days for one week. Limits: both days in
 * the current week, inside the cycle, not in the past, not already logged,
 * and whatever swapIssue() rules out (rest days, the weekly cap, 48h recovery).
 */
export async function swapSessionDays(userId: string, dateA: string, dateB: string): Promise<ActivePlan> {
  assertIsoDate(dateA, "dateA");
  assertIsoDate(dateB, "dateB");
  const program = await getActiveProgram(userId);
  if (!program) throw notFound("No active plan.");
  const weekStart = mondayOf(dateA);
  if (mondayOf(dateB) !== weekStart) throw badInput("Both days need to be in the same week.");
  // Server "today" is UTC; allow a day either side for the user's time zone.
  const t = todayIso();
  if (weekStart > mondayOf(addDaysIso(t, 1)) || weekStart < mondayOf(addDaysIso(t, -1))) throw badInput("You can only rearrange this week.");
  for (const d of [dateA, dateB]) {
    if (d < addDaysIso(t, -1)) throw badInput("That day has already passed.");
    if (d < program.startDate || d > program.endDate) throw badInput("Both days need to be inside your current cycle.");
  }

  const sessions = await listActiveSessions(program.id);
  const plan = weekTypes(sessions);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockProgram(client, program.id);
    const swaps = (await listScheduleSwaps(program.id, weekStart, client)).map((s): DaySwap => [s.dayA, s.dayB]);
    const a = weekdayOf(dateA), b = weekdayOf(dateB);
    const issue = swapIssue(plan, swaps, a, b);
    if (issue) throw badInput(issue);
    const order = swappedOrder(swaps);
    for (const [d, iso] of [[a, dateA], [b, dateB]] as const) {
      const s = sessions.find((x) => x.weekday === order[d]);
      if (s && (await templateLoggedNear(userId, s.templateId, iso, client))) throw badInput(`You've already logged ${s.name}, so it stays where it is.`);
    }
    await insertScheduleSwap(client, program.id, { weekStart, dayA: a, dayB: b });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return (await getActivePlan(userId))!;
}

/** Put a week back to the plan. Refused once a moved day is behind you or logged, so history stays true. */
export async function resetWeekSchedule(userId: string, date: string): Promise<ActivePlan> {
  assertIsoDate(date, "date");
  const program = await getActiveProgram(userId);
  if (!program) throw notFound("No active plan.");
  const weekStart = mondayOf(date);
  const swaps = await listScheduleSwaps(program.id, weekStart);
  if (swaps.length) {
    const sessions = await listActiveSessions(program.id);
    const order = swappedOrder(swaps.map((s): DaySwap => [s.dayA, s.dayB]));
    const t = todayIso();
    for (let d = 0; d < 7; d++) {
      if (order[d] === d) continue;
      const iso = addDaysIso(weekStart, d);
      const s = sessions.find((x) => x.weekday === order[d]);
      if (iso < addDaysIso(t, -1) || (s && (await templateLoggedNear(userId, s.templateId, iso)))) {
        throw badInput("Part of this week's changes is already behind you, so the week can't be reset.");
      }
    }
    await deleteScheduleSwaps(pool, program.id, weekStart);
  }
  return (await getActivePlan(userId))!;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export async function setWorkoutReminder(userId: string, time: string | null): Promise<ActivePlan> {
  if (time !== null && !TIME.test(time)) throw badInput("Use a 24-hour time like 17:30.");
  await setReminderTime(userId, time);
  const plan = await getActivePlan(userId);
  if (!plan) throw notFound("No active plan.");
  return plan;
}
