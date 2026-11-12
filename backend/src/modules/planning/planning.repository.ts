import type { PoolClient } from "pg";
import { pool } from "../../shared/db/pool.js";
import type {
  BuildOptions, Ease, ExerciseSessionLog, FuelLifestyle, GoalType, HealthScreening, IntakeSection, TrainingDetails, LoggedSet, PlannedSession, SessionType, TrainingInput, WarmupItem, WeekPlan,
} from "./engine/index.js";
import { exerciseMeta, patternOf } from "./engine/index.js";

type Db = PoolClient | typeof pool;

// ── Identity-owned rows (screening + intake) ──────────────────────────────

export async function upsertHealthScreening(db: Db, userId: string, s: HealthScreening, screenedOut: boolean) {
  await db.query(
    `INSERT INTO identity.health_screenings
       (user_id, heart_condition, high_blood_pressure, diabetes, pregnant, recent_surgery_or_injury, chest_pain_or_dizziness, under_18, screened_out, screened_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     ON CONFLICT (user_id) DO UPDATE SET
       heart_condition = EXCLUDED.heart_condition, high_blood_pressure = EXCLUDED.high_blood_pressure, diabetes = EXCLUDED.diabetes,
       pregnant = EXCLUDED.pregnant, recent_surgery_or_injury = EXCLUDED.recent_surgery_or_injury,
       chest_pain_or_dizziness = EXCLUDED.chest_pain_or_dizziness, under_18 = EXCLUDED.under_18,
       screened_out = EXCLUDED.screened_out, screened_at = now()`,
    [userId, s.heartCondition, s.highBloodPressure, s.diabetes, s.pregnant, s.recentSurgeryOrInjury, s.chestPainOrDizziness, s.under18, screenedOut],
  );
}

export interface IntakeExtras {
  motivations: string[];
  injuryNote: string | null;
  cardioFrequency: string | null;
  energy: string | null;
  mindset: Record<string, unknown>;
  /** Quick start: which path, and the blocks still to ask. Full quiz: FULL and none. */
  onboardingPath?: "FULL" | "QUICK";
  pendingSections?: IntakeSection[];
}

export async function upsertIntake(db: Db, userId: string, i: TrainingInput, x: IntakeExtras) {
  await db.query(
    `INSERT INTO identity.intake_profiles (
       user_id, sex, age, height_cm, weight_kg, body_fat_level, goal_type, target_weight_kg, goal_pace, motivations,
       experience, lift_comfort, equipment, available_days, days_per_week, session_minutes, split_preference, full_body_day,
       priority_muscles, injuries, injury_note, cardio_frequency, cardio_likes, activity_level, sleep_hours, sleep_quality,
       train_time, busyness, warmup, energy, blockers, mindset, low_priority_muscles, onboarding_path, pending_sections, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35, now())
     ON CONFLICT (user_id) DO UPDATE SET
       sex = EXCLUDED.sex, age = EXCLUDED.age, height_cm = EXCLUDED.height_cm, weight_kg = EXCLUDED.weight_kg,
       body_fat_level = EXCLUDED.body_fat_level, goal_type = EXCLUDED.goal_type, target_weight_kg = EXCLUDED.target_weight_kg,
       goal_pace = EXCLUDED.goal_pace, motivations = EXCLUDED.motivations, experience = EXCLUDED.experience,
       lift_comfort = EXCLUDED.lift_comfort, equipment = EXCLUDED.equipment, available_days = EXCLUDED.available_days,
       days_per_week = EXCLUDED.days_per_week, session_minutes = EXCLUDED.session_minutes, split_preference = EXCLUDED.split_preference,
       full_body_day = EXCLUDED.full_body_day, priority_muscles = EXCLUDED.priority_muscles, injuries = EXCLUDED.injuries,
       injury_note = EXCLUDED.injury_note, cardio_frequency = EXCLUDED.cardio_frequency, cardio_likes = EXCLUDED.cardio_likes,
       activity_level = EXCLUDED.activity_level, sleep_hours = EXCLUDED.sleep_hours, sleep_quality = EXCLUDED.sleep_quality,
       train_time = EXCLUDED.train_time, busyness = EXCLUDED.busyness, warmup = EXCLUDED.warmup, energy = EXCLUDED.energy,
       blockers = EXCLUDED.blockers, mindset = EXCLUDED.mindset, low_priority_muscles = EXCLUDED.low_priority_muscles,
       onboarding_path = EXCLUDED.onboarding_path, pending_sections = EXCLUDED.pending_sections, updated_at = now()`,
    [
      userId, i.sex, i.age, i.heightCm, i.weightKg, i.bodyFatLevel, i.goal, i.targetWeightKg, i.pace, x.motivations,
      i.experience, i.liftComfort, i.equipment, i.availableDays, i.daysPerWeek, i.sessionMinutes, i.split, i.fullBodyDay,
      i.priorityMuscles, i.injuries, x.injuryNote, x.cardioFrequency, i.cardioLikes, i.activityLevel, i.sleepHours, i.sleepQuality,
      i.trainTime, i.busyness, i.warmup, x.energy, i.blockers, JSON.stringify(x.mindset), i.lowPriorityMuscles,
      x.onboardingPath ?? "FULL", x.pendingSections ?? [],
    ],
  );
}

