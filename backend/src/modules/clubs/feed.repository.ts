import type { PoolClient } from "pg";
import { pool } from "../../shared/db/pool.js";

type Db = PoolClient | typeof pool;

/** Feed SQL (sql/011_club_feed.sql). Access checks live in feed.service.ts. */

export type MediaPurpose = "POST" | "COMMENT" | "CLUB_PHOTO";
export type MediaKind = "IMAGE" | "VIDEO";
export type PostKind = "WORKOUT" | "RUN" | "CYCLE" | "ACTIVITY" | "PROGRESS" | "MEAL" | "CHALLENGE_WIN" | "COACH_VIDEO";
export type Reaction = "FIRE" | "STRONG" | "CLAP" | "HEART";
export type FeedFilter = "ALL" | "WINS" | "COACH_VIDEOS" | "CHALLENGES";

export interface MediaRow {
  id: string;
  clubId: string;
  uploaderId: string;
  purpose: MediaPurpose;
  kind: MediaKind;
  contentType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  storagePath: string;
  status: "PENDING" | "READY";
  createdAt: Date;
}

const mapMedia = (r: any): MediaRow => ({
  id: r.id, clubId: r.club_id, uploaderId: r.uploader_id, purpose: r.purpose, kind: r.kind, contentType: r.content_type,
  sizeBytes: r.size_bytes, durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds), storagePath: r.storage_path,
  status: r.status, createdAt: r.created_at,
});

/** The author as the club sees them now: their roles, or that they've left. */
export interface PersonRef { userId: string; displayName: string; isAdmin: boolean; isCoach: boolean; inClub: boolean }

export interface PostRow {
  id: string;
  clubId: string;
  author: PersonRef;
  kind: PostKind;
  body: string;
  sessionId: string | null;
  activityId: string | null;
  weightChangeKg: number | null;
  hasPr: boolean;
  mediaId: string | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
}

const person = (r: any, prefix = ""): PersonRef => ({
  userId: r[`${prefix}author_id`], displayName: r[`${prefix}author_name`],
  isAdmin: r[`${prefix}is_admin`] === true, isCoach: r[`${prefix}is_coach`] === true, inClub: r[`${prefix}status`] === "ACTIVE",
});

const mapPost = (r: any): PostRow => ({
  id: r.id, clubId: r.club_id, author: person(r), kind: r.kind, body: r.body, sessionId: r.session_id, activityId: r.activity_id,
  weightChangeKg: r.weight_change_kg == null ? null : Number(r.weight_change_kg), hasPr: r.has_pr, mediaId: r.media_id,
  createdAt: r.created_at, editedAt: r.edited_at, deletedAt: r.deleted_at,
});

const POST_SELECT = `
  SELECT p.*, u.display_name AS author_name, m.is_admin, m.is_coach, m.status
    FROM clubs.posts p
    JOIN identity.users u ON u.id = p.author_id
    LEFT JOIN clubs.memberships m ON m.club_id = p.club_id AND m.user_id = p.author_id`;

export interface CommentRow {
  id: string;
  postId: string;
  author: PersonRef;
  body: string;
  mediaId: string | null;
  createdAt: Date;
}

const mapComment = (r: any): CommentRow => ({ id: r.id, postId: r.post_id, author: person(r), body: r.body, mediaId: r.media_id, createdAt: r.created_at });

// ── Media ───────────────────────────────────────────────────────────────

export async function insertMedia(db: Db, m: Omit<MediaRow, "createdAt" | "status"> & { status?: "PENDING" | "READY" }): Promise<MediaRow> {
  const { rows } = await db.query(
    `INSERT INTO clubs.media (id, club_id, uploader_id, purpose, kind, content_type, size_bytes, duration_seconds, storage_path, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [m.id, m.clubId, m.uploaderId, m.purpose, m.kind, m.contentType, m.sizeBytes, m.durationSeconds, m.storagePath, m.status ?? "PENDING"],
  );
  return mapMedia(rows[0]);
}

export async function getMedia(id: string, db: Db = pool): Promise<MediaRow | null> {
  const { rows } = await db.query(`SELECT * FROM clubs.media WHERE id = $1`, [id]);
  return rows[0] ? mapMedia(rows[0]) : null;
}

/** Claims a pending upload: true only for the first caller, so one file can't be attached twice. */
export async function markMediaReady(db: Db, id: string, sizeBytes: number): Promise<boolean> {
  const { rowCount } = await db.query(`UPDATE clubs.media SET status = 'READY', size_bytes = $2 WHERE id = $1 AND status = 'PENDING'`, [id, sizeBytes]);
  return rowCount === 1;
}

export async function deleteMediaRows(db: Db, ids: string[]): Promise<MediaRow[]> {
  if (!ids.length) return [];
  const { rows } = await db.query(`DELETE FROM clubs.media WHERE id = ANY($1::uuid[]) RETURNING *`, [ids]);
  return rows.map(mapMedia);
}

export async function countRecentUploads(userId: string, since: Date): Promise<number> {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM clubs.media WHERE uploader_id = $1 AND created_at >= $2`, [userId, since]);
  return rows[0].n;
}

