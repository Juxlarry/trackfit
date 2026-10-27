import { pool } from "../../shared/db/pool.js";
import { getMailer } from "../../shared/email/mailer.js";
import { eventBus } from "../../shared/events/bus.js";
import { badInput, notFound, assertIsoDate } from "../../shared/errors.js";
import type { UserRow } from "../identity/identity.repository.js";
import {
  addDaysIso, adaptations, buildWeek, computeProjection, computeTargets, dayRange, generatePlan, isScreenedOut,
  restSuggestion, suggestLoadKg, toIsoDate, validateIntake,
  type DietInput, type GeneratedPlan, type HealthScreening, type TrainingInput,
} from "./engine/index.js";
import {
  archiveActiveProgram, deactivateProgramTemplates, getActiveProgram, getIntake, insertGeneratedTemplates, insertProgram,
  listActiveSessions, markOnboarded, setReminderTime, updateProgramSchedule, upsertHealthScreening, upsertIntake,
  type IntakeExtras, type StoredSession,
} from "./planning.repository.js";
import {
  archiveActiveNutritionPlan, getActiveNutritionPlan, getDietaryProfile, insertNutritionPlan,
  updateActiveNutritionTargets, upsertDietaryProfile, type DietExtras,
} from "../nutrition/nutrition.repository.js";
import { welcomeEmail } from "./welcome-email.js";

const CYCLE_DAYS = 42; // 6-week cycle (spec §4.8.7, §9.4)
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
  const screenedOut = isScreenedOut(input.screening);
  if (screenedOut) {
    await upsertHealthScreening(pool, user.id, input.screening, true);
    return {
      screenedOut: true, plan: null,
      message: "Based on your answers, please speak with a doctor or qualified trainer before starting a generated program. You can still use TrackFit's logging tools.",
    };
  }
  const issues = validateIntake(input.training, input.diet);
  if (issues.length) throw badInput("Some answers need another look.", issues);
  checkStartDate(input.startDate);

  const plan = generatePlan(input.training, input.diet, input.startDate);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await upsertHealthScreening(client, user.id, input.screening, false);
    await upsertIntake(client, user.id, input.training, input.trainingExtras);
    await upsertDietaryProfile(client, user.id, input.diet, input.dietExtras);
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
  sessions: (StoredSession & { exercises: (StoredSession["exercises"][number] & { suggestedLoadKg: number | null })[] })[];
  restDays: { weekday: number; suggestion: string }[];
  adaptations: ReturnType<typeof adaptations>;
  profile: TrainingInput & { reminderTime: string | null; diet: DietInput };
}

export async function getActivePlan(userId: string): Promise<ActivePlan | null> {
  const program = await getActiveProgram(userId);
  if (!program) return null;
  const [intake, diet, nplan, sessions] = await Promise.all([
    getIntake(userId), getDietaryProfile(userId), getActiveNutritionPlan(userId), listActiveSessions(program.id),
  ]);
  if (!intake || !diet || !nplan) throw notFound("Plan data is incomplete. Please redo onboarding.");
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
    sessions: sessions.map((s) => ({ ...s, exercises: s.exercises.map((e) => ({ ...e, suggestedLoadKg: suggestLoadKg(e.name, t) })) })),
    restDays,
    adaptations: adaptations(t, diet, week),
    profile: { ...t, reminderTime: intake.reminderTime, diet },
  };
}

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
    const week = buildWeek(intake.training, days);
    const targets = computeTargets(intake.training, days);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await deactivateProgramTemplates(client, program.id);
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

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export async function setWorkoutReminder(userId: string, time: string | null): Promise<ActivePlan> {
  if (time !== null && !TIME.test(time)) throw badInput("Use a 24-hour time like 17:30.");
  await setReminderTime(userId, time);
  const plan = await getActivePlan(userId);
  if (!plan) throw notFound("No active plan.");
  return plan;
}
