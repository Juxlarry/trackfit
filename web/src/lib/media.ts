import { getDownloadURL, getMetadata, ref, uploadBytes } from "firebase/storage";
import { getFirebaseAuth, getFirebaseStorage } from "../firebase";

/**
 * Progress photos and videos.
 *
 * Signed in with Firebase: stored in Firebase Storage at
 * users/{uid}/progress/{slot}, one file per slot, so they follow the user to
 * any browser. storage.rules enforces the same limits as checkMediaFile and
 * only lets the owner read or write.
 *
 * Dev-bypass mode has no Firebase user, so media stays on the device in
 * IndexedDB. The first time a signed-in user opens Progress, anything still
 * in IndexedDB from before the move to Storage is uploaded and then removed.
 */
export const MEDIA_LIMITS = { imageBytes: 10 * 1024 * 1024, videoBytes: 50 * 1024 * 1024, videoSeconds: 30 };
export type MediaLabel = "Day 1" | "Week 3" | "Week 6";
export const MEDIA_SLOTS: { label: MediaLabel; dayOffset: number }[] = [
  { label: "Day 1", dayOffset: 0 },
  { label: "Week 3", dayOffset: 14 },
  { label: "Week 6", dayOffset: 35 },
];

export interface MediaItem {
  label: MediaLabel;
  kind: "image" | "video";
  /** Something an <img>/<video> can load: a Storage download URL or a blob: URL. */
  src: string;
  savedAt: number;
}

interface LocalMedia {
  label: MediaLabel;
  kind: "image" | "video";
  blob: Blob;
  savedAt: number;
}

function cloudUid(): string | null {
  try {
    return getFirebaseAuth().currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

export const mediaInCloud = () => cloudUid() !== null;

// ── Firebase Storage ────────────────────────────────────────────────────

const slotPath = (uid: string, label: MediaLabel) => `users/${uid}/progress/${label.toLowerCase().replace(" ", "-")}`;

async function uploadCloud(uid: string, label: MediaLabel, kind: "image" | "video", blob: Blob): Promise<void> {
  await uploadBytes(ref(getFirebaseStorage(), slotPath(uid, label)), blob, {
    contentType: blob.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
    // Same path on replace, so make browsers revalidate instead of showing the old photo.
    cacheControl: "private, no-cache",
  });
}

async function listCloud(uid: string): Promise<MediaItem[]> {
  const found = await Promise.all(
    MEDIA_SLOTS.map(async ({ label }): Promise<MediaItem | null> => {
      const r = ref(getFirebaseStorage(), slotPath(uid, label));
      try {
        const [meta, src] = await Promise.all([getMetadata(r), getDownloadURL(r)]);
        return { label, kind: meta.contentType?.startsWith("video/") ? "video" : "image", src, savedAt: Date.parse(meta.updated) };
      } catch (err) {
        if ((err as { code?: string }).code === "storage/object-not-found") return null;
        throw err;
      }
    }),
  );
  return found.filter((m): m is MediaItem => m !== null);
}

// ── IndexedDB (dev bypass, and photos saved before the move) ────────────

const DB = "trackfit-media";
const STORE = "media";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "label" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode: IDBTransactionMode, run: (s: IDBObjectStore) => void): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    run(t.objectStore(STORE));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  db.close();
}

async function listLocal(): Promise<LocalMedia[]> {
  try {
    const db = await open();
    const items = await new Promise<LocalMedia[]>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as LocalMedia[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return items;
  } catch {
    return [];
  }
}

/** Uploads photos left in IndexedDB, unless that slot already has one in the cloud. */
async function migrateLocal(uid: string, cloud: MediaItem[]): Promise<boolean> {
  const local = await listLocal();
  if (!local.length) return false;
  for (const m of local) {
    if (!cloud.some((c) => c.label === m.label)) await uploadCloud(uid, m.label, m.kind, m.blob);
    await tx("readwrite", (s) => s.delete(m.label));
  }
  return true;
}

// ── Public API ──────────────────────────────────────────────────────────

export async function saveMedia(label: MediaLabel, kind: "image" | "video", blob: Blob): Promise<void> {
  const uid = cloudUid();
  if (uid) await uploadCloud(uid, label, kind, blob);
  else await tx("readwrite", (s) => s.put({ label, kind, blob, savedAt: Date.now() } satisfies LocalMedia));
}

/** Blob URLs in the result are owned by the caller; pass the list to releaseMedia when done. */
export async function listMedia(): Promise<MediaItem[]> {
  const uid = cloudUid();
  if (!uid) return (await listLocal()).map((m) => ({ label: m.label, kind: m.kind, src: URL.createObjectURL(m.blob), savedAt: m.savedAt }));
  const cloud = await listCloud(uid);
  try {
    if (await migrateLocal(uid, cloud)) return listCloud(uid);
  } catch {
    // Leave local copies in place and try again next visit.
  }
  return cloud;
}

export function releaseMedia(items: MediaItem[]): void {
  for (const m of items) if (m.src.startsWith("blob:")) URL.revokeObjectURL(m.src);
}

/** Plain-language messages for the Storage errors users actually hit. */
export function mediaErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  if (code === "storage/unauthorized") return "TrackFit couldn't save that file. Check it's a photo under 10 MB or a video under 50 MB, then try again.";
  if (code === "storage/quota-exceeded") return "Photo storage is full right now. Try again later.";
  if (code === "storage/retry-limit-exceeded" || code === "storage/unknown" || !navigator.onLine) return "No connection. Check your internet and try again.";
  return "Couldn't save that. Try again.";
}

/** Checks type, size and (for video) duration. Returns an error message or null. */
export async function checkMediaFile(file: File): Promise<{ error: string } | { kind: "image" | "video" }> {
  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");
  if (!isVideo && !isImage) return { error: "That file type isn't supported. Use a photo or a video." };
  if (isImage && file.size > MEDIA_LIMITS.imageBytes) {
    return { error: `That photo is ${(file.size / 1048576).toFixed(1)} MB. The limit is 10 MB, so try a lower camera quality.` };
  }
  if (isVideo && file.size > MEDIA_LIMITS.videoBytes) return { error: `That video is ${Math.round(file.size / 1048576)} MB. The limit is 50 MB.` };
  if (isVideo) {
    const seconds = await new Promise<number>((resolve) => {
      const v = document.createElement("video");
      const url = URL.createObjectURL(file);
      v.preload = "metadata";
      v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
      v.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
      v.src = url;
    });
    if (seconds > MEDIA_LIMITS.videoSeconds + 0.5) return { error: `That video is ${Math.round(seconds)} seconds. Keep it to 30 seconds or less.` };
    return { kind: "video" };
  }
  return { kind: "image" };
}