/** Uploads never attached to anything, for clean-up. */
export async function listStalePendingMedia(before: Date, limit = 100): Promise<MediaRow[]> {
  const { rows } = await pool.query(`SELECT * FROM clubs.media WHERE status = 'PENDING' AND created_at < $1 ORDER BY created_at LIMIT $2`, [before, limit]);
  return rows.map(mapMedia);
}

// ── Posts ───────────────────────────────────────────────────────────────

export async function insertPost(db: Db, p: {
  clubId: string; authorId: string; kind: PostKind; body: string; sessionId: string | null; activityId: string | null;
  weightChangeKg: number | null; hasPr: boolean; mediaId: string | null;
}): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO clubs.posts (club_id, author_id, kind, body, session_id, activity_id, weight_change_kg, has_pr, media_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [p.clubId, p.authorId, p.kind, p.body, p.sessionId, p.activityId, p.weightChangeKg, p.hasPr, p.mediaId],
  );
  return rows[0].id;
}

/** Includes deleted posts, so callers can tell "deleted" from "never existed". */
export async function getPost(id: string, db: Db = pool): Promise<PostRow | null> {
  const { rows } = await db.query(`${POST_SELECT} WHERE p.id = $1`, [id]);
  return rows[0] ? mapPost(rows[0]) : null;
}

const FILTER_SQL: Record<FeedFilter, string> = {
  ALL: "",
  WINS: `AND (p.has_pr OR p.kind IN ('CHALLENGE_WIN','PROGRESS'))`,
  COACH_VIDEOS: `AND p.kind = 'COACH_VIDEO'`,
  CHALLENGES: `AND p.kind = 'CHALLENGE_WIN'`,
};

/** Newest first. `before` is the last post of the previous page. */
export async function listFeed(clubId: string, filter: FeedFilter, before: { createdAt: Date; id: string } | null, limit: number): Promise<PostRow[]> {
  const { rows } = await pool.query(
    `${POST_SELECT}
      WHERE p.club_id = $1 AND p.deleted_at IS NULL ${FILTER_SQL[filter]}
        AND ($2::timestamptz IS NULL OR (p.created_at, p.id) < ($2::timestamptz, $3::uuid))
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT $4`,
    [clubId, before?.createdAt ?? null, before?.id ?? null, limit],
  );
  return rows.map(mapPost);
}

export async function updatePostBody(id: string, body: string) {
  await pool.query(`UPDATE clubs.posts SET body = $2, edited_at = now() WHERE id = $1 AND deleted_at IS NULL`, [id, body]);
}

/**
 * Soft-deletes posts and detaches their media (and any coach video replies on
 * them). Returns the media ids, so the rows and files can be removed.
 */
export async function deletePosts(db: Db, where: { id: string } | { clubId: string; authorId: string }, by: string): Promise<string[]> {
  const [cond, args] = "id" in where ? ["id = $1", [where.id]] : ["club_id = $1 AND author_id = $2", [where.clubId, where.authorId]];
  const { rows } = await db.query(
    `WITH old AS (SELECT id, media_id FROM clubs.posts WHERE ${cond} AND deleted_at IS NULL FOR UPDATE)
     UPDATE clubs.posts p SET deleted_at = now(), deleted_by = $${args.length + 1}, media_id = NULL FROM old WHERE p.id = old.id
     RETURNING p.id, old.media_id`,
    [...args, by],
  );
  const media: string[] = rows.map((r) => r.media_id).filter(Boolean);
  if (rows.length) {
    const c = await db.query(
      `WITH old AS (SELECT id, media_id FROM clubs.comments WHERE post_id = ANY($1::uuid[]) AND media_id IS NOT NULL FOR UPDATE)
       UPDATE clubs.comments c SET media_id = NULL FROM old WHERE c.id = old.id RETURNING old.media_id`,
      [rows.map((r) => r.id)],
    );
    media.push(...c.rows.map((r) => r.media_id));
  }
  return media;
}

