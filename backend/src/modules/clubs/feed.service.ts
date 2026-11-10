import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../../shared/db/pool.js";
import { badInput, forbidden, notFound } from "../../shared/errors.js";
import { getMediaStore } from "../../shared/media/store.js";
import { listAppStaff, type UserRow } from "../identity/identity.repository.js";
import { sendPushToUser } from "../notifications/push.js";
import {
  getActivityLog, getWorkoutDetail, listActivityLogsSince, listWorkoutDetailsSince, weightChangeSinceStart, type WorkoutDetail,
} from "../tracking/tracking.service.js";
import { getMembership, listMembers, type MemberRow } from "./clubs.repository.js";
import { leaveClub, requireActiveMember, requireClubAdmin, tx } from "./clubs.service.js";
import {
  clubsWithPostOf, countRecentUploads, deleteComment as deleteCommentRow, deleteMediaRows, deletePosts, getComment, getMedia, getPost,
  getReport, insertComment, insertMedia, insertPost, insertReport, listShareClubs, listStalePendingMedia, markMediaReady, resolveReports,
  setAskToShare as setAskToShareRow, setClubPhoto as setClubPhotoRow, setReaction, updatePostBody,
  type MediaKind, type MediaPurpose, type MediaRow, type PostKind, type PostRow, type Reaction,
} from "./feed.repository.js";
import { activityDraft, activityPostKind, headlinePrs, workoutDraft } from "./share-draft.js";

/**
 * Clubs v1, build step 2: the feed (README "Clubs v1", "Posts", "Sharing
 * after a workout or activity", "What coaches see").
 */

const MB = 1024 * 1024;
export const FEED_LIMITS = {
  imageBytes: 10 * MB,
  /** Members' videos: the app's existing limits. */
  videoBytes: 50 * MB, videoSeconds: 30,
  /** Coach video posts. */
  coachVideoBytes: 100 * MB, coachVideoSeconds: 60,
  postChars: 1000, commentChars: 500, reportChars: 500,
  /** Posting to several clubs at once. */
  clubsPerPost: 5,
  uploadsPerHour: 40,
  pageSize: 20,
};

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heif", "image/gif": ".gif" };
const VIDEO_TYPES: Record<string, string> = { "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm", "video/3gpp": ".3gp" };

const isCoach = (m: MemberRow) => m.isCoach;

// ── Uploads ─────────────────────────────────────────────────────────────

/** Size and length limits for an upload, or why it isn't allowed at all. */
export function uploadLimits(purpose: MediaPurpose, kind: MediaKind, member: Pick<MemberRow, "isAdmin" | "isCoach">): { bytes: number; seconds: number | null } {
  if (purpose === "CLUB_PHOTO") {
    if (!member.isAdmin) throw forbidden("Only the club's Admins can change its photo.");
    if (kind !== "IMAGE") throw badInput("The club photo has to be a photo.");
    return { bytes: FEED_LIMITS.imageBytes, seconds: null };
  }
  if (purpose === "COMMENT") {
    if (!member.isCoach) throw forbidden("Only coaches can reply with a video.");
    if (kind !== "VIDEO") throw badInput("Replies take a video, up to 30 seconds.");
    return { bytes: FEED_LIMITS.videoBytes, seconds: FEED_LIMITS.videoSeconds };
  }
  if (kind === "IMAGE") return { bytes: FEED_LIMITS.imageBytes, seconds: null };
  return member.isCoach
    ? { bytes: FEED_LIMITS.coachVideoBytes, seconds: FEED_LIMITS.coachVideoSeconds }
    : { bytes: FEED_LIMITS.videoBytes, seconds: FEED_LIMITS.videoSeconds };
}

export interface UploadRequest { purpose: MediaPurpose; contentType: string; sizeBytes: number; durationSeconds?: number | null }

