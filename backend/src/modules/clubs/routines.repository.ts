import type { PoolClient } from "pg";
import { pool } from "../../shared/db/pool.js";

type Db = PoolClient | typeof pool;

/** Club routines SQL (sql/012_club_routines.sql). Access checks live in routines.service.ts. */

export type RoutineKind = "ACTIVITY" | "WORKOUT";
export interface RoutineExercise { exerciseId: string; sets: number; reps: number }

export interface RoutineRow {
  id: string;
  clubId: string;
  title: string;
  description: string | null;
  kind: RoutineKind;
  weekdays: number[];
  activityType: string | null;
  minDistanceKm: number | null;
  minMinutes: number | null;
  exercises: RoutineExercise[];
  createdAt: Date;
  archivedAt: Date | null;
}

const mapRoutine = (r: any): RoutineRow => ({
  id: r.id, clubId: r.club_id, title: r.title, description: r.description, kind: r.kind,
  weekdays: (r.weekdays as number[]).map(Number).sort((a, b) => a - b), activityType: r.activity_type,
  minDistanceKm: r.min_distance_km == null ? null : Number(r.min_distance_km), minMinutes: r.min_minutes,
  exercises: r.exercises ?? [], createdAt: r.created_at, archivedAt: r.archived_at,
});

export type RoutineFields = Omit<RoutineRow, "id" | "clubId" | "createdAt" | "archivedAt">;

const fieldArgs = (f: RoutineFields) => [
  f.title, f.description, f.kind, f.weekdays, f.activityType, f.minDistanceKm, f.minMinutes,
  f.kind === "WORKOUT" ? JSON.stringify(f.exercises) : null,
];

export async function insertRoutine(db: Db, clubId: string, createdBy: string, f: RoutineFields): Promise<RoutineRow> {
  const { rows } = await db.query(
    `INSERT INTO clubs.routines (title, description, kind, weekdays, activity_type, min_distance_km, min_minutes, exercises, club_id, created_by)
     VALUES ($1,$2,$3,$4::smallint[],$5,$6,$7,$8::jsonb,$9,$10) RETURNING *`,
    [...fieldArgs(f), clubId, createdBy],
  );
  return mapRoutine(rows[0]);
}

export async function updateRoutineRow(id: string, f: RoutineFields): Promise<RoutineRow> {
  const { rows } = await pool.query(
    `UPDATE clubs.routines SET title = $1, description = $2, kind = $3, weekdays = $4::smallint[], activity_type = $5,
            min_distance_km = $6, min_minutes = $7, exercises = $8::jsonb, updated_at = now()
      WHERE id = $9 RETURNING *`,
    [...fieldArgs(f), id],
  );
  return mapRoutine(rows[0]);
}

export async function archiveRoutineRow(id: string) {
  await pool.query(`UPDATE clubs.routines SET archived_at = now() WHERE id = $1 AND archived_at IS NULL`, [id]);
}

export async function getRoutine(id: string): Promise<RoutineRow | null> {
  const { rows } = await pool.query(`SELECT * FROM clubs.routines WHERE id = $1`, [id]);
  return rows[0] ? mapRoutine(rows[0]) : null;
}

export async function listRoutines(clubId: string): Promise<RoutineRow[]> {
  const { rows } = await pool.query(`SELECT * FROM clubs.routines WHERE club_id = $1 AND archived_at IS NULL ORDER BY created_at`, [clubId]);
  return rows.map(mapRoutine);
}

export async function countActiveRoutines(db: Db, clubId: string): Promise<number> {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM clubs.routines WHERE club_id = $1 AND archived_at IS NULL`, [clubId]);
  return rows[0].n;
}

/** Active routines in open clubs where the user is an active member, with the club and their join time. */
export async function listRoutinesForUser(userId: string): Promise<(RoutineRow & { clubName: string; joinedAt: Date })[]> {
  const { rows } = await pool.query(
    `SELECT r.*, c.name AS club_name, m.joined_at
       FROM clubs.routines r
       JOIN clubs.clubs c ON c.id = r.club_id AND c.closed_at IS NULL
       JOIN clubs.memberships m ON m.club_id = r.club_id AND m.user_id = $1 AND m.status = 'ACTIVE'
      WHERE r.archived_at IS NULL
      ORDER BY c.name, r.created_at`,
    [userId],
  );
  return rows.map((r) => ({ ...mapRoutine(r), clubName: r.club_name, joinedAt: r.joined_at }));
}

/** False if it was already logged for that day. */
export async function insertCompletion(db: Db, c: { routineId: string; userId: string; onDate: string; sessionId: string | null }): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO clubs.routine_completions (routine_id, user_id, on_date, session_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [c.routineId, c.userId, c.onDate, c.sessionId],
  );
  return rowCount === 1;
}

/** Workout routine completions from a date, as user id → days. */
export async function listCompletions(routineId: string, fromIso: string, userId?: string): Promise<Map<string, Set<string>>> {
  const { rows } = await pool.query(
    `SELECT user_id, to_char(on_date, 'YYYY-MM-DD') AS d FROM clubs.routine_completions
      WHERE routine_id = $1 AND on_date >= $2 AND ($3::uuid IS NULL OR user_id = $3)`,
    [routineId, fromIso, userId ?? null],
  );
  const out = new Map<string, Set<string>>();
  for (const r of rows) (out.get(r.user_id) ?? out.set(r.user_id, new Set()).get(r.user_id)!).add(r.d);
  return out;
}