export interface PostStats { reactions: { reaction: Reaction; count: number }[]; mine: Reaction | null; commentCount: number }

export async function postStats(postIds: string[], viewerId: string): Promise<Map<string, PostStats>> {
  const out = new Map<string, PostStats>(postIds.map((id) => [id, { reactions: [], mine: null, commentCount: 0 }]));
  if (!postIds.length) return out;
  const [r, c] = await Promise.all([
    pool.query(
      `SELECT post_id, reaction, count(*)::int AS n, bool_or(user_id = $2) AS mine FROM clubs.reactions WHERE post_id = ANY($1::uuid[])
        GROUP BY post_id, reaction ORDER BY count(*) DESC, reaction`,
      [postIds, viewerId],
    ),
    pool.query(`SELECT post_id, count(*)::int AS n FROM clubs.comments WHERE post_id = ANY($1::uuid[]) AND deleted_at IS NULL GROUP BY post_id`, [postIds]),
  ]);
  for (const row of r.rows) {
    const s = out.get(row.post_id)!;
    s.reactions.push({ reaction: row.reaction, count: row.n });
    if (row.mine) s.mine = row.reaction;
  }
  for (const row of c.rows) out.get(row.post_id)!.commentCount = row.n;
  return out;
}

/** Clubs that already have a post of this log, to leave out of the share prompt. */
export async function clubsWithPostOf(authorId: string, link: { sessionId: string } | { activityId: string }): Promise<Set<string>> {
  const [col, id] = "sessionId" in link ? ["session_id", link.sessionId] : ["activity_id", link.activityId];
  const { rows } = await pool.query(`SELECT club_id FROM clubs.posts WHERE author_id = $1 AND ${col} = $2 AND deleted_at IS NULL`, [authorId, id]);
  return new Set(rows.map((r) => r.club_id));
}

// ── Reactions and comments ──────────────────────────────────────────────

export async function setReaction(postId: string, userId: string, reaction: Reaction | null) {
  if (reaction === null) {
    await pool.query(`DELETE FROM clubs.reactions WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
    return;
  }
  await pool.query(
    `INSERT INTO clubs.reactions (post_id, user_id, reaction) VALUES ($1,$2,$3)
     ON CONFLICT (post_id, user_id) DO UPDATE SET reaction = EXCLUDED.reaction, created_at = now()`,
    [postId, userId, reaction],
  );
}

const COMMENT_SELECT = `
  SELECT c.*, u.display_name AS author_name, m.is_admin, m.is_coach, m.status
    FROM clubs.comments c
    JOIN clubs.posts p ON p.id = c.post_id
    JOIN identity.users u ON u.id = c.author_id
    LEFT JOIN clubs.memberships m ON m.club_id = p.club_id AND m.user_id = c.author_id`;

export async function insertComment(db: Db, c: { postId: string; authorId: string; body: string; mediaId: string | null }): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO clubs.comments (post_id, author_id, body, media_id) VALUES ($1,$2,$3,$4) RETURNING id`,
    [c.postId, c.authorId, c.body, c.mediaId],
  );
  return rows[0].id;
}

export async function getComment(id: string): Promise<(CommentRow & { deleted: boolean }) | null> {
  const { rows } = await pool.query(`${COMMENT_SELECT} WHERE c.id = $1`, [id]);
  return rows[0] ? { ...mapComment(rows[0]), deleted: rows[0].deleted_at !== null } : null;
}

export async function listComments(postId: string): Promise<CommentRow[]> {
  const { rows } = await pool.query(`${COMMENT_SELECT} WHERE c.post_id = $1 AND c.deleted_at IS NULL ORDER BY c.created_at`, [postId]);
  return rows.map(mapComment);
}

/** Returns the comment's media id, if any, so the file can be removed. */
export async function deleteComment(db: Db, id: string): Promise<string | null> {
  const { rows } = await db.query(
    `WITH old AS (SELECT id, media_id FROM clubs.comments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE)
     UPDATE clubs.comments c SET deleted_at = now(), media_id = NULL FROM old WHERE c.id = old.id RETURNING old.media_id`,
    [id],
  );
  return rows[0]?.media_id ?? null;
}

// ── Reports ─────────────────────────────────────────────────────────────

/** False when this person already has an open report on it. */
export async function insertReport(r: { clubId: string; postId: string; commentId: string | null; reporterId: string; reason: string }): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO clubs.reports (club_id, post_id, comment_id, reporter_id, reason) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
    [r.clubId, r.postId, r.commentId, r.reporterId, r.reason],
  );
  return rowCount === 1;
}