export interface IntakeRow {
  training: TrainingInput;
  reminderTime: string | null;
  motivations: string[];
  onboardingPath: "FULL" | "QUICK";
  pendingSections: IntakeSection[];
}

export async function getIntake(userId: string, db: Db = pool): Promise<IntakeRow | null> {
  const { rows } = await db.query(`SELECT * FROM identity.intake_profiles WHERE user_id = $1`, [userId]);
  const r = rows[0];
  if (!r) return null;
  return {
    training: {
      sex: r.sex, age: r.age, heightCm: Number(r.height_cm), weightKg: Number(r.weight_kg), bodyFatLevel: r.body_fat_level,
      goal: r.goal_type, targetWeightKg: r.target_weight_kg == null ? null : Number(r.target_weight_kg), pace: r.goal_pace,
      experience: r.experience, liftComfort: r.lift_comfort, equipment: r.equipment, availableDays: r.available_days,
      daysPerWeek: r.days_per_week, sessionMinutes: r.session_minutes, split: r.split_preference, fullBodyDay: r.full_body_day,
      priorityMuscles: r.priority_muscles, lowPriorityMuscles: r.low_priority_muscles ?? [], injuries: r.injuries, activityLevel: r.activity_level, sleepHours: Number(r.sleep_hours),
      sleepQuality: r.sleep_quality, trainTime: r.train_time, busyness: r.busyness, warmup: r.warmup, cardioLikes: r.cardio_likes,
      blockers: r.blockers,
    },
    reminderTime: r.reminder_time,
    motivations: r.motivations,
    onboardingPath: r.onboarding_path ?? "FULL",
    pendingSections: r.pending_sections ?? [],
  };
}

/** "Fine-tune your training" answers. Clears TRAINING_DETAILS from the blocks still owed. */
export async function saveTrainingDetails(db: Db, userId: string, d: TrainingDetails) {
  await db.query(
    `UPDATE identity.intake_profiles SET lift_comfort = $2, split_preference = $3, full_body_day = $4, priority_muscles = $5,
            low_priority_muscles = $6, cardio_likes = $7, warmup = $8, sleep_hours = $9, sleep_quality = $10,
            pending_sections = array_remove(pending_sections, 'TRAINING_DETAILS'), updated_at = now()
      WHERE user_id = $1`,
    [userId, d.liftComfort, d.split, d.fullBodyDay, d.priorityMuscles, d.lowPriorityMuscles, d.cardioLikes, d.warmup, d.sleepHours, d.sleepQuality],
  );
}

/** The lifestyle answers asked with "Set up Fuel". Clears FUEL from the blocks still owed. */
export async function saveFuelLifestyle(db: Db, userId: string, l: FuelLifestyle) {
  await db.query(
    `UPDATE identity.intake_profiles SET activity_level = $2, train_time = $3, busyness = $4,
            pending_sections = array_remove(pending_sections, 'FUEL'), updated_at = now()
      WHERE user_id = $1`,
    [userId, l.activityLevel, l.trainTime, l.busyness],
  );
}

export async function setReminderTime(userId: string, time: string | null) {
  await pool.query(`UPDATE identity.intake_profiles SET reminder_time = $2, updated_at = now() WHERE user_id = $1`, [userId, time]);
}

