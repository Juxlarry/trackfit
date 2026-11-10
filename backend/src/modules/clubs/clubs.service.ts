import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../../shared/db/pool.js";
import { getMailer, type OutgoingEmail } from "../../shared/email/mailer.js";
import { badInput, forbidden, notFound } from "../../shared/errors.js";
import { findUserById, type UserRow } from "../identity/identity.repository.js";
import { sendPushToUser } from "../notifications/push.js";
import { inviteEmail, joinRequestEmail } from "./club-emails.js";
import {
  activateMembership, activeMemberEmails, closeClub, countMembers, endMembership, getClub, getInvite, getInviteByToken, getJoinLink, getJoinLinkByToken,
  findActiveMemberByEmail, getMembership, insertClub, insertJoinLink, listAdminIds, listInvitesForEmail, listOpenInvites, lockClub, logEvent, markInviteAccepted,
  revokeInvite, revokeJoinLink, setRoles, upsertInvite, upsertMembership, useJoinLink,
  type ClubRow, type InviteRow, type JoinLinkRow, type MemberRow, type MemberStatus,
} from "./clubs.repository.js";

/**
 * Clubs v1, first build step (README "Clubs v1"): clubs are created from the
 * console, people join by email invite or by a join link an Admin approves,
 * and Admins (at most 3, never 0 once there is one) appoint Admins and Coaches.
 *
 * Every change to who is in a club or who runs it happens in a transaction
 * that first locks the club row (lockClub), so the count checks below can't
 * race each other.
 */
export const CLUB_LIMITS = { maxAdmins: 3, maxMembers: 50, linkDays: 7, maxLinkUses: 50, maxInvitesAtOnce: 50 };

/** CLUBS_ENABLED=false is the emergency stop: Clubs disappears everywhere. */
export function clubsEnabled(): boolean {
  return process.env.CLUBS_ENABLED !== "false";
}

export function assertClubsOn(): void {
  if (!clubsEnabled()) throw forbidden("Clubs are switched off right now.");
}

const APP_URL = () => process.env.APP_URL ?? "http://localhost:5173";
export const joinUrl = (token: string) => `${APP_URL()}/join/${token}`;
const newToken = () => randomBytes(18).toString("base64url");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function normaliseEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) throw badInput(`"${raw.trim()}" isn't an email address.`, [{ field: "email", message: "Check the address." }]);
  return email;
}

/** "k•••@example.com": enough to recognise your own address, not to learn someone else's. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  return `${name[0]}•••@${domain}`;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Email failures are logged, never fatal: the invite or request is already saved. */
async function sendQuietly(email: OutgoingEmail) {
  try {
    await getMailer().send(email);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Club email failed", err);
  }
}

function checkClubText(name: string, description: string | null) {
  const n = name.trim();
  if (n.length < 2 || n.length > 60) throw badInput("A club name needs 2 to 60 characters.", [{ field: "name", message: "2 to 60 characters." }]);
  const d = description?.trim() || null;
  if (d && d.length > 500) throw badInput("Keep the description under 500 characters.", [{ field: "description", message: "Up to 500 characters." }]);
  return { name: n, description: d };
}

// ── Who can see what ────────────────────────────────────────────────────

/** An open club the user is an active member of. Anything else looks like "not found". */
export async function requireActiveMember(clubId: string, userId: string): Promise<{ club: ClubRow; member: MemberRow }> {
  const [club, member] = await Promise.all([getClub(clubId), getMembership(clubId, userId)]);
  if (!club || club.closedAt || !member || member.status !== "ACTIVE") throw notFound("Club not found.");
  return { club, member };
}

export async function requireClubAdmin(clubId: string, userId: string): Promise<{ club: ClubRow; member: MemberRow }> {
  const r = await requireActiveMember(clubId, userId);
  if (!r.member.isAdmin) throw forbidden("Only the club's Admins can do this.");
  return r;
}

/** Inside a transaction, after lockClub. */
async function lockedAdmin(c: PoolClient, clubId: string, userId: string): Promise<ClubRow> {
  const club = await lockClub(c, clubId);
  const me = await getMembership(clubId, userId, c);
  if (!club || club.closedAt || !me || me.status !== "ACTIVE") throw notFound("Club not found.");
  if (!me.isAdmin) throw forbidden("Only the club's Admins can do this.");
  return club;
}