export interface OpenReportRow {
  id: string;
  clubId: string;
  clubName: string;
  postId: string;
  commentId: string | null;
  reason: string;
  createdAt: Date;
  reporterName: string;
  /** How many open reports the same post or comment has. */
  reportCount: number;
}

export async function listOpenReports(): Promise<OpenReportRow[]> {
  const { rows } = await pool.query(
    `SELECT r.id, r.club_id, c.name AS club_name, r.post_id, r.comment_id, r.reason, r.created_at, u.display_name AS reporter_name,
            count(*) OVER (PARTITION BY r.post_id, r.comment_id)::int AS report_count
       FROM clubs.reports r JOIN clubs.clubs c ON c.id = r.club_id JOIN identity.users u ON u.id = r.reporter_id
      WHERE r.resolved_at IS NULL
      ORDER BY r.created_at`,
  );
  return rows.map((r) => ({
    id: r.id, clubId: r.club_id, clubName: r.club_name, postId: r.post_id, commentId: r.comment_id, reason: r.reason,
    createdAt: r.created_at, reporterName: r.reporter_name, reportCount: r.report_count,
  }));
}

export async function getReport(id: string): Promise<{ id: string; postId: string; commentId: string | null; resolvedAt: Date | null } | null> {
  const { rows } = await pool.query(`SELECT id, post_id, comment_id, resolved_at FROM clubs.reports WHERE id = $1`, [id]);
  return rows[0] ? { id: rows[0].id, postId: rows[0].post_id, commentId: rows[0].comment_id, resolvedAt: rows[0].resolved_at } : null;
}

/** Resolves every open report on the same post or comment. */
export async function resolveReports(db: Db, item: { postId: string; commentId: string | null }, by: string, outcome: "REMOVED" | "DISMISSED") {
  await db.query(
    `UPDATE clubs.reports SET resolved_at = now(), resolved_by = $3, outcome = $4
      WHERE resolved_at IS NULL AND post_id = $1 AND comment_id IS NOT DISTINCT FROM $2`,
    [item.postId, item.commentId, by, outcome],
  );
}

// ── Members' settings and the club photo ────────────────────────────────

export async function setAskToShare(clubId: string, userId: string, on: boolean) {
  await pool.query(`UPDATE clubs.memberships SET ask_to_share = $3, updated_at = now() WHERE club_id = $1 AND user_id = $2`, [clubId, userId, on]);
}

export async function getAskToShare(clubId: string, userId: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT ask_to_share FROM clubs.memberships WHERE club_id = $1 AND user_id = $2`, [clubId, userId]);
  return rows[0]?.ask_to_share ?? true;
}

/** Open clubs where the user is active and wants to be asked. */
export async function listShareClubs(userId: string): Promise<{ id: string; name: string }[]> {
  const { rows } = await pool.query(
    `SELECT c.id, c.name FROM clubs.memberships m JOIN clubs.clubs c ON c.id = m.club_id
      WHERE m.user_id = $1 AND m.status = 'ACTIVE' AND m.ask_to_share AND c.closed_at IS NULL ORDER BY c.name`,
    [userId],
  );
  return rows;
}

/** Sets the photo and returns the one it replaced. */
export async function setClubPhoto(db: Db, clubId: string, mediaId: string | null): Promise<string | null> {
  const { rows } = await db.query(
    `WITH old AS (SELECT id, photo_media_id FROM clubs.clubs WHERE id = $1 FOR UPDATE)
     UPDATE clubs.clubs c SET photo_media_id = $2 FROM old WHERE c.id = old.id RETURNING old.photo_media_id AS old`,
    [clubId, mediaId],
  );
  return rows[0]?.old ?? null;
}

export async function getClubPhotoId(clubId: string): Promise<string | null> {
  const { rows } = await pool.query(`SELECT photo_media_id FROM clubs.clubs WHERE id = $1`, [clubId]);
  return rows[0]?.photo_media_id ?? null;
}