/** Step 1 of an upload: a pending media row and a short-lived link to PUT the file to. */
export async function requestUpload(user: UserRow, clubId: string, req: UploadRequest) {
  const { member } = await requireActiveMember(clubId, user.id);
  const contentType = req.contentType.toLowerCase().split(";")[0].trim();
  const ext = IMAGE_TYPES[contentType] ?? VIDEO_TYPES[contentType];
  if (!ext) throw badInput("That file type isn't supported. Use a photo (JPEG, PNG, HEIC, WebP) or a video (MP4, MOV, WebM).");
  const kind: MediaKind = IMAGE_TYPES[contentType] ? "IMAGE" : "VIDEO";
  const limits = uploadLimits(req.purpose, kind, member);
  if (!Number.isInteger(req.sizeBytes) || req.sizeBytes < 1) throw badInput("That file looks empty.");
  if (req.sizeBytes > limits.bytes) {
    throw badInput(kind === "IMAGE"
      ? `That photo is ${(req.sizeBytes / MB).toFixed(1)} MB. The limit is ${limits.bytes / MB} MB, so try a lower camera quality.`
      : `That video is ${Math.round(req.sizeBytes / MB)} MB. The limit is ${limits.bytes / MB} MB.`);
  }
  let duration: number | null = null;
  if (kind === "VIDEO") {
    duration = req.durationSeconds ?? null;
    if (duration == null || !(duration > 0)) throw badInput("Couldn't read how long that video is. Try another one.");
    if (duration > limits.seconds! + 0.5) throw badInput(`That video is ${Math.round(duration)} seconds. Keep it to ${limits.seconds} seconds or less.`);
  }
  if ((await countRecentUploads(user.id, new Date(Date.now() - 3600_000))) >= FEED_LIMITS.uploadsPerHour) {
    throw badInput("That's a lot of uploads in an hour. Try again a little later.");
  }
  const id = randomUUID();
  const path = `clubs/${clubId}/${id}${ext}`;
  // Link first: if signing fails there's no orphan row.
  const target = await getMediaStore().uploadTarget(path, contentType, limits.bytes);
  await insertMedia(pool, {
    id, clubId, uploaderId: user.id, purpose: req.purpose, kind, contentType, sizeBytes: req.sizeBytes,
    durationSeconds: duration, storagePath: path,
  });
  return { mediaId: id, url: target.url, method: target.method, headers: target.headers, expiresAt: target.expiresAt, maxBytes: limits.bytes };
}

/**
 * Step 2: attach an upload. Checks it's the caller's own, for this club and
 * purpose, not already used, and that the file really arrived within limits.
 */
async function claimMedia(c: PoolClient, mediaId: string, user: UserRow, clubId: string, purpose: MediaPurpose): Promise<MediaRow> {
  const media = await getMedia(mediaId, c);
  if (!media || media.uploaderId !== user.id || media.clubId !== clubId || media.purpose !== purpose) throw badInput("That upload can't be used here.");
  const stored = await getMediaStore().stat(media.storagePath);
  if (!stored) throw badInput("The upload didn't finish. Add the photo or video again.");
  const member = await getMembership(clubId, user.id, c);
  const limit = uploadLimits(purpose, media.kind, member ?? { isAdmin: false, isCoach: false }).bytes;
  if (stored.size > limit || stored.contentType.split(";")[0] !== media.contentType) {
    await getMediaStore().remove(media.storagePath);
    throw badInput("That file doesn't match what was uploaded. Add it again.");
  }
  if (!(await markMediaReady(c, media.id, stored.size))) throw badInput("That upload is already attached to something else.");
  return { ...media, status: "READY", sizeBytes: stored.size };
}

/** Removes media rows and their files. File errors are logged, not thrown: the post is already gone. */
async function removeMedia(c: PoolClient | typeof pool, ids: string[]) {
  const rows = await deleteMediaRows(c, ids);
  await Promise.all(rows.map((m) => getMediaStore().remove(m.storagePath).catch((err) => console.error("Removing club media failed", m.storagePath, err))));
}

/** Uploads started but never attached, older than a day. Run from the reminder job. */
export async function cleanUpStaleUploads(): Promise<number> {
  const stale = await listStalePendingMedia(new Date(Date.now() - 24 * 3600_000));
  if (stale.length) await removeMedia(pool, stale.map((m) => m.id));
  return stale.length;
}

export async function mediaViewUrl(m: { storagePath: string }): Promise<string> {
  return getMediaStore().viewUrl(m.storagePath);
}

// ── Posting ─────────────────────────────────────────────────────────────

export interface CreatePostInput {
  clubIds: string[];
  body?: string | null;
  sessionId?: string | null;
  activityId?: string | null;
  /** Needed only for posts not linked to a log: PROGRESS, MEAL or COACH_VIDEO. */
  kind?: PostKind | null;
  mediaId?: string | null;
  /** Progress posts: add the change since Day 1 from the member's weigh-ins. */
  includeWeightChange?: boolean | null;
}