/** True when another account already owns this email (users.email is unique). */
export async function emailTakenByOther(userId: string, email: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM identity.users WHERE lower(email) = lower($1) AND id <> $2 LIMIT 1`, [email, userId]);
  return rows.length > 0;
}

export async function markOnboarded(db: Db, userId: string, displayName: string | null, email: string | null) {
  await db.query(
    `UPDATE identity.users
     SET onboarded_at = COALESCE(onboarded_at, now()),
         display_name = COALESCE(NULLIF($2, ''), display_name),
         email = COALESCE(email, $3),
         updated_at = now()
     WHERE id = $1`,
    [userId, displayName, email],
  );
}

// ── Tracking-owned rows (generated programs reuse MVP 1 templates) ─────────

export interface ProgramRow {
  id: string;
  userId: string;
  cycleNumber: number;
  startDate: string;
  endDate: string;
  status: string;
  onboardingDays: number;
  daysPerWeek: number;
  splitLabel: string;
  /** Set by the week-6 check-in; empty for a first cycle. */
  buildOptions: BuildOptions;
  startLoads: Record<string, number>;
  kcalOffset: number;
}

const PROGRAM_COLS = `id, user_id, cycle_number, to_char(start_date,'YYYY-MM-DD') AS start_date, to_char(end_date,'YYYY-MM-DD') AS end_date,
  status, onboarding_days, days_per_week, split_label, build_options, start_loads, kcal_offset`;

function mapProgram(r: any): ProgramRow {
  return {
    id: r.id, userId: r.user_id, cycleNumber: r.cycle_number, startDate: r.start_date, endDate: r.end_date,
    status: r.status, onboardingDays: r.onboarding_days, daysPerWeek: r.days_per_week, splitLabel: r.split_label,
    buildOptions: r.build_options ?? {}, startLoads: r.start_loads ?? {}, kcalOffset: r.kcal_offset ?? 0,
  };
}

export async function getActiveProgram(userId: string, db: Db = pool): Promise<ProgramRow | null> {
  const { rows } = await db.query(
    `SELECT ${PROGRAM_COLS} FROM tracking.generated_programs WHERE user_id = $1 AND status = 'ACTIVE'`,
    [userId],
  );
  return rows[0] ? mapProgram(rows[0]) : null;
}

/** Every cycle the user has had, oldest first. Cycle numbers are unique per user. */
export async function listCycles(userId: string): Promise<{ cycleNumber: number; startDate: string; endDate: string; active: boolean }[]> {
  const { rows } = await pool.query(
    `SELECT cycle_number, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date, status = 'ACTIVE' AS active
       FROM tracking.generated_programs WHERE user_id = $1 ORDER BY cycle_number`,
    [userId],
  );
  return rows.map((r) => ({ cycleNumber: r.cycle_number, startDate: r.start_date, endDate: r.end_date, active: r.active }));
}

export async function archiveActiveProgram(db: Db, userId: string): Promise<number> {
  const { rows } = await db.query(
    `UPDATE tracking.generated_programs SET status = 'ARCHIVED', updated_at = now()
     WHERE user_id = $1 AND status = 'ACTIVE' RETURNING cycle_number`,
    [userId],
  );
  await db.query(
    `UPDATE tracking.workout_templates SET is_active = false
     WHERE user_id = $1 AND is_generated AND is_active`,
    [userId],
  );
  return rows[0]?.cycle_number ?? 0;
}

export async function insertProgram(
  db: Db,
  p: {
    userId: string; cycleNumber: number; startDate: string; endDate: string; onboardingDays: number; daysPerWeek: number; splitLabel: string;
    buildOptions?: BuildOptions; startLoads?: Record<string, number>; kcalOffset?: number;
  },
): Promise<ProgramRow> {
  const { rows } = await db.query(
    `INSERT INTO tracking.generated_programs
       (user_id, cycle_number, start_date, end_date, onboarding_days, days_per_week, split_label, build_options, start_loads, kcal_offset)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING ${PROGRAM_COLS}`,
    [p.userId, p.cycleNumber, p.startDate, p.endDate, p.onboardingDays, p.daysPerWeek, p.splitLabel,
      JSON.stringify(p.buildOptions ?? {}), JSON.stringify(p.startLoads ?? {}), p.kcalOffset ?? 0],
  );
  return mapProgram(rows[0]);
}

export async function updateProgramSchedule(db: Db, programId: string, fields: { daysPerWeek?: number; splitLabel?: string; startDate?: string; endDate?: string }) {
  await db.query(
    `UPDATE tracking.generated_programs SET
       days_per_week = COALESCE($2, days_per_week), split_label = COALESCE($3, split_label),
       start_date = COALESCE($4::date, start_date), end_date = COALESCE($5::date, end_date), updated_at = now()
     WHERE id = $1`,
    [programId, fields.daysPerWeek ?? null, fields.splitLabel ?? null, fields.startDate ?? null, fields.endDate ?? null],
  );
}

export async function deactivateProgramTemplates(db: Db, programId: string) {
  await db.query(`UPDATE tracking.workout_templates SET is_active = false WHERE program_id = $1 AND is_active`, [programId]);
}

/** Exercise ids by name (case-insensitive). Creates any missing library rows so a generated plan can always be logged. */
async function resolveExerciseIds(db: Db, names: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(names)];
  const { rows } = await db.query(
    `SELECT DISTINCT ON (lower(name)) id, name FROM tracking.exercises
     WHERE NOT is_custom AND lower(name) = ANY($1::text[]) ORDER BY lower(name), created_at`,
    [uniq.map((n) => n.toLowerCase())],
  );
  const map = new Map<string, string>(rows.map((r) => [r.name.toLowerCase(), r.id]));
  for (const n of uniq) {
    if (map.has(n.toLowerCase())) continue;
    const m = exerciseMeta(n);
    const ins = await db.query(
      `INSERT INTO tracking.exercises (name, muscle_group, equipment, pattern) VALUES ($1, $2, $3, $4) RETURNING id`,
      [n, m.muscleGroup, m.equipment, m.pattern],
    );
    map.set(n.toLowerCase(), ins.rows[0].id);
  }
  return map;
}

function topOfRange(reps: string): number {
  const nums = reps.match(/\d+/g)?.map(Number) ?? [10];
  return nums[nums.length - 1];
}

export async function insertGeneratedTemplates(db: Db, userId: string, programId: string, week: WeekPlan) {
  const ids = await resolveExerciseIds(db, week.sessions.flatMap((s) => s.exercises.map((e) => e.name)));
  for (const s of week.sessions) {
    const { rows } = await db.query(
      `INSERT INTO tracking.workout_templates (user_id, name, is_generated, program_id, weekday, session_type, is_active, warmup)
       VALUES ($1,$2,true,$3,$4,$5,true,$6) RETURNING id`,
      [userId, s.name, programId, s.weekday, s.type, JSON.stringify(s.warmup)],
    );
    const templateId = rows[0].id;
    let order = 1;
    for (const e of s.exercises) {
      await db.query(
        `INSERT INTO tracking.workout_template_exercises (template_id, exercise_id, "order", target_sets, target_reps, rep_range, replaces)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [templateId, ids.get(e.name.toLowerCase()), order++, e.sets, topOfRange(e.reps), e.reps, e.replaces],
      );
    }
  }
}

