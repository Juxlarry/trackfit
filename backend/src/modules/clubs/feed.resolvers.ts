import type { GraphQLContext } from "../../shared/auth/context.js";
import { badInput } from "../../shared/errors.js";
import { requireAppStaff } from "../identity/identity.service.js";
import { ACTIVITY_TYPES } from "../planning/engine/index.js";
import type { ActivityLogRow, WorkoutDetail } from "../tracking/tracking.service.js";
import { getActivityLog, getWorkoutDetail } from "../tracking/tracking.service.js";
import type { MemberRow } from "./clubs.repository.js";
import { caller, loadClub } from "./clubs.resolvers.js";
import { assertClubsOn } from "./clubs.service.js";
import {
  getAskToShare, getClubPhotoId, getComment, getMedia, getPost, listComments, listFeed, listOpenReports, postStats,
  type CommentRow, type FeedFilter, type MediaPurpose, type PersonRef, type PostKind, type PostRow, type PostStats, type Reaction,
} from "./feed.repository.js";
import {
  FEED_LIMITS, addComment, coachMemberLog, coachOverview, createPosts, deleteComment, deletePost, editPost, mediaViewUrl, react, report,
  requestUpload, requirePostAccess, resolveReport, setAskToShare, setClubPhoto, shareDraft,
} from "./feed.service.js";
import { headlinePrs } from "./share-draft.js";

type Ctx = GraphQLContext;

/** A post as the resolvers below see it: the row, who's looking, and its counts. */
interface PostParent extends PostRow { viewer: MemberRow; stats: PostStats }
interface CommentParent extends CommentRow { viewer: MemberRow }

async function withStats(posts: PostRow[], viewer: MemberRow): Promise<PostParent[]> {
  const stats = await postStats(posts.map((p) => p.id), viewer.userId);
  return posts.map((p) => ({ ...p, viewer, stats: stats.get(p.id)! }));
}