function cleanBody(raw: string | null | undefined, max: number): string {
  const body = (raw ?? "").replace(/\r\n/g, "\n").trim();
  if (body.length > max) throw badInput(`Keep it under ${max} characters.`, [{ field: "body", message: `Up to ${max} characters.` }]);
  return body;
}

/** One post per club in clubIds. Returns their ids. */
export async function createPosts(user: UserRow, input: CreatePostInput): Promise<string[]> {
  const clubIds = [...new Set(input.clubIds)];
  if (!clubIds.length) throw badInput("Pick a club to post to.");
  if (clubIds.length > FEED_LIMITS.clubsPerPost) throw badInput(`You can post to up to ${FEED_LIMITS.clubsPerPost} clubs at once.`);
  if (input.sessionId && input.activityId) throw badInput("A post shares one workout or one activity, not both.");
  const body = cleanBody(input.body, FEED_LIMITS.postChars);
  const members = await Promise.all(clubIds.map(async (id) => (await requireActiveMember(id, user.id)).member));

  let kind: PostKind;
  let workout: WorkoutDetail | null = null;
  if (input.sessionId) {
    workout = await getWorkoutDetail(input.sessionId);
    if (!workout || workout.userId !== user.id) throw notFound("Workout not found.");
    kind = "WORKOUT";
  } else if (input.activityId) {
    const a = await getActivityLog(input.activityId);
    if (!a || a.userId !== user.id) throw notFound("Activity not found.");
    kind = activityPostKind(a.activityType);
  } else {
    if (input.kind !== "PROGRESS" && input.kind !== "MEAL" && input.kind !== "COACH_VIDEO") {
      throw badInput("Choose what you're posting: progress, a meal or a coach video.");
    }
    kind = input.kind;
    if (!body && !input.mediaId) throw badInput("Add some words or a photo.");
  }
  if (kind === "COACH_VIDEO") {
    if (!members.every(isCoach)) throw forbidden("Only coaches can post coach videos, and only in clubs where they coach.");
    if (!input.mediaId) throw badInput("A coach video post needs a video.");
  }
  const weightChangeKg = kind === "PROGRESS" && input.includeWeightChange ? await weightChangeSinceStart(user.id) : null;
  if (kind === "PROGRESS" && input.includeWeightChange && weightChangeKg === null) throw badInput("Log a weigh-in first to add your weight change.");
  const hasPr = !!workout && headlinePrs(workout.prs).length > 0;

  let copies: string[] = [];
  try {
    return await tx(async (c) => {
      let media: MediaRow | null = null;
      if (input.mediaId) {
        media = await claimMedia(c, input.mediaId, user, clubIds[0], "POST");
        if (kind === "COACH_VIDEO" && media.kind !== "VIDEO") throw badInput("A coach video post needs a video.");
      }
      const ids: string[] = [];
      for (const clubId of clubIds) {
        let mediaId = media?.id ?? null;
        if (media && clubId !== media.clubId) {
          // Each club's files stay in its own folder, so copy the upload.
          const id = randomUUID();
          const path = `clubs/${clubId}/${id}${media.storagePath.slice(media.storagePath.lastIndexOf("."))}`;
          await getMediaStore().copy(media.storagePath, path);
          copies.push(path);
          await insertMedia(c, { ...media, id, clubId, storagePath: path, status: "READY" });
          mediaId = id;
        }
        ids.push(await insertPost(c, {
          clubId, authorId: user.id, kind, body, sessionId: input.sessionId ?? null, activityId: input.activityId ?? null,
          weightChangeKg, hasPr, mediaId,
        }));
      }
      copies = [];
      return ids;
    });
  } catch (err) {
    await Promise.all(copies.map((p) => getMediaStore().remove(p).catch(() => {})));
    if ((err as { code?: string }).code === "23505") throw badInput("You've already shared that to this club.");
    throw err;
  }
}

/** A live post in an open club the caller is active in, with their membership. */
export async function requirePostAccess(postId: string, userId: string): Promise<{ post: PostRow; viewer: MemberRow }> {
  const post = await getPost(postId);
  if (!post || post.deletedAt) throw notFound("Post not found.");
  const { member } = await requireActiveMember(post.clubId, userId);
  return { post, viewer: member };
}

export async function editPost(user: UserRow, postId: string, rawBody: string) {
  const { post } = await requirePostAccess(postId, user.id);
  if (post.author.userId !== user.id) throw forbidden("You can only edit your own posts.");
  const body = cleanBody(rawBody, FEED_LIMITS.postChars);
  if (!body && !post.mediaId && !post.sessionId && !post.activityId) throw badInput("Add some words, or delete the post instead.");
  await updatePostBody(postId, body);
  return post.clubId;
}