// ── Weekly day swaps ──────────────────────────────────────────────────────

export interface ScheduleSwapRow {
  weekStart: string;
  dayA: number;
  dayB: number;
}

/** Swaps for a program (optionally one week), in the order they were made. */
export async function listScheduleSwaps(programId: string, weekStart: string | null = null, db: Db = pool): Promise<ScheduleSwapRow[]> {
  const { rows } = await db.query(
    `SELECT to_char(week_start,'YYYY-MM-DD') AS week_start, day_a, day_b FROM tracking.schedule_swaps
     WHERE program_id = $1 AND ($2::date IS NULL OR week_start = $2::date) ORDER BY week_start, created_at`,
    [programId, weekStart],
  );
  return rows.map((r) => ({ weekStart: r.week_start, dayA: r.day_a, dayB: r.day_b }));
}

export async function insertScheduleSwap(db: Db, programId: string, s: ScheduleSwapRow) {
  await db.query(
    `INSERT INTO tracking.schedule_swaps (program_id, week_start, day_a, day_b) VALUES ($1,$2,$3,$4)`,
    [programId, s.weekStart, s.dayA, s.dayB],
  );
}

export async function deleteScheduleSwaps(db: Db, programId: string, weekStart: string | null = null) {
  await db.query(
    `DELETE FROM tracking.schedule_swaps WHERE program_id = $1 AND ($2::date IS NULL OR week_start = $2::date)`,
    [programId, weekStart],
  );
}

/** Exercise ids by name, creating library rows for any not seeded yet (swap options include new library exercises). */
export async function exerciseIdsByName(db: Db, names: string[]): Promise<Map<string, string>> {
  return resolveExerciseIds(db, names);
}

/**
 * Swap a template's exercise for the rest of the cycle. The original is kept
 * (swapping again from a swapped exercise still remembers the first one).
 */