async function loadPost(postId: string, userId: string): Promise<PostParent> {
  const { post, viewer } = await requirePostAccess(postId, userId);
  return (await withStats([post], viewer))[0];
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const personOut = (p: PersonRef, viewerId: string) => ({ ...p, isMe: p.userId === viewerId });

async function mediaOut(id: string | null) {
  if (!id) return null;
  const m = await getMedia(id);
  if (!m || m.status !== "READY") return null;
  return { id: m.id, kind: m.kind, url: await mediaViewUrl(m), durationSeconds: m.durationSeconds };
}

const workoutOut = (w: WorkoutDetail) => {
  const headline = headlinePrs(w.prs);
  return { ...w, startedAt: w.startedAt.toISOString(), prs: [...headline, ...w.prs.filter((p) => !headline.includes(p))] };
};
const activityOut = (a: ActivityLogRow) => ({ ...a, label: ACTIVITY_TYPES[a.activityType]?.label ?? a.activityType });

/** Feed cursor: the last post's time and id. */
const encodeCursor = (p: PostRow) => Buffer.from(`${p.createdAt.toISOString()}|${p.id}`).toString("base64url");
function decodeCursor(raw: string | null | undefined): { createdAt: Date; id: string } | null {
  if (!raw) return null;
  const [at, id] = Buffer.from(raw, "base64url").toString().split("|");
  const createdAt = new Date(at);
  if (!id || Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) throw badInput("That page link has expired. Reload the feed.");
  return { createdAt, id };
}

const FILTERS: FeedFilter[] = ["ALL", "WINS", "COACH_VIDEOS", "CHALLENGES"];

export const feedResolvers = {
  Query: {
    clubPost: async (_p: unknown, { id }: { id: string }, ctx: Ctx) => {
      const user = caller(ctx);
      try { return await loadPost(id, user.id); } catch { return null; }
    },
    clubMemberLog: async (_p: unknown, a: { clubId: string; userId: string }, ctx: Ctx) => {
      const log = await coachMemberLog(caller(ctx), a.clubId, a.userId);
      return { member: log.member, workouts: log.workouts.map(workoutOut), activities: log.activities.map(activityOut) };
    },
    clubShareDraft: (_p: unknown, a: { sessionId?: string | null; activityId?: string | null }, ctx: Ctx) => shareDraft(caller(ctx), a),
    consoleReports: async (_p: unknown, _a: unknown, ctx: Ctx) => {
      assertClubsOn();
      await requireAppStaff(ctx);
      return listOpenReports();
    },
  },
  Mutation: {
    requestClubUpload: async (_p: unknown, a: { clubId: string; purpose: MediaPurpose; contentType: string; sizeBytes: number; durationSeconds?: number | null }, ctx: Ctx) => {
      const up = await requestUpload(caller(ctx), a.clubId, a);
      return { ...up, expiresAt: up.expiresAt.toISOString(), headers: Object.entries(up.headers).map(([name, value]) => ({ name, value })) };
    },
    createClubPost: async (_p: unknown, { input }: { input: Parameters<typeof createPosts>[1] }, ctx: Ctx) => {
      const user = caller(ctx);
      const ids = await createPosts(user, input);
      return Promise.all(ids.map((id) => loadPost(id, user.id)));
    },
    editClubPost: async (_p: unknown, a: { id: string; body: string }, ctx: Ctx) => {
      const user = caller(ctx);
      await editPost(user, a.id, a.body);
      return loadPost(a.id, user.id);
    },
    deleteClubPost: async (_p: unknown, { id }: { id: string }, ctx: Ctx) => {
      await deletePost(caller(ctx), id);
      return true;
    },
    reactToClubPost: async (_p: unknown, a: { postId: string; reaction?: Reaction | null }, ctx: Ctx) => {
      const user = caller(ctx);
      await react(user, a.postId, a.reaction ?? null);
      return loadPost(a.postId, user.id);
    },
    commentOnClubPost: async (_p: unknown, a: { postId: string; body?: string | null; mediaId?: string | null }, ctx: Ctx) => {
      const user = caller(ctx);
      await addComment(user, a.postId, a.body, a.mediaId);
      return loadPost(a.postId, user.id);
    },
    deleteClubComment: async (_p: unknown, { id }: { id: string }, ctx: Ctx) => {
      const user = caller(ctx);
      return loadPost(await deleteComment(user, id), user.id);
    },
    reportClubPost: async (_p: unknown, a: { postId: string; commentId?: string | null; reason: string }, ctx: Ctx) => {
      await report(caller(ctx), a.postId, a.commentId, a.reason);
      return true;
    },
    setClubShareSetting: async (_p: unknown, a: { clubId: string; askToShare: boolean }, ctx: Ctx) => {
      const user = caller(ctx);
      await setAskToShare(user, a.clubId, a.askToShare);
      return loadClub(a.clubId, user.id);
    },
    setClubPhoto: async (_p: unknown, a: { clubId: string; mediaId?: string | null }, ctx: Ctx) => {
      const user = caller(ctx);
      await setClubPhoto(user, a.clubId, a.mediaId ?? null);
      return loadClub(a.clubId, user.id);
    },
    resolveClubReport: async (_p: unknown, a: { id: string; remove: boolean }, ctx: Ctx) => {
      assertClubsOn();
      const { user } = await requireAppStaff(ctx);
      await resolveReport(user, a.id, a.remove);
      return true;
    },
  },
  Club: {
    photoUrl: async (c: { id: string }) => (await mediaOut(await getClubPhotoId(c.id)))?.url ?? null,
    feed: async (c: { id: string; viewer: MemberRow }, a: { filter: FeedFilter; after?: string | null; limit: number }) => {
      if (!FILTERS.includes(a.filter)) throw badInput("Unknown feed filter.");
      const limit = Math.min(Math.max(a.limit, 1), 50);
      const rows = await listFeed(c.id, a.filter, decodeCursor(a.after), limit + 1);
      const page = rows.slice(0, limit);
      return { posts: await withStats(page, c.viewer), nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null };
    },
    coachOverview: async (c: { id: string; viewer: MemberRow }, _a: unknown, ctx: Ctx) => {
      const rows = await coachOverview(caller(ctx), c.id);
      return rows.map((r) => ({
        member: { ...r.member, requestedAt: r.member.requestedAt.toISOString(), joinedAt: iso(r.member.joinedAt), isMe: false },
        sessionsPerWeek: r.sessionsPerWeek, workouts: r.workoutsInWindow, activities: r.activitiesInWindow, prs: r.prsInWindow,
        lastWorkoutAt: iso(r.lastWorkoutAt), lastActivityOn: r.lastActivityOn,
      }));
    },
    feedLimits: () => ({
      imageMb: FEED_LIMITS.imageBytes / 1048576, videoMb: FEED_LIMITS.videoBytes / 1048576, videoSeconds: FEED_LIMITS.videoSeconds,
      coachVideoMb: FEED_LIMITS.coachVideoBytes / 1048576, coachVideoSeconds: FEED_LIMITS.coachVideoSeconds,
      postChars: FEED_LIMITS.postChars, commentChars: FEED_LIMITS.commentChars,
    }),
  },
  ClubMember: {
    askToShare: (m: { clubId: string; userId: string; isMe?: boolean }) => (m.isMe ? getAskToShare(m.clubId, m.userId) : null),
  },
  ClubMemberLog: {
    member: (l: { member: MemberRow }) => ({ ...l.member, requestedAt: l.member.requestedAt.toISOString(), joinedAt: iso(l.member.joinedAt), isMe: false }),
  },
  ClubPost: {
    createdAt: (p: PostParent) => p.createdAt.toISOString(),
    editedAt: (p: PostParent) => iso(p.editedAt),
    author: (p: PostParent) => personOut(p.author, p.viewer.userId),
    media: (p: PostParent) => mediaOut(p.mediaId),
    workout: async (p: PostParent) => {
      if (!p.sessionId) return null;
      const w = await getWorkoutDetail(p.sessionId);
      return w ? workoutOut(w) : null;
    },
    activity: async (p: PostParent) => {
      if (!p.activityId) return null;
      const a = await getActivityLog(p.activityId);
      return a ? activityOut(a) : null;
    },
    reactions: (p: PostParent) => p.stats.reactions,
    myReaction: (p: PostParent) => p.stats.mine,
    commentCount: (p: PostParent) => p.stats.commentCount,
    comments: async (p: PostParent) => (await listComments(p.id)).map((c): CommentParent => ({ ...c, viewer: p.viewer })),
    canEdit: (p: PostParent) => p.author.userId === p.viewer.userId,
    canDelete: (p: PostParent) => p.author.userId === p.viewer.userId || p.viewer.isAdmin,
  },
  ClubComment: {
    createdAt: (c: CommentParent) => c.createdAt.toISOString(),
    author: (c: CommentParent) => personOut(c.author, c.viewer.userId),
    media: (c: CommentParent) => mediaOut(c.mediaId),
    canDelete: (c: CommentParent) => c.author.userId === c.viewer.userId || c.viewer.isAdmin,
  },
  ConsoleClubReport: {
    createdAt: (r: { createdAt: Date }) => r.createdAt.toISOString(),
    item: async (r: { postId: string; commentId: string | null }) => {
      const post = (await getPost(r.postId))!;
      if (r.commentId) {
        const c = await getComment(r.commentId);
        return {
          postId: r.postId, commentId: r.commentId, kind: post.kind as PostKind, authorName: c?.author.displayName ?? "", body: c?.body ?? "",
          media: c?.deleted ? null : await mediaOut(c?.mediaId ?? null), createdAt: c?.createdAt.toISOString() ?? "", deleted: !c || c.deleted,
        };
      }
      return {
        postId: post.id, commentId: null, kind: post.kind, authorName: post.author.displayName, body: post.body,
        media: post.deletedAt ? null : await mediaOut(post.mediaId), createdAt: post.createdAt.toISOString(), deleted: !!post.deletedAt,
      };
    },
  },
};