/** Authors delete their own; Admins can delete any. */
export async function deletePost(user: UserRow, postId: string) {
  const { post, viewer } = await requirePostAccess(postId, user.id);
  if (post.author.userId !== user.id && !viewer.isAdmin) throw forbidden("Only the person who posted it, or an Admin, can delete this.");
  await tx(async (c) => removeMedia(c, await deletePosts(c, { id: postId }, user.id)));
  return post.clubId;
}

/** Leaving a club and taking your posts with you (README: "with an option to delete them on the way out"). */
export async function deleteMyPostsIn(c: PoolClient, clubId: string, userId: string) {
  await removeMedia(c, await deletePosts(c, { clubId, authorId: userId }, userId));
}

// ── Reactions, comments, reports ────────────────────────────────────────

export const REACTIONS: Reaction[] = ["FIRE", "STRONG", "CLAP", "HEART"];

export async function react(user: UserRow, postId: string, reaction: Reaction | null) {
  await requirePostAccess(postId, user.id);
  if (reaction !== null && !REACTIONS.includes(reaction)) throw badInput("Unknown reaction.");
  await setReaction(postId, user.id, reaction);
}

export async function addComment(user: UserRow, postId: string, rawBody: string | null | undefined, mediaId: string | null | undefined) {
  const { post } = await requirePostAccess(postId, user.id);
  const body = cleanBody(rawBody, FEED_LIMITS.commentChars);
  if (!body && !mediaId) throw badInput("Write a comment first.");
  return tx(async (c) => {
    const media = mediaId ? await claimMedia(c, mediaId, user, post.clubId, "COMMENT") : null;
    return insertComment(c, { postId, authorId: user.id, body, mediaId: media?.id ?? null });
  });
}

export async function deleteComment(user: UserRow, commentId: string) {
  const comment = await getComment(commentId);
  if (!comment || comment.deleted) throw notFound("Comment not found.");
  const { viewer } = await requirePostAccess(comment.postId, user.id);
  if (comment.author.userId !== user.id && !viewer.isAdmin) throw forbidden("Only the person who wrote it, or an Admin, can delete this.");
  await tx(async (c) => {
    const media = await deleteCommentRow(c, commentId);
    if (media) await removeMedia(c, [media]);
  });
  return comment.postId;
}

/** Anyone in the club can report a post or comment to the App Owner and App Admins. */
export async function report(user: UserRow, postId: string, commentId: string | null | undefined, rawReason: string) {
  const { post } = await requirePostAccess(postId, user.id);
  if (commentId) {
    const comment = await getComment(commentId);
    if (!comment || comment.deleted || comment.postId !== postId) throw notFound("Comment not found.");
  }
  const reason = cleanBody(rawReason, FEED_LIMITS.reportChars);
  if (!reason) throw badInput("Say briefly what's wrong, so the App Admins know what to look at.");
  const created = await insertReport({ clubId: post.clubId, postId, commentId: commentId ?? null, reporterId: user.id, reason });
  if (created) {
    const staff = await listAppStaff();
    await Promise.all(staff.map((s) => sendPushToUser(s.userId, {
      title: "A club post was reported", body: "Open the console to look at it.", url: "/console", tag: "club-report",
    }).catch((err) => console.error("Report push failed", err))));
  }
}

/** Console: remove the reported post or comment, or leave it up. Either way, its open reports close. */
export async function resolveReport(staff: UserRow, reportId: string, remove: boolean) {
  const r = await getReport(reportId);
  if (!r) throw notFound("Report not found.");
  if (r.resolvedAt) return;
  await tx(async (c) => {
    if (remove) {
      if (r.commentId) {
        const media = await deleteCommentRow(c, r.commentId);
        if (media) await removeMedia(c, [media]);
      } else {
        await removeMedia(c, await deletePosts(c, { id: r.postId }, staff.id));
      }
    }
    await resolveReports(c, { postId: r.postId, commentId: r.commentId }, staff.id, remove ? "REMOVED" : "DISMISSED");
  });
}

// ── Sharing after a workout or activity ─────────────────────────────────

