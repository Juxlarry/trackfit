import { pool } from "../../shared/db/pool.js";
import type { PoolClient } from "pg";

// ── Weight ──────────────────────────────────────────────────────────────

export interface WeightEntryRow {
  id: string;
  userId: string;
  recordedAt: Date;
  weightKg: number;
  bodyFatPercent: number | null;
}

function mapWeightEntry(row: any): WeightEntryRow {
  return {
    id: row.id,
    userId: row.user_id,
    recordedAt: row.recorded_at,
    weightKg: Number(row.weight_kg),
    bodyFatPercent: row.body_fat_percent === null ? null : Number(row.body_fat_percent),
  };
}

export async function insertWeightEntry(params: {
  userId: string;
  weightKg: number;
  bodyFatPercent?: number | null;
  recordedAt?: Date;
}): Promise<WeightEntryRow> {
  const { rows } = await pool.query(
    `INSERT INTO tracking.weight_entries (user_id, weight_kg, body_fat_percent, recorded_at)
     VALUES ($1, $2, $3, COALESCE($4, now()))
     RETURNING *`,
    [params.userId, params.weightKg, params.bodyFatPercent ?? null, params.recordedAt ?? null],
  );
  return mapWeightEntry(rows[0]);
}

export async function listWeightHistory(
  userId: string,
  limit: number,
): Promise<WeightEntryRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tracking.weight_entries WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map(mapWeightEntry);
}

// ── Exercises ───────────────────────────────────────────────────────────

export type MuscleGroup =
  | "CHEST"
  | "BACK"
  | "SHOULDERS"
  | "BICEPS"
  | "TRICEPS"
  | "LEGS"
  | "GLUTES"
  | "CORE"
  | "FULL_BODY"
  | "CARDIO"
  | "OTHER";

export interface ExerciseRow {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: string | null;
  isCustom: boolean;
  ownerId: string | null;
}

function mapExercise(row: any): ExerciseRow {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group,
    equipment: row.equipment,
    isCustom: row.is_custom,
    ownerId: row.owner_id,
  };
}

export async function searchExercises(search: string | null | undefined): Promise<ExerciseRow[]> {
  if (search && search.trim().length > 0) {
    const { rows } = await pool.query(
      `SELECT * FROM tracking.exercises WHERE name ILIKE $1 ORDER BY name LIMIT 50`,
      [`%${search.trim()}%`],
    );
    return rows.map(mapExercise);
  }
  const { rows } = await pool.query(`SELECT * FROM tracking.exercises ORDER BY name LIMIT 200`);
  return rows.map(mapExercise);
}

export async function findExerciseById(id: string): Promise<ExerciseRow | null> {
  const { rows } = await pool.query(`SELECT * FROM tracking.exercises WHERE id = $1`, [id]);
  return rows[0] ? mapExercise(rows[0]) : null;
}

// ── Workout templates ───────────────────────────────────────────────────

export interface WorkoutTemplateRow {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
}

export interface WorkoutTemplateExerciseRow {
  id: string;
  templateId: string;
  exerciseId: string;
  order: number;
  targetSets: number;
  targetReps: number;
}

function mapTemplate(row: any): WorkoutTemplateRow {
  return { id: row.id, userId: row.user_id, name: row.name, createdAt: row.created_at };
}

function mapTemplateExercise(row: any): WorkoutTemplateExerciseRow {
  return {
    id: row.id,
    templateId: row.template_id,
    exerciseId: row.exercise_id,
    order: row.order,
    targetSets: row.target_sets,
    targetReps: row.target_reps,
  };
}

export async function listWorkoutTemplates(userId: string): Promise<WorkoutTemplateRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tracking.workout_templates WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map(mapTemplate);
}

export async function listTemplateExercises(
  templateId: string,
): Promise<WorkoutTemplateExerciseRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tracking.workout_template_exercises WHERE template_id = $1 ORDER BY "order"`,
    [templateId],
  );
  return rows.map(mapTemplateExercise);
}

export async function createWorkoutTemplate(
  userId: string,
  name: string,
  exercises: { exerciseId: string; order: number; targetSets: number; targetReps: number }[],
): Promise<WorkoutTemplateRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO tracking.workout_templates (user_id, name) VALUES ($1, $2) RETURNING *`,
      [userId, name],
    );
    const template = mapTemplate(rows[0]);
    for (const ex of exercises) {
      await client.query(
        `INSERT INTO tracking.workout_template_exercises
           (template_id, exercise_id, "order", target_sets, target_reps)
         VALUES ($1, $2, $3, $4, $5)`,
        [template.id, ex.exerciseId, ex.order, ex.targetSets, ex.targetReps],
      );
    }
    await client.query("COMMIT");
    return template;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Workout sessions, set logs, milestones ─────────────────────────────

