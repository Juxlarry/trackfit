import type { GraphQLContext } from "../../shared/auth/context.js";
import { requireUser, verifiedEmail } from "../../shared/auth/context.js";
import { notFound } from "../../shared/errors.js";
import { getAppRole } from "../identity/identity.repository.js";
import { requireAppStaff } from "../identity/identity.service.js";
import {
  hasOpenMembership, listActiveJoinLinks, listAllClubs, listClubsForUser, listMembers, listOpenInvites,
  type ClubRow, type InviteRow, type JoinLinkRow, type MemberRow,
} from "./clubs.repository.js";
import {
  CLUB_LIMITS, addAdminFromConsole, assertClubsOn, closeClubFromConsole, clubsEnabled, createClub, createJoinLink, declineInvite,
  inviteMembers, invitesForMe, joinClub, joinPreview, joinUrl, leaveClub, removeMember, requireActiveMember, respondToJoinRequest,
  revokeClubInvite, setMemberRoles, turnOffJoinLink,
} from "./clubs.service.js";

/** A Club as the resolvers below see it: the row plus the caller's membership. */
interface ClubParent extends ClubRow { viewer: MemberRow }

async function loadClub(clubId: string, userId: string): Promise<ClubParent> {
  const { club, member } = await requireActiveMember(clubId, userId);
  return { ...club, viewer: member };
}

