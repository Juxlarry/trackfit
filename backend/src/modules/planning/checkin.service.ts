import { pool } from "../../shared/db/pool.js";
import { eventBus } from "../../shared/events/bus.js";
import { assertIsoDate, badInput, notFound } from "../../shared/errors.js";
import {
  CHECKIN_OPENS_DAY, addDaysIso, checkinOpen, cycleResults, dayRange, daysBetween, planNextCycle, sessionOnDate, targetWeightIssue,
  type CheckinAnswers, type CycleResults, type NextCycle,
} from "./engine/index.js";
import { eatingFromLog, type EatingLog } from "./engine/foods.js";
import { archiveActiveNutritionPlan, getActiveNutritionPlan, insertNutritionPlan } from "../nutrition/nutrition.repository.js";
import { eatenKcalByDay } from "../nutrition/nutrition.service.js";
import {
  archiveActiveProgram, cycleLogs, getActiveProgram, getIntake, insertCheckin, insertGeneratedTemplates, insertProgram,
  listActiveSessions, listScheduleSwaps, updateIntakeForCycle,
} from "./planning.repository.js";
import { CYCLE_DAYS, getActivePlan, type ActivePlan } from "./planning.service.js";

/**
 * Week-6 check-in (rules: engine/checkin.ts). Opens on day 40 of a cycle;
 * until it's done, cycle 1 keeps running. `today` is the caller's local date.
 */
export interface CheckinStatus {
  open: boolean;
  opensOn: string;
  cycleNumber: number;
  dayRange: { min: number; max: number };
  currentDays: number;
  currentKcal: number;
  goal: string;
  targetWeightKg: number | null;
  results: CycleResults;
  /** From the Fuel tab's logs; pre-answers "How did the eating plan go?". */
  eatingLog: EatingLog;
}

async function load(userId: string, today: string) {
  assertIsoDate(today, "today");
  const program = await getActiveProgram(userId);
  if (!program) throw notFound("No active plan.");
  const [intake, nplan, sessions, swaps, logs] = await Promise.all([
    getIntake(userId), getActiveNutritionPlan(userId), listActiveSessions(program.id), listScheduleSwaps(program.id),
    cycleLogs(userId, addDaysIso(program.startDate, -3)),
  ]);
  if (!intake || !nplan) throw notFound("Plan data is incomplete. Please redo onboarding.");
  const plannedDates = Array.from({ length: CYCLE_DAYS }, (_, k) => addDaysIso(program.startDate, k))
    .filter((d) => sessionOnDate(sessions, swaps, d));
  const results = cycleResults(
    { training: intake.training, startDate: program.startDate, endDate: program.endDate, today, plannedDates, ...logs },
    program.daysPerWeek, program.onboardingDays,
  );
  return { program, intake, nplan, logs, results };
}

export async function getCheckin(userId: string, today: string): Promise<CheckinStatus> {
  const { program, intake, nplan, results } = await load(userId, today);
  const last = today < program.endDate ? today : program.endDate;
  const daily = last >= program.startDate ? await eatenKcalByDay(userId, program.startDate, last) : [];
  return {
    eatingLog: eatingFromLog(daily, nplan.dailyKcal, daysBetween(program.startDate, last) + 1),
    open: checkinOpen(program.startDate, today), opensOn: addDaysIso(program.startDate, CHECKIN_OPENS_DAY),
    cycleNumber: program.cycleNumber, dayRange: dayRange(program.onboardingDays), currentDays: program.daysPerWeek,
    currentKcal: nplan.dailyKcal, goal: intake.training.goal, targetWeightKg: intake.training.targetWeightKg, results,
  };
}

async function next(userId: string, today: string, answers: CheckinAnswers) {
  const ctx = await load(userId, today);
  const { program, intake, nplan, logs, results } = ctx;
  if (!checkinOpen(program.startDate, today)) throw badInput(`Your check-in opens on day ${CHECKIN_OPENS_DAY} of the cycle.`);
  if (results.needsWeighIn) throw badInput("Log today's weigh-in first, so cycle 2 starts from your real weight.");
  const range = dayRange(program.onboardingDays);
  if (!Number.isInteger(answers.days) || answers.days < range.min || answers.days > range.max) {
    throw badInput(`Pick ${range.min} to ${range.max} training days.`, [{ field: "days", message: "Out of range." }]);
  }
  if (answers.goalChoice === "NEW_TARGET") {
    const issue = targetWeightIssue({ ...intake.training, weightKg: results.endKg ?? intake.training.weightKg, targetWeightKg: answers.newTargetKg ?? null });
    if (issue) throw badInput(issue, [{ field: "newTargetKg", message: issue }]);
  }
  const plan = planNextCycle({
    training: intake.training, results, answers, onboardingDays: program.onboardingDays, currentDays: program.daysPerWeek,
    cycleNumber: program.cycleNumber, currentKcal: nplan.dailyKcal, prevKcalOffset: program.kcalOffset,
    sets: logs.sets, startDate: program.startDate, today,
  });
  return { ...ctx, plan };
}

export async function previewNextCycle(userId: string, today: string, answers: CheckinAnswers): Promise<NextCycle> {
  return (await next(userId, today, answers)).plan;
}

export async function completeCheckin(userId: string, today: string, answers: CheckinAnswers, startDate: string): Promise<ActivePlan> {
  assertIsoDate(startDate, "startDate");
  if (startDate < addDaysIso(today, -1) || startDate > addDaysIso(today, 14)) {
    throw badInput("Pick a start date between today and 2 weeks from now.", [{ field: "startDate", message: "Out of range." }]);
  }
  const { program, results, plan } = await next(userId, today, answers);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await updateIntakeForCycle(client, userId, plan.training);
    await archiveActiveProgram(client, userId);
    await archiveActiveNutritionPlan(client, userId);
    const created = await insertProgram(client, {
      userId, cycleNumber: program.cycleNumber + 1, startDate, endDate: addDaysIso(startDate, CYCLE_DAYS - 1),
      onboardingDays: plan.days, daysPerWeek: plan.days, splitLabel: plan.week.splitLabel,
      buildOptions: plan.buildOptions, startLoads: plan.loads, kcalOffset: plan.kcalOffset,
    });
    await insertGeneratedTemplates(client, userId, created.id, plan.week);
    await insertNutritionPlan(client, userId, created.cycleNumber, plan.targets);
    await insertCheckin(client, { userId, programId: program.id, nextProgramId: created.id, answers, results, changes: plan.changes });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    // Two taps on "Start cycle 2": the second finds the check-in already saved.
    if ((err as { code?: string }).code === "23505") throw badInput("This check-in is already done.");
    throw err;
  } finally {
    client.release();
  }
  const active = (await getActivePlan(userId))!;
  eventBus.publish({ type: "PlanGenerated", userId, programId: active.programId, cycleNumber: active.cycleNumber, daysPerWeek: active.daysPerWeek });
  return active;
}