export interface WorkoutSessionRow {
  id: string;
  userId: string;
  templateId: string | null;
  startedAt: Date;
  durationMinutes: number | null;
  notes: string | null;
  shareToClubs: boolean;
}

export interface SetLogRow {
  id: string;
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  reps: number;
  weightKg: number;
  rpe: number | null;
}

export type MilestoneType = "HEAVIEST_SET" | "ESTIMATED_1RM" | "MOST_REPS_AT_WEIGHT";

export interface MilestoneRow {
  id: string;
  sessionId: string;
  exerciseId: string;
  type: MilestoneType;
  value: number;
  achievedAt: Date;
}

function mapSession(row: any): WorkoutSessionRow {
  return {
    id: row.id,
    userId: row.user_id,
    templateId: row.template_id,
    startedAt: row.started_at,
    durationMinutes: row.duration_minutes,
    notes: row.notes,
    shareToClubs: row.share_to_clubs,
  };
}

function mapSetLog(row: any): SetLogRow {
  return {
    id: row.id,
    sessionId: row.session_id,
    exerciseId: row.exercise_id,
    setNumber: row.set_number,
    reps: row.reps,
    weightKg: Number(row.weight_kg),
    rpe: row.rpe === null ? null : Number(row.rpe),
  };
}

function mapMilestone(row: any): MilestoneRow {
  return {
    id: row.id,
    sessionId: row.session_id,
    exerciseId: row.exercise_id,
    type: row.type,
    value: Number(row.value),
    achievedAt: row.achieved_at,
  };
}

export async function listWorkoutHistory(
  userId: string,
  limit: number,
): Promise<WorkoutSessionRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tracking.workout_sessions WHERE user_id = $1 ORDER BY started_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map(mapSession);
}

/** Sessions whose start falls on [fromIso, toIso] (inclusive, UTC dates). */
export async function listWorkoutSessionsBetween(userId: string, fromIso: string, toIso: string): Promise<WorkoutSessionRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tracking.workout_sessions
     WHERE user_id = $1 AND started_at >= $2::date AND started_at < ($3::date + 1)
     ORDER BY started_at`,
    [userId, fromIso, toIso],
  );
  return rows.map(mapSession);
}

export async function findTemplateName(templateId: string): Promise<string | null> {
  const { rows } = await pool.query(`SELECT name FROM tracking.workout_templates WHERE id = $1`, [templateId]);
  return rows[0]?.name ?? null;
}

export async function templateBelongsToUser(templateId: string, userId: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM tracking.workout_templates WHERE id = $1 AND user_id = $2`, [templateId, userId]);
  return rows.length > 0;
}

// ── Activities (cardio, sport, warm-up, mobility, abs) ─────────────────────

export interface ActivityLogRow {
  id: string;
  userId: string;
  performedOn: string;
  kind: string;
  activityType: string;
  durationMinutes: number;
  distanceKm: number | null;
  kcal: number | null;
  kcalEstimated: boolean;
  avgHeartRate: number | null;
  effort: string | null;
  createdAt: Date;
}

function mapActivity(r: any): ActivityLogRow {
  return {
    id: r.id, userId: r.user_id, performedOn: r.performed_on, kind: r.kind, activityType: r.activity_type,
    durationMinutes: r.duration_minutes, distanceKm: r.distance_km == null ? null : Number(r.distance_km),
    kcal: r.kcal, kcalEstimated: r.kcal_estimated, avgHeartRate: r.avg_heart_rate, effort: r.effort, createdAt: r.created_at,
  };
}

const ACTIVITY_COLUMNS = `id, user_id, to_char(performed_on,'YYYY-MM-DD') AS performed_on, kind, activity_type, duration_minutes,
  distance_km, kcal, kcal_estimated, avg_heart_rate, effort, created_at`;