// ── Console (App Owner and App Admins; the caller is checked by the resolver) ──

export async function createClub(actor: UserRow, input: { name: string; description?: string | null; firstAdminEmail: string }): Promise<ClubRow> {
  const { name, description } = checkClubText(input.name, input.description ?? null);
  const email = normaliseEmail(input.firstAdminEmail);
  const { club, invite } = await tx(async (c) => {
    const club = await insertClub(c, { name, description, createdBy: actor.id });
    await logEvent(c, { clubId: club.id, userId: null, actorId: actor.id, event: "CLUB_CREATED" });
    const { invite } = await upsertInvite(c, { clubId: club.id, email, token: newToken(), asAdmin: true, invitedBy: actor.id });
    await logEvent(c, { clubId: club.id, userId: null, actorId: actor.id, event: "INVITED", detail: `${email} as Admin` });
    return { club, invite };
  });
  await sendQuietly(inviteEmail({ to: email, clubName: club.name, inviterName: actor.displayName, asAdmin: true, url: joinUrl(invite.token) }));
  return club;
}

export async function closeClubFromConsole(actor: UserRow, clubId: string) {
  await tx(async (c) => {
    const club = await lockClub(c, clubId);
    if (!club) throw notFound("Club not found.");
    if (club.closedAt) return;
    await closeClub(c, clubId);
    await logEvent(c, { clubId, userId: null, actorId: actor.id, event: "CLUB_CLOSED" });
  });
}

/**
 * For a club that's stuck (its Admins are gone or unreachable): makes an
 * existing member an Admin, or sends an Admin invite to a new email.
 */
export async function addAdminFromConsole(actor: UserRow, clubId: string, rawEmail: string) {
  const email = normaliseEmail(rawEmail);
  const sendInvite = await tx(async (c) => {
    const club = await lockClub(c, clubId);
    if (!club || club.closedAt) throw notFound("Club not found.");
    const member = await findActiveMemberByEmail(c, clubId, email);
    if (member) {
      if (member.isAdmin) throw badInput("That person is already an Admin of this club.");
      const { admins } = await countMembers(c, clubId);
      if (admins >= CLUB_LIMITS.maxAdmins) throw badInput(`This club already has ${CLUB_LIMITS.maxAdmins} Admins. Remove one first.`);
      await setRoles(c, clubId, member.userId, { isAdmin: true, isCoach: member.isCoach });
      await logEvent(c, { clubId, userId: member.userId, actorId: actor.id, event: "ADMIN_ADDED", detail: "from the console" });
      return null;
    }
    const { invite } = await upsertInvite(c, { clubId, email, token: newToken(), asAdmin: true, invitedBy: actor.id });
    await logEvent(c, { clubId, userId: null, actorId: actor.id, event: "INVITED", detail: `${email} as Admin, from the console` });
    return { invite, clubName: club.name };
  });
  if (sendInvite) {
    await sendQuietly(inviteEmail({ to: email, clubName: sendInvite.clubName, inviterName: actor.displayName, asAdmin: true, url: joinUrl(sendInvite.invite.token) }));
  }
}

// ── Invites and join links (club Admins) ────────────────────────────────

export async function inviteMembers(actor: UserRow, clubId: string, rawEmails: string[]): Promise<InviteRow[]> {
  const emails = [...new Set(rawEmails.map((e) => e.trim()).filter(Boolean).map(normaliseEmail))];
  if (!emails.length) throw badInput("Add at least one email address.", [{ field: "emails", message: "Add an email." }]);
  if (emails.length > CLUB_LIMITS.maxInvitesAtOnce) throw badInput(`Invite up to ${CLUB_LIMITS.maxInvitesAtOnce} people at a time.`);
  const { club, created } = await tx(async (c) => {
    const club = await lockedAdmin(c, clubId, actor.id);
    const already = await activeMemberEmails(c, clubId, emails);
    const created: InviteRow[] = [];
    for (const email of emails) {
      if (already.has(email)) continue;
      const r = await upsertInvite(c, { clubId, email, token: newToken(), asAdmin: false, invitedBy: actor.id });
      if (r.created) {
        created.push(r.invite);
        await logEvent(c, { clubId, userId: null, actorId: actor.id, event: "INVITED", detail: email });
      }
    }
    return { club, created };
  });
  for (const i of created) {
    await sendQuietly(inviteEmail({ to: i.email, clubName: club.name, inviterName: actor.displayName, asAdmin: false, url: joinUrl(i.token) }));
  }
  return listOpenInvites(clubId);
}

