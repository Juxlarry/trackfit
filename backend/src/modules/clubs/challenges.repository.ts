import type { PoolClient } from "pg";
import { pool } from "../../shared/db/pool.js";
import type { Cadence } from "./challenge-schedule.js";
import type { PersonRef } from "./feed.repository.js";

type Db = PoolClient | typeof pool;

/** Coach challenges SQL (sql/013_club_challenges.sql). Access checks live in challenges.service.ts. */

export type ChallengeKind = "WORKOUT" | "ACTIVITY" | "FOOD" | "WATER";
export interface ChallengeExercise { exerciseId: string; sets: number; reps: number }

export interface ChallengeRow {
  id: string;
  clubId: string;
  coachId: string;
  coachName: string;
  title: string;
  description: string | null;
  cadence: Cadence;
  kind: ChallengeKind;
  startsOn: string;
  endsOn: string;
  videoMediaId: string | null;
  exercises: ChallengeExercise[];
  timeLimitMinutes: number | null;
  activityType: string | null;
  minDistanceKm: number | null;
  minMinutes: number | null;
  foodKey: string | null;
  foodName: string | null;
  foodGrams: number | null;
  waterMl: number | null;
  createdAt: Date;
  endedAt: Date | null;
}

const num = (v: unknown) => (v == null ? null : Number(v));

const mapChallenge = (r: any): ChallengeRow => ({
  id: r.id, clubId: r.club_id, coachId: r.coach_id, coachName: r.coach_name ?? "", title: r.title, description: r.description,
  cadence: r.cadence, kind: r.kind, startsOn: r.starts, endsOn: r.ends, videoMediaId: r.video_media_id, exercises: r.exercises ?? [],
  timeLimitMinutes: r.time_limit_minutes, activityType: r.activity_type, minDistanceKm: num(r.min_distance_km), minMinutes: r.min_minutes,
  foodKey: r.food_key, foodName: r.food_name, foodGrams: r.food_grams, waterMl: r.water_ml, createdAt: r.created_at, endedAt: r.ended_at,
});

const SELECT = `
  SELECT ch.*, to_char(ch.starts_on, 'YYYY-MM-DD') AS starts, to_char(ch.ends_on, 'YYYY-MM-DD') AS ends, u.display_name AS coach_name
    FROM clubs.challenges ch
    JOIN identity.users u ON u.id = ch.coach_id`;

export type ChallengeFields = Omit<ChallengeRow, "id" | "clubId" | "coachId" | "coachName" | "createdAt" | "endedAt">;

export async function insertChallenge(db: Db, clubId: string, coachId: string, setWeek: string, f: ChallengeFields): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO clubs.challenges (club_id, coach_id, set_week, title, description, cadence, kind, starts_on, ends_on, video_media_id,
            exercises, time_limit_minutes, activity_type, min_distance_km, min_minutes, food_key, food_name, food_grams, water_ml)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
    [clubId, coachId, setWeek, f.title, f.description, f.cadence, f.kind, f.startsOn, f.endsOn, f.videoMediaId,
      f.kind === "WORKOUT" ? JSON.stringify(f.exercises) : null, f.timeLimitMinutes, f.activityType, f.minDistanceKm, f.minMinutes,
      f.foodKey, f.foodName, f.foodGrams, f.waterMl],
  );
  return rows[0].id;
}