export async function swapTemplateExercise(db: Db, templateId: string, fromExerciseId: string, toExerciseId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE tracking.workout_template_exercises
        SET swapped_from_exercise_id = CASE WHEN COALESCE(swapped_from_exercise_id, exercise_id) = $3 THEN NULL
                                            ELSE COALESCE(swapped_from_exercise_id, exercise_id) END,
            exercise_id = $3
      WHERE template_id = $1 AND exercise_id = $2`,
    [templateId, fromExerciseId, toExerciseId],
  );
  return rowCount === 1;
}

/** Back to the planned exercise. */
export async function resetTemplateExercise(db: Db, templateId: string, exerciseId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE tracking.workout_template_exercises SET exercise_id = swapped_from_exercise_id, swapped_from_exercise_id = NULL
      WHERE template_id = $1 AND exercise_id = $2 AND swapped_from_exercise_id IS NOT NULL`,
    [templateId, exerciseId],
  );
  return rowCount === 1;
}

/** Serialises swap writes for a program so the weekly limit can't be raced. */
export async function lockProgram(db: Db, programId: string) {
  await db.query(`SELECT 1 FROM tracking.generated_programs WHERE id = $1 FOR UPDATE`, [programId]);
}

/** True when this template was logged on (or within a day of, for time zones) the given date. */
export async function templateLoggedNear(userId: string, templateId: string, dateIso: string, db: Db = pool): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM tracking.workout_sessions
     WHERE user_id = $1 AND template_id = $2 AND started_at >= ($3::date - 1) AND started_at < ($3::date + 2) LIMIT 1`,
    [userId, templateId, dateIso],
  );
  return rows.length > 0;
}

export interface StoredSession extends PlannedSession {
  templateId: string;
  /** swappedFrom: the planned exercise, while swapped for the rest of the cycle. */
  exercises: (PlannedSession["exercises"][number] & { exerciseId: string; swappedFrom: { exerciseId: string; name: string } | null })[];
}

/** The active week, read back from the stored templates (the source of truth once generated). */
export async function listActiveSessions(programId: string, db: Db = pool): Promise<StoredSession[]> {
  const { rows } = await db.query(
    `SELECT t.id AS template_id, t.name, t.weekday, t.session_type, t.warmup,
            te."order", te.target_sets, te.rep_range, te.target_reps, te.replaces, e.id AS exercise_id, e.name AS exercise_name, e.pattern,
            te.swapped_from_exercise_id, f.name AS swapped_from_name
     FROM tracking.workout_templates t
     JOIN tracking.workout_template_exercises te ON te.template_id = t.id
     JOIN tracking.exercises e ON e.id = te.exercise_id
     LEFT JOIN tracking.exercises f ON f.id = te.swapped_from_exercise_id
     WHERE t.program_id = $1 AND t.is_active
     ORDER BY t.weekday, te."order"`,
    [programId],
  );
  const byTemplate = new Map<string, StoredSession>();
  for (const r of rows) {
    let s = byTemplate.get(r.template_id);
    if (!s) {
      s = { templateId: r.template_id, weekday: r.weekday, type: r.session_type as SessionType, name: r.name, warmup: r.warmup as WarmupItem[], exercises: [] };
      byTemplate.set(r.template_id, s);
    }
    s.exercises.push({
      exerciseId: r.exercise_id, name: r.exercise_name, pattern: (r.pattern ?? patternOf(r.exercise_name)) as any,
      sets: r.target_sets, reps: r.rep_range ?? String(r.target_reps),
      isCore: /crunch|knee raise|dead bug|plank|hollow|pallof|side bend/i.test(r.exercise_name),
      swapped: !!r.replaces, replaces: r.replaces,
      swappedFrom: r.swapped_from_exercise_id ? { exerciseId: r.swapped_from_exercise_id, name: r.swapped_from_name } : null,
    });
  }
  return [...byTemplate.values()].sort((a, b) => a.weekday - b.weekday);
}

// ── Week-6 check-in ───────────────────────────────────────────────────────

/** The user's local calendar for grouping logs: their saved time zone, else UTC. */
const LOCAL = `COALESCE((SELECT time_zone FROM identity.users WHERE id = $1), 'UTC')`;

/** Everything the check-in measures, from `from` (YYYY-MM-DD) on, by local date. */
export async function cycleLogs(userId: string, from: string, db: Db = pool): Promise<{
  weights: { date: string; kg: number }[]; workoutDates: string[]; sets: LoggedSet[];
}> {
  const [w, s] = await Promise.all([
    db.query(
      `SELECT to_char((recorded_at AT TIME ZONE ${LOCAL})::date, 'YYYY-MM-DD') AS date, weight_kg
       FROM tracking.weight_entries WHERE user_id = $1 AND recorded_at >= $2::date - 1 ORDER BY recorded_at`,
      [userId, from],
    ),
    db.query(
      `SELECT to_char((ws.started_at AT TIME ZONE ${LOCAL})::date, 'YYYY-MM-DD') AS date, e.name, sl.weight_kg, sl.reps
       FROM tracking.workout_sessions ws
       LEFT JOIN tracking.set_logs sl ON sl.session_id = ws.id
       LEFT JOIN tracking.exercises e ON e.id = sl.exercise_id
       WHERE ws.user_id = $1 AND ws.started_at >= $2::date - 1`,
      [userId, from],
    ),
  ]);
  return {
    weights: w.rows.map((r) => ({ date: r.date, kg: Number(r.weight_kg) })),
    workoutDates: [...new Set(s.rows.map((r) => r.date as string))],
    sets: s.rows.filter((r) => r.name).map((r) => ({ name: r.name, date: r.date, weightKg: Number(r.weight_kg ?? 0), reps: Number(r.reps ?? 0) })),
  };
}

/** The intake fields a check-in moves on: current weight, the day count anchor and (when reached) the goal. */
export async function updateIntakeForCycle(db: Db, userId: string, t: { weightKg: number; daysPerWeek: number; goal: GoalType; targetWeightKg: number | null }) {
  await db.query(
    `UPDATE identity.intake_profiles SET weight_kg = $2, days_per_week = $3, goal_type = $4, target_weight_kg = $5, updated_at = now() WHERE user_id = $1`,
    [userId, t.weightKg, t.daysPerWeek, t.goal, t.targetWeightKg],
  );
}

export async function insertCheckin(db: Db, c: { userId: string; programId: string; nextProgramId: string; answers: unknown; results: unknown; changes: unknown }) {
  await db.query(
    `INSERT INTO tracking.cycle_checkins (user_id, program_id, next_program_id, answers, results, changes) VALUES ($1,$2,$3,$4,$5,$6)`,
    [c.userId, c.programId, c.nextProgramId, JSON.stringify(c.answers), JSON.stringify(c.results), JSON.stringify(c.changes)],
  );
}

/**
 * The last 8 logged sessions of each exercise, with how they felt
 * (README "Exercise ease"), for progression offers.
 */
export async function exerciseLogHistory(userId: string, exerciseIds: string[], db: Db = pool): Promise<Map<string, ExerciseSessionLog[]>> {
  const out = new Map<string, ExerciseSessionLog[]>();
  if (!exerciseIds.length) return out;
  const { rows } = await db.query<{ exercise_id: string; started_at: Date; sets: { reps: number; weightKg: number }[]; ease: Ease | null }>(
    `WITH s AS (
       SELECT ws.id, ws.started_at, sl.exercise_id,
              json_agg(json_build_object('reps', sl.reps, 'weightKg', sl.weight_kg) ORDER BY sl.set_number) AS sets,
              ROW_NUMBER() OVER (PARTITION BY sl.exercise_id ORDER BY ws.started_at DESC) AS rn
         FROM tracking.workout_sessions ws
         JOIN tracking.set_logs sl ON sl.session_id = ws.id
        WHERE ws.user_id = $1 AND sl.exercise_id = ANY($2::uuid[])
        GROUP BY ws.id, ws.started_at, sl.exercise_id
     )
     SELECT s.exercise_id, s.started_at, s.sets, er.ease
       FROM s LEFT JOIN tracking.exercise_ratings er ON er.session_id = s.id AND er.exercise_id = s.exercise_id
      WHERE s.rn <= 8`,
    [userId, exerciseIds],
  );
  for (const r of rows) {
    const list = out.get(r.exercise_id) ?? [];
    list.push({ startedAt: r.started_at.toISOString(), sets: r.sets.map((x) => ({ reps: Number(x.reps), weightKg: Number(x.weightKg) })), ease: r.ease });
    out.set(r.exercise_id, list);
  }
  return out;
}

export async function userUnits(userId: string, db: Db = pool): Promise<"METRIC" | "IMPERIAL"> {
  const { rows } = await db.query<{ units: string }>(`SELECT units FROM identity.users WHERE id = $1`, [userId]);
  return rows[0]?.units === "IMPERIAL" ? "IMPERIAL" : "METRIC";
}