export async function insertActivityLog(a: Omit<ActivityLogRow, "id" | "createdAt">): Promise<ActivityLogRow> {
  const { rows } = await pool.query(
    `INSERT INTO tracking.activity_logs (user_id, performed_on, kind, activity_type, duration_minutes, distance_km, kcal, kcal_estimated, avg_heart_rate, effort)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${ACTIVITY_COLUMNS}`,
    [a.userId, a.performedOn, a.kind, a.activityType, a.durationMinutes, a.distanceKm, a.kcal, a.kcalEstimated, a.avgHeartRate, a.effort],
  );
  return mapActivity(rows[0]);
}

export async function listActivityLogs(userId: string, fromIso: string, toIso: string): Promise<ActivityLogRow[]> {
  const { rows } = await pool.query(
    `SELECT ${ACTIVITY_COLUMNS} FROM tracking.activity_logs WHERE user_id = $1 AND performed_on BETWEEN $2 AND $3 ORDER BY performed_on, created_at`,
    [userId, fromIso, toIso],
  );
  return rows.map(mapActivity);
}

export async function deleteActivityLog(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM tracking.activity_logs WHERE id = $1 AND user_id = $2`, [id, userId]);
  return (rowCount ?? 0) > 0;
}

export async function listSetLogsForSession(sessionId: string): Promise<SetLogRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tracking.set_logs WHERE session_id = $1 ORDER BY set_number`,
    [sessionId],
  );
  return rows.map(mapSetLog);
}

