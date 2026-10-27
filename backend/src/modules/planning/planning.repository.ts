import type { PoolClient } from "pg";
import { pool } from "../../shared/db/pool.js";
import type {
  HealthScreening, PlannedSession, SessionType, TrainingInput, WarmupItem, WeekPlan,
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
}

export async function upsertIntake(db: Db, userId: string, i: TrainingInput, x: IntakeExtras) {
  await db.query(
    `INSERT INTO identity.intake_profiles (
       user_id, sex, age, height_cm, weight_kg, body_fat_level, goal_type, target_weight_kg, goal_pace, motivations,
       experience, lift_comfort, equipment, available_days, days_per_week, session_minutes, split_preference, full_body_day,
       priority_muscles, injuries, injury_note, cardio_frequency, cardio_likes, activity_level, sleep_hours, sleep_quality,
       train_time, busyness, warmup, energy, blockers, mindset, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32, now())
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
       blockers = EXCLUDED.blockers, mindset = EXCLUDED.mindset, updated_at = now()`,
    [
      userId, i.sex, i.age, i.heightCm, i.weightKg, i.bodyFatLevel, i.goal, i.targetWeightKg, i.pace, x.motivations,
      i.experience, i.liftComfort, i.equipment, i.availableDays, i.daysPerWeek, i.sessionMinutes, i.split, i.fullBodyDay,
      i.priorityMuscles, i.injuries, x.injuryNote, x.cardioFrequency, i.cardioLikes, i.activityLevel, i.sleepHours, i.sleepQuality,
      i.trainTime, i.busyness, i.warmup, x.energy, i.blockers, JSON.stringify(x.mindset),
    ],
  );
}

export interface IntakeRow {
  training: TrainingInput;
  reminderTime: string | null;
  motivations: string[];
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
      priorityMuscles: r.priority_muscles, injuries: r.injuries, activityLevel: r.activity_level, sleepHours: Number(r.sleep_hours),
      sleepQuality: r.sleep_quality, trainTime: r.train_time, busyness: r.busyness, warmup: r.warmup, cardioLikes: r.cardio_likes,
      blockers: r.blockers,
    },
    reminderTime: r.reminder_time,
    motivations: r.motivations,
  };
}

export async function setReminderTime(userId: string, time: string | null) {
  await pool.query(`UPDATE identity.intake_profiles SET reminder_time = $2, updated_at = now() WHERE user_id = $1`, [userId, time]);
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
}

function mapProgram(r: any): ProgramRow {
  return {
    id: r.id, userId: r.user_id, cycleNumber: r.cycle_number, startDate: r.start_date, endDate: r.end_date,
    status: r.status, onboardingDays: r.onboarding_days, daysPerWeek: r.days_per_week, splitLabel: r.split_label,
  };
}

export async function getActiveProgram(userId: string, db: Db = pool): Promise<ProgramRow | null> {
  const { rows } = await db.query(
    `SELECT id, user_id, cycle_number, to_char(start_date,'YYYY-MM-DD') AS start_date, to_char(end_date,'YYYY-MM-DD') AS end_date,
            status, onboarding_days, days_per_week, split_label
     FROM tracking.generated_programs WHERE user_id = $1 AND status = 'ACTIVE'`,
    [userId],
  );
  return rows[0] ? mapProgram(rows[0]) : null;
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
  p: { userId: string; cycleNumber: number; startDate: string; endDate: string; onboardingDays: number; daysPerWeek: number; splitLabel: string },
): Promise<ProgramRow> {
  const { rows } = await db.query(
    `INSERT INTO tracking.generated_programs (user_id, cycle_number, start_date, end_date, onboarding_days, days_per_week, split_label)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, user_id, cycle_number, to_char(start_date,'YYYY-MM-DD') AS start_date, to_char(end_date,'YYYY-MM-DD') AS end_date,
               status, onboarding_days, days_per_week, split_label`,
    [p.userId, p.cycleNumber, p.startDate, p.endDate, p.onboardingDays, p.daysPerWeek, p.splitLabel],
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

export interface StoredSession extends PlannedSession {
  templateId: string;
  exercises: (PlannedSession["exercises"][number] & { exerciseId: string })[];
}

/** The active week, read back from the stored templates (the source of truth once generated). */
export async function listActiveSessions(programId: string, db: Db = pool): Promise<StoredSession[]> {
  const { rows } = await db.query(
    `SELECT t.id AS template_id, t.name, t.weekday, t.session_type, t.warmup,
            te."order", te.target_sets, te.rep_range, te.target_reps, te.replaces, e.id AS exercise_id, e.name AS exercise_name, e.pattern
     FROM tracking.workout_templates t
     JOIN tracking.workout_template_exercises te ON te.template_id = t.id
     JOIN tracking.exercises e ON e.id = te.exercise_id
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
    });
  }
  return [...byTemplate.values()].sort((a, b) => a.weekday - b.weekday);
}