/** What "Share with <club>?" offers: the drafted text and the clubs to ask about. */
export async function shareDraft(user: UserRow, link: { sessionId?: string | null; activityId?: string | null }) {
  let text: string;
  let posted: Set<string>;
  if (link.sessionId) {
    const w = await getWorkoutDetail(link.sessionId);
    if (!w || w.userId !== user.id) throw notFound("Workout not found.");
    text = workoutDraft(w, user.units);
    posted = await clubsWithPostOf(user.id, { sessionId: w.id });
  } else if (link.activityId) {
    const a = await getActivityLog(link.activityId);
    if (!a || a.userId !== user.id) throw notFound("Activity not found.");
    text = activityDraft(a, user.units);
    posted = await clubsWithPostOf(user.id, { activityId: a.id });
  } else {
    throw badInput("Say which workout or activity to share.");
  }
  const clubs = (await listShareClubs(user.id)).filter((c) => !posted.has(c.id));
  return { text, clubs };
}

export async function setAskToShare(user: UserRow, clubId: string, on: boolean) {
  await requireActiveMember(clubId, user.id);
  await setAskToShareRow(clubId, user.id, on);
}

export async function setClubPhoto(user: UserRow, clubId: string, mediaId: string | null) {
  await requireClubAdmin(clubId, user.id);
  await tx(async (c) => {
    const media = mediaId ? await claimMedia(c, mediaId, user, clubId, "CLUB_PHOTO") : null;
    const old = await setClubPhotoRow(c, clubId, media?.id ?? null);
    if (old && old !== media?.id) await removeMedia(c, [old]);
  });
}

// ── What coaches see ────────────────────────────────────────────────────

/**
 * The one check behind every coach view: the viewer is an active Coach in an
 * open club, and the member is active in the same club. Logs are visible from
 * the day the member joined. Access ends the moment either one leaves.
 */
export async function requireCoachOf(clubId: string, viewerId: string, memberId: string): Promise<MemberRow> {
  const { member: viewer } = await requireActiveMember(clubId, viewerId);
  if (!viewer.isCoach) throw forbidden("Only the club's coaches can see members' logs.");
  const member = await getMembership(clubId, memberId);
  if (!member || member.status !== "ACTIVE" || !member.joinedAt) throw notFound("That person isn't an active member of this club.");
  return member;
}

const WEEKS = 4;

/** The Members page overview: each member's last four weeks, since they joined. */
export async function coachOverview(user: UserRow, clubId: string) {
  const { member: viewer } = await requireActiveMember(clubId, user.id);
  if (!viewer.isCoach) return [];
  const members = (await listMembers(clubId, "ACTIVE")).filter((m) => m.userId !== user.id && m.joinedAt);
  const windowStart = new Date(Date.now() - WEEKS * 7 * 86_400_000);
  return Promise.all(members.map(async (m) => {
    const since = m.joinedAt! > windowStart ? m.joinedAt! : windowStart;
    const sinceIso = since.toISOString().slice(0, 10);
    const [workouts, activities] = await Promise.all([listWorkoutDetailsSince(m.userId, since, 60), listActivityLogsSince(m.userId, sinceIso, 60)]);
    const weeks = Math.max(1, Math.min(WEEKS, (Date.now() - since.getTime()) / (7 * 86_400_000)));
    return {
      member: m,
      sessionsPerWeek: Math.round((workouts.length / weeks) * 10) / 10,
      workoutsInWindow: workouts.length,
      activitiesInWindow: activities.length,
      prsInWindow: workouts.reduce((a, w) => a + headlinePrs(w.prs).length, 0),
      lastWorkoutAt: workouts[0]?.startedAt ?? null,
      lastActivityOn: activities[0]?.performedOn ?? null,
    };
  }));
}

/** One member's workouts and activities since joining, newest first. */
export async function coachMemberLog(user: UserRow, clubId: string, memberId: string, limit = 30) {
  const member = await requireCoachOf(clubId, user.id, memberId);
  const [workouts, activities] = await Promise.all([
    listWorkoutDetailsSince(memberId, member.joinedAt!, limit),
    listActivityLogsSince(memberId, member.joinedAt!.toISOString().slice(0, 10), limit),
  ]);
  return { member, workouts, activities };
}

/** Leave (the usual rules apply, so a last Admin is stopped first), then optionally delete your posts there. */
export async function leaveClubWithPosts(user: UserRow, clubId: string, deleteMyPosts: boolean) {
  await leaveClub(user, clubId);
  if (deleteMyPosts) await tx((c) => deleteMyPostsIn(c, clubId, user.id));
}
