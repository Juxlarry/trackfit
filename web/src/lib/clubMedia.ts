import { useApolloClient } from "@apollo/client/react";
import { REQUEST_CLUB_UPLOAD } from "../graphql/operations";
import type { ClubFeedLimitsDto } from "../graphql/types";

/**
 * Club photos and videos (README "Clubs v1", "Privacy and safety"). The API
 * hands out a short-lived link for one upload; the file goes straight there
 * (Firebase Storage in production), never through a public URL. The API
 * checks the same limits again, so these checks are only for quick, clear
 * messages.
 */
/** CHALLENGE: a coach's video explaining a challenge. PROOF: a challenge entry's photo or video. */
export type ClubUploadPurpose = "POST" | "COMMENT" | "CLUB_PHOTO" | "CHALLENGE" | "PROOF";

/** Matches the API (feed.service.ts FEED_LIMITS); a club page passes its own copy from the server. */
export const DEFAULT_FEED_LIMITS: ClubFeedLimitsDto = { imageMb: 10, videoMb: 50, videoSeconds: 30, coachVideoMb: 100, coachVideoSeconds: 60, postChars: 1000, commentChars: 500 };

const EXT_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", gif: "image/gif",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp",
};

/** Some Android pickers leave file.type empty; fall back to the extension. */
export function contentTypeOf(file: File): string {
  if (file.type) return file.type.toLowerCase();
  return EXT_TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? "";
}

export function videoSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(v.duration) ? v.duration : 0); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    v.src = url;
  });
}

export interface CheckedFile { file: File; contentType: string; kind: "IMAGE" | "VIDEO"; seconds: number | null }

/** Type, size and length, for the kind of upload. Returns a message to show, or the checked file. */
export async function checkClubFile(file: File, purpose: ClubUploadPurpose, limits: ClubFeedLimitsDto, isCoach: boolean): Promise<CheckedFile | { error: string }> {
  const contentType = contentTypeOf(file);
  const kind = contentType.startsWith("video/") ? "VIDEO" : contentType.startsWith("image/") ? "IMAGE" : null;
  if (!kind) return { error: "That file type isn't supported. Use a photo or a video." };
  if (purpose === "CLUB_PHOTO" && kind !== "IMAGE") return { error: "The club photo has to be a photo." };
  if (purpose === "COMMENT" && kind !== "VIDEO") return { error: "Replies take a video, up to 30 seconds." };
  if (purpose === "CHALLENGE" && kind !== "VIDEO") return { error: "A challenge takes a video explaining it, up to 60 seconds." };
  const mb = file.size / 1048576;
  if (kind === "IMAGE") {
    if (mb > limits.imageMb) return { error: `That photo is ${mb.toFixed(1)} MB. The limit is ${limits.imageMb} MB, so try a lower camera quality.` };
    return { file, contentType, kind, seconds: null };
  }
  // Coaches' video posts and challenge videos get the longer limit; proof is the same for everyone.
  const coachPost = (isCoach && purpose === "POST") || purpose === "CHALLENGE";
  const maxMb = coachPost ? limits.coachVideoMb : limits.videoMb;
  const maxSeconds = coachPost ? limits.coachVideoSeconds : limits.videoSeconds;
  if (mb > maxMb) return { error: `That video is ${Math.round(mb)} MB. The limit is ${maxMb} MB.` };
  const seconds = await videoSeconds(file);
  if (!seconds) return { error: "Couldn't read that video. Try another one, or record it again." };
  if (seconds > maxSeconds + 0.5) return { error: `That video is ${Math.round(seconds)} seconds. Keep it to ${maxSeconds} seconds or less.` };
  return { file, contentType, kind, seconds };
}

interface UploadLink { mediaId: string; url: string; method: string; headers: { name: string; value: string }[] }

function put(link: UploadLink, file: File, onProgress?: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(link.method, link.url);
    for (const h of link.headers) xhr.setRequestHeader(h.name, h.value);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(
      xhr.status === 413 || xhr.status === 400 ? "That file is too big to upload." : "The upload didn't go through. Check your connection and try again.",
    )));
    xhr.onerror = () => reject(new Error("No connection. Check your internet and try again."));
    xhr.send(file);
  });
}

/** Returns upload(clubId, purpose, checked, onProgress) → mediaId, to pass to the post, comment or club photo. */
export function useClubUpload() {
  const client = useApolloClient();
  return async (clubId: string, purpose: ClubUploadPurpose, f: CheckedFile, onProgress?: (fraction: number) => void): Promise<string> => {
    const { data } = await client.mutate<{ requestClubUpload: UploadLink }>({
      mutation: REQUEST_CLUB_UPLOAD,
      variables: { clubId, purpose, contentType: f.contentType, sizeBytes: f.file.size, durationSeconds: f.seconds },
    });
    const link = data!.requestClubUpload;
    await put(link, f.file, onProgress);
    return link.mediaId;
  };
}