export async function listMilestonesForSession(sessionId: string): Promise<MilestoneRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tracking.milestones WHERE session_id = $1 ORDER BY achieved_at`,
    [sessionId],
  );
  return rows.map(mapMilestone);
}

/** Best-ever heaviest weight and estimated-1RM for a user+exercise, prior to a given session. */
export async function getExerciseBests(
  client: PoolClient,
  userId: string,
  exerciseId: string,
): Promise<{ maxWeightKg: number; maxEstimated1Rm: number; maxRepsByWeight: Map<number, number> }> {
  const { rows } = await client.query(
    `SELECT sl.weight_kg, sl.reps
     FROM tracking.set_logs sl
     JOIN tracking.workout_sessions ws ON ws.id = sl.session_id
     WHERE ws.user_id = $1 AND sl.exercise_id = $2`,
    [userId, exerciseId],
  );

  let maxWeightKg = 0;
  let maxEstimated1Rm = 0;
  const maxRepsByWeight = new Map<number, number>();

  for (const row of rows) {
    const weightKg = Number(row.weight_kg);
    const reps = Number(row.reps);
    const estimated1Rm = weightKg * (1 + reps / 30); // Epley formula
    if (weightKg > maxWeightKg) maxWeightKg = weightKg;
    if (estimated1Rm > maxEstimated1Rm) maxEstimated1Rm = estimated1Rm;
    const prevRepsAtWeight = maxRepsByWeight.get(weightKg) ?? 0;
    if (reps > prevRepsAtWeight) maxRepsByWeight.set(weightKg, reps);
  }

  return { maxWeightKg, maxEstimated1Rm, maxRepsByWeight };
}

export interface LogWorkoutSessionInput {
  userId: string;
  templateId?: string | null;
  durationMinutes?: number | null;
  notes?: string | null;
  shareToClubs?: boolean;
  /** MVP 2: lets "Log it" record a missed planned session on its own day. Defaults to now. */
  startedAt?: Date | null;
  sets: { exerciseId: string; setNumber: number; reps: number; weightKg: number; rpe?: number | null }[];
}

export interface LogWorkoutSessionResult {
  session: WorkoutSessionRow;
  sets: SetLogRow[];
  milestones: MilestoneRow[];
}

/**
 * Logs a full workout session (session + all sets) and detects PRs in one
 * transaction, per spec §4.2's "personal records automatically detected"
 * requirement and architecture.md §9's "milestone detection runs right
 * after a workout is logged" note.
 */
export async function logWorkoutSessionWithMilestones(
  input: LogWorkoutSessionInput,
): Promise<LogWorkoutSessionResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: sessionRows } = await client.query(
      `INSERT INTO tracking.workout_sessions (user_id, template_id, duration_minutes, notes, share_to_clubs, started_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()))
       RETURNING *`,
      [
        input.userId,
        input.templateId ?? null,
        input.durationMinutes ?? null,
        input.notes ?? null,
        input.shareToClubs ?? false,
        input.startedAt ?? null,
      ],
    );
    const session = mapSession(sessionRows[0]);

    const insertedSets: SetLogRow[] = [];
    // Cache per-exercise "bests so far" computed BEFORE this session's sets are inserted,
    // so a new PR is judged against history, not against sets from this same session.
    const bestsCache = new Map<
      string,
      { maxWeightKg: number; maxEstimated1Rm: number; maxRepsByWeight: Map<number, number> }
    >();

    for (const set of input.sets) {
      if (!bestsCache.has(set.exerciseId)) {
        bestsCache.set(
          set.exerciseId,
          await getExerciseBests(client, input.userId, set.exerciseId),
        );
      }

      const { rows: setRows } = await client.query(
        `INSERT INTO tracking.set_logs (session_id, exercise_id, set_number, reps, weight_kg, rpe)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [session.id, set.exerciseId, set.setNumber, set.reps, set.weightKg, set.rpe ?? null],
      );
      insertedSets.push(mapSetLog(setRows[0]));
    }

    const milestones: MilestoneRow[] = [];
    // Evaluate milestones per-exercise using the best within *this* session's sets too,
    // so logging two heavier sets of the same exercise in one session still only
    // records the single best milestone per type, not one per set.
    const bestInSessionByExercise = new Map<
      string,
      { maxWeightKg: number; maxEstimated1Rm: number; maxRepsByWeight: Map<number, number> }
    >();

    for (const set of insertedSets) {
      const prior = bestsCache.get(set.exerciseId)!;
      const sessionBest =
        bestInSessionByExercise.get(set.exerciseId) ??
        { maxWeightKg: 0, maxEstimated1Rm: 0, maxRepsByWeight: new Map<number, number>() };

      const estimated1Rm = set.weightKg * (1 + set.reps / 30);

      if (set.weightKg > prior.maxWeightKg && set.weightKg > sessionBest.maxWeightKg) {
        sessionBest.maxWeightKg = set.weightKg;
      }
      if (estimated1Rm > prior.maxEstimated1Rm && estimated1Rm > sessionBest.maxEstimated1Rm) {
        sessionBest.maxEstimated1Rm = estimated1Rm;
      }
      const priorRepsAtWeight = prior.maxRepsByWeight.get(set.weightKg) ?? 0;
      const sessionRepsAtWeight = sessionBest.maxRepsByWeight.get(set.weightKg) ?? 0;
      if (set.reps > priorRepsAtWeight && set.reps > sessionRepsAtWeight) {
        sessionBest.maxRepsByWeight.set(set.weightKg, set.reps);
      }

      bestInSessionByExercise.set(set.exerciseId, sessionBest);
    }

    for (const [exerciseId, best] of bestInSessionByExercise.entries()) {
      const prior = bestsCache.get(exerciseId)!;

      if (best.maxWeightKg > 0) {
        milestones.push(
          await insertMilestone(client, session.id, exerciseId, "HEAVIEST_SET", best.maxWeightKg),
        );
      }
      if (best.maxEstimated1Rm > 0) {
        milestones.push(
          await insertMilestone(
            client,
            session.id,
            exerciseId,
            "ESTIMATED_1RM",
            Math.round(best.maxEstimated1Rm * 10) / 10,
          ),
        );
      }
      for (const [weightKg, reps] of best.maxRepsByWeight.entries()) {
        void prior; // bests already folded into the sessionBest comparison above
        milestones.push(
          await insertMilestone(client, session.id, exerciseId, "MOST_REPS_AT_WEIGHT", reps, weightKg),
        );
      }
    }

    await client.query("COMMIT");
    return { session, sets: insertedSets, milestones };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function insertMilestone(
  client: PoolClient,
  sessionId: string,
  exerciseId: string,
  type: MilestoneType,
  value: number,
  _atWeightKg?: number,
): Promise<MilestoneRow> {
  const { rows } = await client.query(
    `INSERT INTO tracking.milestones (session_id, exercise_id, type, value)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [sessionId, exerciseId, type, value],
  );
  return mapMilestone(rows[0]);
}