async function consoleClub(id: string) {
  const c = (await listAllClubs()).find((x) => x.id === id);
  if (!c) throw notFound("Club not found.");
  return c;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const member = (m: MemberRow, viewerId: string) => ({ ...m, requestedAt: m.requestedAt.toISOString(), joinedAt: iso(m.joinedAt), isMe: m.userId === viewerId });

/** Every Clubs entry point: switched on, signed in. */
function caller(ctx: GraphQLContext) {
  assertClubsOn();
  return requireUser(ctx);
}

type Ctx = GraphQLContext;

export const clubsResolvers = {
  Query: {
    myClubs: (_p: unknown, _a: unknown, ctx: Ctx) => listClubsForUser(caller(ctx).id),
    myClubInvites: async (_p: unknown, _a: unknown, ctx: Ctx) => {
      caller(ctx);
      return invitesForMe(verifiedEmail(ctx));
    },
    club: async (_p: unknown, { id }: { id: string }, ctx: Ctx) => {
      const user = caller(ctx);
      try { return await loadClub(id, user.id); } catch { return null; }
    },
    joinPreview: (_p: unknown, { token }: { token: string }, ctx: Ctx) => {
      assertClubsOn();
      return joinPreview(token, ctx.user?.id ?? null);
    },
    consoleClubs: async (_p: unknown, _a: unknown, ctx: Ctx) => {
      assertClubsOn();
      await requireAppStaff(ctx);
      return listAllClubs();
    },
  },
  Mutation: {
    createClub: async (_p: unknown, { input }: { input: { name: string; description?: string | null; firstAdminEmail: string } }, ctx: Ctx) => {
      assertClubsOn();
      const { user } = await requireAppStaff(ctx);
      return consoleClub((await createClub(user, input)).id);
    },
    closeClub: async (_p: unknown, { id }: { id: string }, ctx: Ctx) => {
      assertClubsOn();
      const { user } = await requireAppStaff(ctx);
      await closeClubFromConsole(user, id);
      return consoleClub(id);
    },
    addClubAdminFromConsole: async (_p: unknown, a: { clubId: string; email: string }, ctx: Ctx) => {
      assertClubsOn();
      const { user } = await requireAppStaff(ctx);
      await addAdminFromConsole(user, a.clubId, a.email);
      return consoleClub(a.clubId);
    },

    inviteToClub: async (_p: unknown, a: { clubId: string; emails: string[] }, ctx: Ctx) => {
      const user = caller(ctx);
      await inviteMembers(user, a.clubId, a.emails);
      return loadClub(a.clubId, user.id);
    },
    revokeClubInvite: async (_p: unknown, { id }: { id: string }, ctx: Ctx) => {
      const user = caller(ctx);
      return loadClub(await revokeClubInvite(user, id), user.id);
    },
    createJoinLink: async (_p: unknown, a: { clubId: string; maxUses?: number | null }, ctx: Ctx) => {
      const user = caller(ctx);
      await createJoinLink(user, a.clubId, a.maxUses);
      return loadClub(a.clubId, user.id);
    },
    turnOffJoinLink: async (_p: unknown, { id }: { id: string }, ctx: Ctx) => {
      const user = caller(ctx);
      return loadClub(await turnOffJoinLink(user, id), user.id);
    },
    respondToJoinRequest: async (_p: unknown, a: { clubId: string; userId: string; approve: boolean }, ctx: Ctx) => {
      const user = caller(ctx);
      await respondToJoinRequest(user, a.clubId, a.userId, a.approve);
      return loadClub(a.clubId, user.id);
    },
    setClubMemberRoles: async (_p: unknown, a: { clubId: string; userId: string; isAdmin: boolean; isCoach: boolean }, ctx: Ctx) => {
      const user = caller(ctx);
      await setMemberRoles(user, a.clubId, a.userId, { isAdmin: a.isAdmin, isCoach: a.isCoach });
      return loadClub(a.clubId, user.id);
    },
    removeClubMember: async (_p: unknown, a: { clubId: string; userId: string }, ctx: Ctx) => {
      const user = caller(ctx);
      await removeMember(user, a.clubId, a.userId);
      return loadClub(a.clubId, user.id);
    },

    joinClub: (_p: unknown, a: { token: string; consent: boolean }, ctx: Ctx) => joinClub(caller(ctx), verifiedEmail(ctx), a.token, a.consent),
    declineClubInvite: async (_p: unknown, { id }: { id: string }, ctx: Ctx) => {
      await declineInvite(caller(ctx), verifiedEmail(ctx), id);
      return true;
    },
    leaveClub: async (_p: unknown, { clubId }: { clubId: string }, ctx: Ctx) => {
      await leaveClub(caller(ctx), clubId);
      return true;
    },
  },
  User: {
    // Only for the caller themselves, like appRole.
    showClubs: async (parent: { id: string }, _a: unknown, ctx: Ctx) => {
      if (!clubsEnabled() || ctx.user?.id !== parent.id) return false;
      if (await getAppRole(parent.id)) return true;
      if (await hasOpenMembership(parent.id)) return true;
      return (await invitesForMe(verifiedEmail(ctx))).length > 0;
    },
  },
  Club: {
    createdAt: (c: ClubParent) => c.createdAt.toISOString(),
    me: (c: ClubParent) => member(c.viewer, c.viewer.userId),
    members: async (c: ClubParent) => (await listMembers(c.id, "ACTIVE")).map((m) => member(m, c.viewer.userId)),
    joinRequests: async (c: ClubParent) => (c.viewer.isAdmin ? (await listMembers(c.id, "WAITING")).map((m) => member(m, c.viewer.userId)) : []),
    invites: (c: ClubParent) => (c.viewer.isAdmin ? listOpenInvites(c.id) : []),
    joinLinks: (c: ClubParent) => (c.viewer.isAdmin ? listActiveJoinLinks(c.id) : []),
    limits: () => CLUB_LIMITS,
  },
  ClubInvite: {
    createdAt: (i: InviteRow) => i.createdAt.toISOString(),
  },
  ClubJoinLink: {
    url: (l: JoinLinkRow) => joinUrl(l.token),
    expiresAt: (l: JoinLinkRow) => l.expiresAt.toISOString(),
  },
  ConsoleClub: {
    createdAt: (c: ClubRow) => c.createdAt.toISOString(),
    closedAt: (c: ClubRow) => iso(c.closedAt),
  },
};
