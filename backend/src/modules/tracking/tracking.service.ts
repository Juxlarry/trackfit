import { eventBus } from "../../shared/events/bus.js";
import { assertIsoDate, badInput } from "../../shared/errors.js";
import { ACTIVITY_TYPES, estimateActivityKcal, type Effort } from "../planning/engine/index.js";
import { getIntake } from "../planning/planning.repository.js";
import {
  insertActivityLog,
  insertWeightEntry,
  listWeightHistory,
  templateBelongsToUser,
  listWorkoutHistory,
  logWorkoutSessionWithMilestones,
  type LogWorkoutSessionInput,
} from "./tracking.repository.js";

export async function logWeight(params: {
  userId: string;
  weightKg: number;
  bodyFatPercent?: number | null;
  recordedAt?: Date;
}) {
  const entry = await insertWeightEntry(params);
  eventBus.publish({
    type: "WeightLogged",
    userId: params.userId,
    weightEntryId: entry.id,
    weightKg: entry.weightKg,
    recordedAt: entry.recordedAt.toISOString(),
  });
  return entry;
}

export async function logWorkoutSession(input: LogWorkoutSessionInput) {
  if (input.templateId && !(await templateBelongsToUser(input.templateId, input.userId))) {
    throw badInput("That workout isn't one of yours.");
  }
  if (input.startedAt && Number.isNaN(input.startedAt.getTime())) throw badInput("startedAt must be an ISO date-time.");
  if (input.startedAt && input.startedAt.getTime() > Date.now() + 36 * 3600_000) throw badInput("You can't log a workout in the future.");
  const result = await logWorkoutSessionWithMilestones(input);

  eventBus.publish({
    type: "WorkoutLogged",
    userId: input.userId,
    sessionId: result.session.id,
    durationMinutes: result.session.durationMinutes,
    shareToClubs: result.session.shareToClubs,
    milestoneIds: result.milestones.map((m) => m.id),
  });

  for (const milestone of result.milestones) {
    eventBus.publish({
      type: "MilestoneAchieved",
      userId: input.userId,
      sessionId: result.session.id,
      milestoneId: milestone.id,
      exerciseId: milestone.exerciseId,
      milestoneType: milestone.type,
      value: milestone.value,
    });
  }

  return result;
}

/** This week's sessions, for the dashboard's "N sessions this week" summary. */
export async function countSessionsThisWeek(userId: string): Promise<number> {
  const sessions = await listWorkoutHistory(userId, 50);
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  return sessions.filter((s) => s.startedAt >= startOfWeek).length;
}

export interface LogActivityInput {
  userId: string;
  performedOn: string;
  activityType: string;
  durationMinutes: number;
  distanceKm?: number | null;
  kcal?: number | null;
  avgHeartRate?: number | null;
  effort?: Effort | null;
}

/**
 * Logs cardio, sport, warm-ups, mobility and abs finishers (onboarding-flow.md
 * "Add an activity"). Calories from a watch win; otherwise they're estimated
 * from MET × body weight × time × effort and flagged as estimated.
 */
export async function logActivity(input: LogActivityInput) {
  assertIsoDate(input.performedOn, "performedOn");
  const type = ACTIVITY_TYPES[input.activityType];
  if (!type) throw badInput(`Unknown activity type "${input.activityType}".`);
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 600) throw badInput("Duration must be 1 to 600 minutes.");
  if (input.distanceKm != null && (input.distanceKm < 0 || input.distanceKm > 300)) throw badInput("Distance looks off. Use kilometres.");
  if (input.distanceKm != null && !type.distance) throw badInput(`${type.label} doesn't take a distance.`);
  if (input.avgHeartRate != null && (input.avgHeartRate < 30 || input.avgHeartRate > 230)) throw badInput("Heart rate must be between 30 and 230 bpm.");
  if (input.kcal != null && (input.kcal < 0 || input.kcal > 5000)) throw badInput("Calories must be between 0 and 5000.");

  const [latest] = await listWeightHistory(input.userId, 1);
  const weightKg = latest?.weightKg ?? (await getIntake(input.userId))?.training.weightKg ?? 70;
  const estimated = input.kcal == null;
  const row = await insertActivityLog({
    userId: input.userId, performedOn: input.performedOn, kind: type.kind, activityType: input.activityType,
    durationMinutes: input.durationMinutes, distanceKm: input.distanceKm ?? null,
    kcal: estimated ? estimateActivityKcal(input.activityType, input.durationMinutes, weightKg, input.effort ?? "MODERATE") : input.kcal!,
    kcalEstimated: estimated, avgHeartRate: input.avgHeartRate ?? null, effort: input.effort ?? null,
  });
  eventBus.publish({ type: "ActivityLogged", userId: input.userId, activityLogId: row.id, kind: row.kind, durationMinutes: row.durationMinutes, kcal: row.kcal ?? 0 });
  return row;
}