export async function revokeClubInvite(actor: UserRow, inviteId: string): Promise<string> {
  const invite = await getInvite(inviteId);
  if (!invite) throw notFound("Invite not found.");
  await tx(async (c) => {
    await lockedAdmin(c, invite.clubId, actor.id);
    await revokeInvite(c, inviteId);
    await logEvent(c, { clubId: invite.clubId, userId: null, actorId: actor.id, event: "INVITE_REVOKED", detail: invite.email });
  });
  return invite.clubId;
}

export async function createJoinLink(actor: UserRow, clubId: string, maxUses?: number | null): Promise<JoinLinkRow> {
  const uses = maxUses ?? CLUB_LIMITS.maxLinkUses;
  if (!Number.isInteger(uses) || uses < 1 || uses > CLUB_LIMITS.maxLinkUses) {
    throw badInput(`A link can be used 1 to ${CLUB_LIMITS.maxLinkUses} times.`, [{ field: "maxUses", message: `1 to ${CLUB_LIMITS.maxLinkUses}.` }]);
  }
  return tx(async (c) => {
    await lockedAdmin(c, clubId, actor.id);
    return insertJoinLink(c, {
      clubId, token: newToken(), createdBy: actor.id, maxUses: uses,
      expiresAt: new Date(Date.now() + CLUB_LIMITS.linkDays * 24 * 60 * 60 * 1000),
    });
  });
}

export async function turnOffJoinLink(actor: UserRow, linkId: string): Promise<string> {
  const link = await getJoinLink(linkId);
  if (!link) throw notFound("Link not found.");
  await tx(async (c) => {
    await lockedAdmin(c, link.clubId, actor.id);
    await revokeJoinLink(c, linkId);
  });
  return link.clubId;
}

function linkProblem(link: JoinLinkRow): string | null {
  if (link.revokedAt) return "This link was turned off by the club's Admins.";
  if (link.expiresAt.getTime() <= Date.now()) return "This link has expired. Ask the club's Admins for a new one.";
  if (link.uses >= link.maxUses) return "This link has been used as many times as allowed. Ask the club's Admins for a new one.";
  return null;
}

function inviteProblem(invite: InviteRow): string | null {
  if (invite.acceptedAt) return "This invite has already been used.";
  if (invite.revokedAt) return "This invite was withdrawn by the club's Admins.";
  return null;
}

// ── Joining ─────────────────────────────────────────────────────────────

export interface JoinPreview {
  clubName: string;
  description: string | null;
  kind: "INVITE" | "LINK";
  asAdmin: boolean;
  /** Null when the link or invite can be used. */
  problem: string | null;
  /** For invites: whose address it was sent to, masked. */
  emailHint: string | null;
  /** The caller's current status in this club, when signed in. */
  myStatus: MemberStatus | null;
  clubId: string | null;
}

/** What the join page shows before anyone signs in. Unknown tokens look the same as a bad link. */
export async function joinPreview(token: string, userId: string | null): Promise<JoinPreview | null> {
  const invite = await getInviteByToken(token);
  const link = invite ? null : await getJoinLinkByToken(token);
  const clubId = invite?.clubId ?? link?.clubId;
  if (!clubId) return null;
  const club = await getClub(clubId);
  if (!club) return null;
  const member = userId ? await getMembership(clubId, userId) : null;
  const problem = club.closedAt ? "This club has closed." : invite ? inviteProblem(invite) : linkProblem(link!);
  return {
    clubName: club.name, description: club.description, kind: invite ? "INVITE" : "LINK", asAdmin: invite?.asAdmin ?? false,
    problem, emailHint: invite ? maskEmail(invite.email) : null, myStatus: member?.status ?? null,
    // Only members find out the id (it's how the app opens the club page).
    clubId: member?.status === "ACTIVE" ? clubId : null,
  };
}

/**
 * Accepts an invite (joins straight away) or uses a join link (waits for an
 * Admin). Both need consent to coach visibility. An invite also needs the
 * caller to be signed in with that address, verified.
 */