/** How many challenges this coach has set in this club in the week starting setWeek (ended ones included). */
export async function countSetInWeek(db: Db, clubId: string, coachId: string, setWeek: string): Promise<number> {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM clubs.challenges WHERE club_id = $1 AND coach_id = $2 AND set_week = $3`,
    [clubId, coachId, setWeek],
  );
  return rows[0].n;
}

export async function getChallenge(id: string, db: Db = pool): Promise<ChallengeRow | null> {
  const { rows } = await db.query(`${SELECT} WHERE ch.id = $1`, [id]);
  return rows[0] ? mapChallenge(rows[0]) : null;
}

/** Newest start first. */
export async function listClubChallenges(clubId: string): Promise<ChallengeRow[]> {
  const { rows } = await pool.query(`${SELECT} WHERE ch.club_id = $1 ORDER BY ch.starts_on DESC, ch.created_at DESC LIMIT 100`, [clubId]);
  return rows.map(mapChallenge);
}

export async function endChallengeRow(id: string) {
  await pool.query(`UPDATE clubs.challenges SET ended_at = now() WHERE id = $1 AND ended_at IS NULL`, [id]);
}

export type ParticipantStatus = "JOINED" | "DECLINED";

/** Challenges not yet over in open clubs where the user is active, with their answer (null: not answered). */
export async function listChallengesForUser(userId: string, onOrAfter: string): Promise<(ChallengeRow & { clubName: string; status: ParticipantStatus | null; completedAt: Date | null })[]> {
  const { rows } = await pool.query(
    `SELECT ch.*, to_char(ch.starts_on, 'YYYY-MM-DD') AS starts, to_char(ch.ends_on, 'YYYY-MM-DD') AS ends, u.display_name AS coach_name,
            c.name AS club_name, p.status AS answer, p.completed_at
       FROM clubs.challenges ch
       JOIN identity.users u ON u.id = ch.coach_id
       JOIN clubs.clubs c ON c.id = ch.club_id AND c.closed_at IS NULL
       JOIN clubs.memberships m ON m.club_id = ch.club_id AND m.user_id = $1 AND m.status = 'ACTIVE'
       LEFT JOIN clubs.challenge_participants p ON p.challenge_id = ch.id AND p.user_id = $1
      WHERE ch.ended_at IS NULL AND ch.ends_on >= $2
      ORDER BY ch.starts_on, ch.created_at`,
    [userId, onOrAfter],
  );
  return rows.map((r) => ({ ...mapChallenge(r), clubName: r.club_name, status: r.answer ?? null, completedAt: r.completed_at ?? null }));
}

export async function setParticipant(challengeId: string, userId: string, status: ParticipantStatus) {
  await pool.query(
    `INSERT INTO clubs.challenge_participants (challenge_id, user_id, status) VALUES ($1,$2,$3)
     ON CONFLICT (challenge_id, user_id) DO UPDATE SET status = $3, decided_at = now()`,
    [challengeId, userId, status],
  );
}

export interface ParticipantRow { userId: string; status: ParticipantStatus; completedAt: Date | null; person: PersonRef }

export async function getParticipant(challengeId: string, userId: string, db: Db = pool): Promise<{ status: ParticipantStatus; completedAt: Date | null } | null> {
  const { rows } = await db.query(`SELECT status, completed_at FROM clubs.challenge_participants WHERE challenge_id = $1 AND user_id = $2`, [challengeId, userId]);
  return rows[0] ? { status: rows[0].status, completedAt: rows[0].completed_at } : null;
}

/** Everyone who joined, with how the club sees them now. */
export async function listJoined(challengeId: string): Promise<ParticipantRow[]> {
  const { rows } = await pool.query(
    `SELECT p.user_id, p.status, p.completed_at, u.display_name, m.is_admin, m.is_coach, m.status AS m_status
       FROM clubs.challenge_participants p
       JOIN clubs.challenges ch ON ch.id = p.challenge_id
       JOIN identity.users u ON u.id = p.user_id
       LEFT JOIN clubs.memberships m ON m.club_id = ch.club_id AND m.user_id = p.user_id
      WHERE p.challenge_id = $1 AND p.status = 'JOINED'
      ORDER BY p.decided_at`,
    [challengeId],
  );
  return rows.map((r) => ({
    userId: r.user_id, status: r.status, completedAt: r.completed_at,
    person: { userId: r.user_id, displayName: r.display_name, isAdmin: r.is_admin === true, isCoach: r.is_coach === true, inClub: r.m_status === "ACTIVE" },
  }));
}

export async function markCompleted(db: Db, challengeId: string, userId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE clubs.challenge_participants SET completed_at = now() WHERE challenge_id = $1 AND user_id = $2 AND completed_at IS NULL`,
    [challengeId, userId],
  );
  return rowCount === 1;
}

