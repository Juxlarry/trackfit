import { eventBus } from "../../shared/events/bus.js";
import {
  insertWeightEntry,
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