export async function joinClub(user: UserRow, email: string | null, token: string, consent: boolean): Promise<{ clubId: string; status: MemberStatus }> {
  if (!consent) {
    throw badInput("To join, accept that the club's coaches will see the workouts and activities you log.", [{ field: "consent", message: "Required." }]);
  }
  const invite = await getInviteByToken(token);
  const link = invite ? null : await getJoinLinkByToken(token);
  if (!invite && !link) throw notFound("This link doesn't work. Check you copied all of it, or ask the club's Admins for a new one.");
  const clubId = (invite?.clubId ?? link?.clubId)!;

  if (invite) {
    if (!email) throw forbidden("Confirm your email address first: open the confirmation email TrackFit sent you, then try again.");
    if (email !== invite.email) throw forbidden(`This invite was sent to ${maskEmail(invite.email)}. Sign in with that address to accept it.`);
  }

  const out = await tx(async (c) => {
    const club = await lockClub(c, clubId);
    if (!club || club.closedAt) throw badInput("This club has closed.");
    const existing = await getMembership(clubId, user.id, c);
    const { active, admins } = await countMembers(c, clubId);

    if (invite) {
      const fresh = (await getInvite(invite.id, c))!;
      const problem = inviteProblem(fresh);
      if (problem) throw badInput(problem);
      const makeAdmin = fresh.asAdmin && admins < CLUB_LIMITS.maxAdmins;
      if (existing?.status === "ACTIVE") {
        if (makeAdmin && !existing.isAdmin) {
          await setRoles(c, clubId, user.id, { isAdmin: true, isCoach: existing.isCoach });
          await logEvent(c, { clubId, userId: user.id, actorId: user.id, event: "ADMIN_ADDED", detail: "from an Admin invite" });
        }
        await markInviteAccepted(c, invite.id);
        return { clubId, status: "ACTIVE" as const, notify: false };
      }
      if (active >= CLUB_LIMITS.maxMembers) throw badInput(`${club.name} is full (${CLUB_LIMITS.maxMembers} members).`);
      await upsertMembership(c, { clubId, userId: user.id, status: "ACTIVE", isAdmin: makeAdmin });
      await markInviteAccepted(c, invite.id);
      await logEvent(c, { clubId, userId: user.id, actorId: user.id, event: "JOINED", detail: "by invite; accepted coach visibility" });
      if (makeAdmin) await logEvent(c, { clubId, userId: user.id, actorId: user.id, event: "ADMIN_ADDED", detail: "from an Admin invite" });
      return { clubId, status: "ACTIVE" as const, notify: false };
    }

    const fresh = (await getJoinLink(link!.id, c))!;
    if (existing?.status === "ACTIVE" || existing?.status === "WAITING") return { clubId, status: existing.status, notify: false };
    const problem = linkProblem(fresh);
    if (problem) throw badInput(problem);
    if (active >= CLUB_LIMITS.maxMembers) throw badInput(`${club.name} is full (${CLUB_LIMITS.maxMembers} members).`);
    await upsertMembership(c, { clubId, userId: user.id, status: "WAITING", isAdmin: false });
    await useJoinLink(c, fresh.id);
    await logEvent(c, { clubId, userId: user.id, actorId: user.id, event: "REQUESTED", detail: "by join link; accepted coach visibility" });
    return { clubId, status: "WAITING" as const, notify: true, clubName: club.name };
  });

  if (out.notify) await notifyAdminsOfRequest(clubId, out.clubName!, user.displayName);
  return { clubId: out.clubId, status: out.status };
}

async function notifyAdminsOfRequest(clubId: string, clubName: string, requesterName: string) {
  const url = `${APP_URL()}/clubs/${clubId}`;
  for (const adminId of await listAdminIds(clubId)) {
    const admin = await findUserById(adminId);
    if (admin?.email) await sendQuietly(joinRequestEmail({ to: admin.email, clubName, requesterName, url }));
    await sendPushToUser(adminId, { title: `${requesterName} wants to join ${clubName}`, body: "Approve or decline them in the members list.", url: `/clubs/${clubId}`, tag: `club-join-${clubId}` })
      .catch(() => 0);
  }
}

/** Open invites sent to the caller's verified address. */
export async function invitesForMe(email: string | null) {
  return email ? listInvitesForEmail(email) : [];
}