/** Challenges a member has taken on in a club, for the coaches' Members page. */
export async function countJoined(clubId: string, userId: string): Promise<{ taken: number; completed: number }> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS taken, count(p.completed_at)::int AS completed
       FROM clubs.challenge_participants p JOIN clubs.challenges ch ON ch.id = p.challenge_id
      WHERE ch.club_id = $1 AND p.user_id = $2 AND p.status = 'JOINED'`,
    [clubId, userId],
  );
  return rows[0];
}

// ── Entries (proof) ─────────────────────────────────────────────────────

export interface EntryRow {
  id: string;
  challengeId: string;
  userId: string;
  periodStart: string;
  onDate: string;
  resultSeconds: number | null;
  resultReps: number | null;
  distanceKm: number | null;
  minutes: number | null;
  waterMl: number | null;
  note: string | null;
  sessionId: string | null;
  activityId: string | null;
  mediaId: string | null;
  createdAt: Date;
}

const mapEntry = (r: any): EntryRow => ({
  id: r.id, challengeId: r.challenge_id, userId: r.user_id, periodStart: r.period, onDate: r.day, resultSeconds: r.result_seconds,
  resultReps: r.result_reps, distanceKm: num(r.distance_km), minutes: r.minutes, waterMl: r.water_ml, note: r.note, sessionId: r.session_id,
  activityId: r.activity_id, mediaId: r.media_id, createdAt: r.created_at,
});

const ENTRY_COLS = `*, to_char(period_start, 'YYYY-MM-DD') AS period, to_char(on_date, 'YYYY-MM-DD') AS day`;

export type NewEntry = Omit<EntryRow, "id" | "createdAt" | "sessionId"> & { foodLogId: string | null };

/** Null if this day (or week) already has proof. */
export async function insertEntry(db: Db, e: NewEntry): Promise<string | null> {
  const { rows } = await db.query(
    `INSERT INTO clubs.challenge_entries (challenge_id, user_id, period_start, on_date, result_seconds, result_reps, distance_km, minutes,
            water_ml, note, activity_id, food_log_id, media_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING RETURNING id`,
    [e.challengeId, e.userId, e.periodStart, e.onDate, e.resultSeconds, e.resultReps, e.distanceKm, e.minutes, e.waterMl, e.note,
      e.activityId, e.foodLogId, e.mediaId],
  );
  return rows[0]?.id ?? null;
}

export async function setEntrySession(id: string, sessionId: string) {
  await pool.query(`UPDATE clubs.challenge_entries SET session_id = $2 WHERE id = $1`, [id, sessionId]);
}

/** Oldest first. All members', or one member's. */
export async function listEntries(challengeId: string, userId?: string, db: Db = pool): Promise<EntryRow[]> {
  const { rows } = await db.query(
    `SELECT ${ENTRY_COLS} FROM clubs.challenge_entries WHERE challenge_id = $1 AND ($2::uuid IS NULL OR user_id = $2) ORDER BY period_start, created_at`,
    [challengeId, userId ?? null],
  );
  return rows.map(mapEntry);
}

/** One member's entries across several challenges, as challenge id → periods with proof. */
export async function provedPeriods(userId: string, challengeIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (!challengeIds.length) return out;
  const { rows } = await pool.query(
    `SELECT challenge_id, to_char(period_start, 'YYYY-MM-DD') AS p FROM clubs.challenge_entries WHERE user_id = $1 AND challenge_id = ANY($2::uuid[])`,
    [userId, challengeIds],
  );
  for (const r of rows) (out.get(r.challenge_id) ?? out.set(r.challenge_id, new Set()).get(r.challenge_id)!).add(r.p);
  return out;
}

export async function hasWinPost(challengeId: string, userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM clubs.posts WHERE challenge_id = $1 AND author_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [challengeId, userId],
  );
  return rows.length > 0;
}

// ── Comments on the challenge page ──────────────────────────────────────

export interface ChallengeCommentRow { id: string; challengeId: string; author: PersonRef; body: string; createdAt: Date }

export async function insertChallengeComment(challengeId: string, authorId: string, body: string): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO clubs.challenge_comments (challenge_id, author_id, body) VALUES ($1,$2,$3) RETURNING id`,
    [challengeId, authorId, body],
  );
  return rows[0].id;
}

export async function listChallengeComments(challengeId: string): Promise<ChallengeCommentRow[]> {
  const { rows } = await pool.query(
    `SELECT k.*, u.display_name, m.is_admin, m.is_coach, m.status
       FROM clubs.challenge_comments k
       JOIN clubs.challenges ch ON ch.id = k.challenge_id
       JOIN identity.users u ON u.id = k.author_id
       LEFT JOIN clubs.memberships m ON m.club_id = ch.club_id AND m.user_id = k.author_id
      WHERE k.challenge_id = $1 AND k.deleted_at IS NULL
      ORDER BY k.created_at`,
    [challengeId],
  );
  return rows.map((r) => ({
    id: r.id, challengeId: r.challenge_id, body: r.body, createdAt: r.created_at,
    author: { userId: r.author_id, displayName: r.display_name, isAdmin: r.is_admin === true, isCoach: r.is_coach === true, inClub: r.status === "ACTIVE" },
  }));
}

export async function getChallengeComment(id: string): Promise<{ id: string; challengeId: string; authorId: string; deleted: boolean } | null> {
  const { rows } = await pool.query(`SELECT id, challenge_id, author_id, deleted_at FROM clubs.challenge_comments WHERE id = $1`, [id]);
  return rows[0] ? { id: rows[0].id, challengeId: rows[0].challenge_id, authorId: rows[0].author_id, deleted: !!rows[0].deleted_at } : null;
}

export async function deleteChallengeCommentRow(id: string) {
  await pool.query(`UPDATE clubs.challenge_comments SET deleted_at = now() WHERE id = $1`, [id]);
}
