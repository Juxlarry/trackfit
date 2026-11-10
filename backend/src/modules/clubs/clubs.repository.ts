import type { PoolClient } from "pg";
import { pool } from "../../shared/db/pool.js";

type Db = PoolClient | typeof pool;

export type MemberStatus = "WAITING" | "ACTIVE" | "DECLINED" | "LEFT" | "REMOVED";
export type MembershipEvent =
  | "CLUB_CREATED" | "CLUB_CLOSED" | "INVITED" | "INVITE_REVOKED" | "REQUESTED" | "JOINED" | "APPROVED" | "DECLINED"
  | "LEFT" | "REMOVED" | "ADMIN_ADDED" | "ADMIN_REMOVED" | "COACH_ADDED" | "COACH_REMOVED";

export interface ClubRow {
  id: string;
  name: string;
  description: string | null;
  timeZone: string;
  createdAt: Date;
  closedAt: Date | null;
}

export interface MemberRow {
  clubId: string;
  userId: string;
  displayName: string;
  status: MemberStatus;
  isAdmin: boolean;
  isCoach: boolean;
  requestedAt: Date;
  joinedAt: Date | null;
}

export interface InviteRow {
  id: string;
  clubId: string;
  email: string;
  token: string;
  asAdmin: boolean;
  createdAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

export interface JoinLinkRow {
  id: string;
  clubId: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  maxUses: number;
  uses: number;
  revokedAt: Date | null;
}

const mapClub = (r: any): ClubRow => ({
  id: r.id, name: r.name, description: r.description, timeZone: r.time_zone, createdAt: r.created_at, closedAt: r.closed_at,
});
const mapMember = (r: any): MemberRow => ({
  clubId: r.club_id, userId: r.user_id, displayName: r.display_name, status: r.status, isAdmin: r.is_admin, isCoach: r.is_coach,
  requestedAt: r.requested_at, joinedAt: r.joined_at,
});
const mapInvite = (r: any): InviteRow => ({
  id: r.id, clubId: r.club_id, email: r.email, token: r.token, asAdmin: r.as_admin, createdAt: r.created_at,
  acceptedAt: r.accepted_at, revokedAt: r.revoked_at,
});
const mapLink = (r: any): JoinLinkRow => ({
  id: r.id, clubId: r.club_id, token: r.token, createdAt: r.created_at, expiresAt: r.expires_at, maxUses: r.max_uses,
  uses: r.uses, revokedAt: r.revoked_at,
});

const MEMBER_SELECT = `SELECT m.*, u.display_name FROM clubs.memberships m JOIN identity.users u ON u.id = m.user_id`;

// ── Clubs ───────────────────────────────────────────────────────────────

export async function insertClub(db: Db, c: { name: string; description: string | null; createdBy: string }): Promise<ClubRow> {
  const { rows } = await db.query(
    `INSERT INTO clubs.clubs (name, description, created_by) VALUES ($1, $2, $3) RETURNING *`,
    [c.name, c.description, c.createdBy],
  );
  return mapClub(rows[0]);
}

export async function getClub(id: string, db: Db = pool): Promise<ClubRow | null> {
  const { rows } = await db.query(`SELECT * FROM clubs.clubs WHERE id = $1`, [id]);
  return rows[0] ? mapClub(rows[0]) : null;
}

/**
 * Locks the club row for the rest of the transaction. Every change to who is
 * in a club, or who runs it, takes this first, so two changes can't both pass
 * a count check (e.g. the last two Admins leaving at the same moment).
 */
export async function lockClub(db: PoolClient, id: string): Promise<ClubRow | null> {
  const { rows } = await db.query(`SELECT * FROM clubs.clubs WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0] ? mapClub(rows[0]) : null;
}

export async function closeClub(db: Db, id: string) {
  await db.query(`UPDATE clubs.clubs SET closed_at = now() WHERE id = $1 AND closed_at IS NULL`, [id]);
}

/** Open clubs where the user is active or waiting for approval. */
export async function listClubsForUser(userId: string): Promise<(ClubRow & { status: MemberStatus })[]> {
  const { rows } = await pool.query(
    `SELECT c.*, m.status FROM clubs.clubs c JOIN clubs.memberships m ON m.club_id = c.id
      WHERE m.user_id = $1 AND m.status IN ('ACTIVE','WAITING') AND c.closed_at IS NULL
      ORDER BY c.name`,
    [userId],
  );
  return rows.map((r) => ({ ...mapClub(r), status: r.status }));
}

export interface ConsoleClubRow extends ClubRow {
  memberCount: number;
  adminCount: number;
  /** Emails with an open Admin invite (the named first Admin, until they join). */
  pendingAdminEmails: string[];
}

export async function listAllClubs(): Promise<ConsoleClubRow[]> {
  const { rows } = await pool.query(
    `SELECT c.*,
            (SELECT count(*)::int FROM clubs.memberships m WHERE m.club_id = c.id AND m.status = 'ACTIVE') AS member_count,
            (SELECT count(*)::int FROM clubs.memberships m WHERE m.club_id = c.id AND m.status = 'ACTIVE' AND m.is_admin) AS admin_count,
            ARRAY(SELECT i.email FROM clubs.invites i
                   WHERE i.club_id = c.id AND i.as_admin AND i.accepted_at IS NULL AND i.revoked_at IS NULL ORDER BY i.created_at) AS pending_admins
       FROM clubs.clubs c
      ORDER BY c.closed_at IS NOT NULL, c.created_at DESC`,
  );
  return rows.map((r) => ({ ...mapClub(r), memberCount: r.member_count, adminCount: r.admin_count, pendingAdminEmails: r.pending_admins }));
}

// ── Memberships ─────────────────────────────────────────────────────────

export async function getMembership(clubId: string, userId: string, db: Db = pool): Promise<MemberRow | null> {
  const { rows } = await db.query(`${MEMBER_SELECT} WHERE m.club_id = $1 AND m.user_id = $2`, [clubId, userId]);
  return rows[0] ? mapMember(rows[0]) : null;
}

/** Admins first, then coaches, then everyone else by name. */
export async function listMembers(clubId: string, status: MemberStatus, db: Db = pool): Promise<MemberRow[]> {
  const { rows } = await db.query(
    `${MEMBER_SELECT} WHERE m.club_id = $1 AND m.status = $2
      ORDER BY m.is_admin DESC, m.is_coach DESC, lower(u.display_name), m.requested_at`,
    [clubId, status],
  );
  return rows.map(mapMember);
}

export async function countMembers(db: Db, clubId: string): Promise<{ active: number; admins: number }> {
  const { rows } = await db.query(
    `SELECT count(*)::int AS active, count(*) FILTER (WHERE is_admin)::int AS admins
       FROM clubs.memberships WHERE club_id = $1 AND status = 'ACTIVE'`,
    [clubId],
  );
  return rows[0];
}

/**
 * Joins or asks to join. A row left from an earlier membership (left, removed,
 * declined) is reused, with fresh consent and dates.
 */
export async function upsertMembership(db: Db, m: { clubId: string; userId: string; status: "WAITING" | "ACTIVE"; isAdmin: boolean }) {
  await db.query(
    `INSERT INTO clubs.memberships (club_id, user_id, status, is_admin, consented_at, requested_at, joined_at)
     VALUES ($1, $2, $3, $4, now(), now(), CASE WHEN $3 = 'ACTIVE' THEN now() END)
     ON CONFLICT (club_id, user_id) DO UPDATE
       SET status = $3, is_admin = $4, is_coach = false, consented_at = now(), requested_at = now(),
           joined_at = CASE WHEN $3 = 'ACTIVE' THEN now() END, updated_at = now()`,
    [m.clubId, m.userId, m.status, m.isAdmin],
  );
}

/** Approve a waiting member. */
export async function activateMembership(db: Db, clubId: string, userId: string) {
  await db.query(
    `UPDATE clubs.memberships SET status = 'ACTIVE', joined_at = now(), updated_at = now() WHERE club_id = $1 AND user_id = $2`,
    [clubId, userId],
  );
}

/** Leaving, removal or a declined request: roles go with it. */
export async function endMembership(db: Db, clubId: string, userId: string, status: "LEFT" | "REMOVED" | "DECLINED") {
  await db.query(
    `UPDATE clubs.memberships SET status = $3, is_admin = false, is_coach = false, updated_at = now() WHERE club_id = $1 AND user_id = $2`,
    [clubId, userId, status],
  );
}

export async function setRoles(db: Db, clubId: string, userId: string, roles: { isAdmin: boolean; isCoach: boolean }) {
  await db.query(
    `UPDATE clubs.memberships SET is_admin = $3, is_coach = $4, updated_at = now() WHERE club_id = $1 AND user_id = $2`,
    [clubId, userId, roles.isAdmin, roles.isCoach],
  );
}

/** The active member signed up with this email, if any. */
export async function findActiveMemberByEmail(db: Db, clubId: string, email: string): Promise<MemberRow | null> {
  const { rows } = await db.query(`${MEMBER_SELECT} WHERE m.club_id = $1 AND m.status = 'ACTIVE' AND lower(u.email) = $2`, [clubId, email]);
  return rows[0] ? mapMember(rows[0]) : null;
}

/** Which of these emails already belong to active members. */
export async function activeMemberEmails(db: Db, clubId: string, emails: string[]): Promise<Set<string>> {
  const { rows } = await db.query(
    `SELECT lower(u.email) AS email FROM clubs.memberships m JOIN identity.users u ON u.id = m.user_id
      WHERE m.club_id = $1 AND m.status = 'ACTIVE' AND lower(u.email) = ANY($2)`,
    [clubId, emails],
  );
  return new Set(rows.map((r) => r.email as string));
}

export async function listAdminIds(clubId: string): Promise<string[]> {
  const { rows } = await pool.query(`SELECT user_id FROM clubs.memberships WHERE club_id = $1 AND status = 'ACTIVE' AND is_admin`, [clubId]);
  return rows.map((r) => r.user_id);
}

/** Open clubs the user is in or waiting for: whether Clubs shows in their menu. */
export async function hasOpenMembership(userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM clubs.memberships m JOIN clubs.clubs c ON c.id = m.club_id
      WHERE m.user_id = $1 AND m.status IN ('ACTIVE','WAITING') AND c.closed_at IS NULL LIMIT 1`,
    [userId],
  );
  return rows.length > 0;
}

export async function logEvent(db: Db, e: { clubId: string; userId: string | null; actorId: string | null; event: MembershipEvent; detail?: string }) {
  await db.query(
    `INSERT INTO clubs.membership_events (club_id, user_id, actor_id, event, detail) VALUES ($1, $2, $3, $4, $5)`,
    [e.clubId, e.userId, e.actorId, e.event, e.detail ?? null],
  );
}

// ── Invites ─────────────────────────────────────────────────────────────

/** Creates an invite, or returns the one already open for that email (upgraded to Admin if asked). */
export async function upsertInvite(db: Db, i: { clubId: string; email: string; token: string; asAdmin: boolean; invitedBy: string }): Promise<{ invite: InviteRow; created: boolean }> {
  const { rows } = await db.query(
    `INSERT INTO clubs.invites (club_id, email, token, as_admin, invited_by) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (club_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL
     DO UPDATE SET as_admin = clubs.invites.as_admin OR EXCLUDED.as_admin
     RETURNING *, (xmax = 0) AS created`,
    [i.clubId, i.email, i.token, i.asAdmin, i.invitedBy],
  );
  return { invite: mapInvite(rows[0]), created: rows[0].created };
}

export async function listOpenInvites(clubId: string): Promise<InviteRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM clubs.invites WHERE club_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL ORDER BY created_at`,
    [clubId],
  );
  return rows.map(mapInvite);
}

/** Open invites for this email to clubs that are still open. */
export async function listInvitesForEmail(email: string): Promise<(InviteRow & { clubName: string })[]> {
  const { rows } = await pool.query(
    `SELECT i.*, c.name AS club_name FROM clubs.invites i JOIN clubs.clubs c ON c.id = i.club_id
      WHERE i.email = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND c.closed_at IS NULL
      ORDER BY i.created_at`,
    [email],
  );
  return rows.map((r) => ({ ...mapInvite(r), clubName: r.club_name }));
}

export async function getInvite(id: string, db: Db = pool): Promise<InviteRow | null> {
  const { rows } = await db.query(`SELECT * FROM clubs.invites WHERE id = $1`, [id]);
  return rows[0] ? mapInvite(rows[0]) : null;
}

export async function getInviteByToken(token: string, db: Db = pool): Promise<InviteRow | null> {
  const { rows } = await db.query(`SELECT * FROM clubs.invites WHERE token = $1`, [token]);
  return rows[0] ? mapInvite(rows[0]) : null;
}

export async function markInviteAccepted(db: Db, id: string) {
  await db.query(`UPDATE clubs.invites SET accepted_at = now() WHERE id = $1`, [id]);
}

export async function revokeInvite(db: Db, id: string) {
  await db.query(`UPDATE clubs.invites SET revoked_at = now() WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL`, [id]);
}

// ── Join links ──────────────────────────────────────────────────────────

export async function insertJoinLink(db: Db, l: { clubId: string; token: string; createdBy: string; expiresAt: Date; maxUses: number }): Promise<JoinLinkRow> {
  const { rows } = await db.query(
    `INSERT INTO clubs.join_links (club_id, token, created_by, expires_at, max_uses) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [l.clubId, l.token, l.createdBy, l.expiresAt, l.maxUses],
  );
  return mapLink(rows[0]);
}

/** Links that can still be used, newest first. */
export async function listActiveJoinLinks(clubId: string): Promise<JoinLinkRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM clubs.join_links
      WHERE club_id = $1 AND revoked_at IS NULL AND expires_at > now() AND uses < max_uses
      ORDER BY created_at DESC`,
    [clubId],
  );
  return rows.map(mapLink);
}

export async function getJoinLink(id: string, db: Db = pool): Promise<JoinLinkRow | null> {
  const { rows } = await db.query(`SELECT * FROM clubs.join_links WHERE id = $1`, [id]);
  return rows[0] ? mapLink(rows[0]) : null;
}

export async function getJoinLinkByToken(token: string, db: Db = pool): Promise<JoinLinkRow | null> {
  const { rows } = await db.query(`SELECT * FROM clubs.join_links WHERE token = $1`, [token]);
  return rows[0] ? mapLink(rows[0]) : null;
}

export async function useJoinLink(db: Db, id: string) {
  await db.query(`UPDATE clubs.join_links SET uses = uses + 1 WHERE id = $1`, [id]);
}

export async function revokeJoinLink(db: Db, id: string) {
  await db.query(`UPDATE clubs.join_links SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [id]);
}