export async function declineInvite(user: UserRow, email: string | null, inviteId: string) {
  const invite = await getInvite(inviteId);
  if (!invite || !email || invite.email !== email) throw notFound("Invite not found.");
  await tx(async (c) => {
    await lockClub(c, invite.clubId);
    await revokeInvite(c, inviteId);
    await logEvent(c, { clubId: invite.clubId, userId: user.id, actorId: user.id, event: "INVITE_REVOKED", detail: "declined by the invitee" });
  });
}

// ── Running the club (club Admins) ──────────────────────────────────────

export async function respondToJoinRequest(actor: UserRow, clubId: string, userId: string, approve: boolean) {
  await tx(async (c) => {
    const club = await lockedAdmin(c, clubId, actor.id);
    const target = await getMembership(clubId, userId, c);
    if (!target || target.status !== "WAITING") throw badInput("That request has already been answered.");
    if (approve) {
      const { active } = await countMembers(c, clubId);
      if (active >= CLUB_LIMITS.maxMembers) throw badInput(`${club.name} is full (${CLUB_LIMITS.maxMembers} members).`);
      await activateMembership(c, clubId, userId);
      await logEvent(c, { clubId, userId, actorId: actor.id, event: "APPROVED" });
    } else {
      await endMembership(c, clubId, userId, "DECLINED");
      await logEvent(c, { clubId, userId, actorId: actor.id, event: "DECLINED" });
    }
  });
}

/**
 * Sets someone's Admin and Coach roles (including the caller's own, e.g. an
 * Admin giving themselves Coach, or stepping down while another Admin remains).
 */
export async function setMemberRoles(actor: UserRow, clubId: string, userId: string, roles: { isAdmin: boolean; isCoach: boolean }) {
  await tx(async (c) => {
    await lockedAdmin(c, clubId, actor.id);
    const target = await getMembership(clubId, userId, c);
    if (!target || target.status !== "ACTIVE") throw badInput("That person isn't an active member of this club.");
    const { admins } = await countMembers(c, clubId);
    if (roles.isAdmin && !target.isAdmin && admins >= CLUB_LIMITS.maxAdmins) {
      throw badInput(`A club can have at most ${CLUB_LIMITS.maxAdmins} Admins.`, [{ field: "isAdmin", message: `At most ${CLUB_LIMITS.maxAdmins}.` }]);
    }
    if (!roles.isAdmin && target.isAdmin && admins <= 1) {
      throw badInput("A club needs at least one Admin. Make someone else an Admin first.", [{ field: "isAdmin", message: "Last Admin." }]);
    }
    await setRoles(c, clubId, userId, roles);
    if (roles.isAdmin !== target.isAdmin) await logEvent(c, { clubId, userId, actorId: actor.id, event: roles.isAdmin ? "ADMIN_ADDED" : "ADMIN_REMOVED" });
    if (roles.isCoach !== target.isCoach) await logEvent(c, { clubId, userId, actorId: actor.id, event: roles.isCoach ? "COACH_ADDED" : "COACH_REMOVED" });
  });
}

export async function removeMember(actor: UserRow, clubId: string, userId: string) {
  if (userId === actor.id) throw badInput("To leave the club yourself, use Leave club.");
  await tx(async (c) => {
    await lockedAdmin(c, clubId, actor.id);
    const target = await getMembership(clubId, userId, c);
    if (!target || target.status !== "ACTIVE") throw badInput("That person isn't an active member of this club.");
    await endMembership(c, clubId, userId, "REMOVED");
    await logEvent(c, { clubId, userId, actorId: actor.id, event: "REMOVED" });
  });
}

/** Leaving, or withdrawing a request that's still waiting. The last Admin can't leave. */
export async function leaveClub(user: UserRow, clubId: string) {
  await tx(async (c) => {
    const club = await lockClub(c, clubId);
    const me = club ? await getMembership(clubId, user.id, c) : null;
    if (!club || !me || (me.status !== "ACTIVE" && me.status !== "WAITING")) throw notFound("Club not found.");
    if (me.isAdmin) {
      const { admins } = await countMembers(c, clubId);
      if (admins <= 1) {
        throw badInput("You're this club's last Admin. Make someone else an Admin before you leave. If nobody else is left, ask the App Owner to close the club.");
      }
    }
    await endMembership(c, clubId, user.id, "LEFT");
    await logEvent(c, { clubId, userId: user.id, actorId: user.id, event: "LEFT" });
  });
}
