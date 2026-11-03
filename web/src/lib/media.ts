import { getFirebaseApp, getFirebaseAuth } from "../firebase";

/**
 * Progress photos and videos: three slots (Day 1, Week 3, Week 6) per cycle,
 * kept for every cycle so Progress can show the history.
 *
 * Signed in with Firebase: stored in Firebase Storage. Cycle 1 uses
 * users/{uid}/progress/{slot} (where every photo lived before cycles had their
 * own folders); later cycles use users/{uid}/progress/cycle-{n}/{slot}.
 * storage.rules enforces the same limits as checkMediaFile and only lets the
 * owner read or write.
 *
 * Dev-bypass mode has no Firebase user, so media stays on the device in
 * IndexedDB under the same relative paths. The first time a signed-in user
 * opens Progress, anything still in IndexedDB is uploaded and then removed.
 */
export const MEDIA_LIMITS = { imageBytes: 10 * 1024 * 1024, videoBytes: 50 * 1024 * 1024, videoSeconds: 30 };
export type MediaLabel = "Day 1" | "Week 3" | "Week 6";
export const MEDIA_SLOTS: { label: MediaLabel; dayOffset: number }[] = [
  { label: "Day 1", dayOffset: 0 },
  { label: "Week 3", dayOffset: 14 },
  { label: "Week 6", dayOffset: 35 },
];

export interface CycleSpan { cycleNumber: number; startDate: string }

export interface MediaItem {
  cycle: number;
  label: MediaLabel;
  kind: "image" | "video";
  /** Something an <img>/<video> can load: a Storage download URL or a blob: URL. */
  src: string;
  savedAt: number;
  /** Where the file is stored (relative path), so replace and delete hit the right one. */
  path: string;
}

interface LocalMedia {
  path: string;
  kind: "image" | "video";
  blob: Blob;
  savedAt: number;
}

const slotName = (label: MediaLabel) => label.toLowerCase().replace(" ", "-");
const relPath = (cycle: number, label: MediaLabel) => (cycle <= 1 ? slotName(label) : `cycle-${cycle}/${slotName(label)}`);

function parsePath(path: string): { cycle: number; label: MediaLabel } | null {
  const m = /^(?:cycle-(\d+)\/)?(day-1|week-3|week-6)$/.exec(path);
  const slot = MEDIA_SLOTS.find((s) => slotName(s.label) === m?.[2]);
  return m && slot ? { cycle: m[1] ? Number(m[1]) : 1, label: slot.label } : null;
}

function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Before cycles had folders, a later cycle's photos were saved over cycle 1's
 * path (redoing onboarding starts a new cycle). Such a file belongs to the
 * cycle it was taken in, unless that cycle has its own photo for the slot.
 */
function placeOldPhotos(items: MediaItem[], cycles: CycleSpan[]): MediaItem[] {
  const starts = [...cycles].sort((a, b) => b.cycleNumber - a.cycleNumber);
  return items.map((m) => {
    if (m.path !== relPath(1, m.label)) return m;
    const owner = starts.find((c) => c.startDate <= localDate(m.savedAt))?.cycleNumber ?? 1;
    const taken = items.some((x) => x.cycle === owner && x.label === m.label && x !== m);
    return owner > 1 && !taken ? { ...m, cycle: owner } : m;
  });
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

// Loaded on first use so the Storage SDK stays out of the first download
// (a static import gets hoisted into the shared chunk). Rules: web/storage.rules.
async function storage() {
  const sdk = await import("firebase/storage");
  return { ...sdk, bucket: sdk.getStorage(getFirebaseApp()) };
}

const cloudPath = (uid: string, path: string) => `users/${uid}/progress/${path}`;

async function uploadCloud(uid: string, path: string, kind: "image" | "video", blob: Blob): Promise<void> {
  const { bucket, ref, uploadBytes } = await storage();
  await uploadBytes(ref(bucket, cloudPath(uid, path)), blob, {
    contentType: blob.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
    // Same path on replace, so make browsers revalidate instead of showing the old photo.
    cacheControl: "private, no-cache",
  });
}

async function listCloud(uid: string, cycles: number[]): Promise<MediaItem[]> {
  const { bucket, ref, getMetadata, getDownloadURL } = await storage();
  const found = await Promise.all(
    cycles.flatMap((cycle) => MEDIA_SLOTS.map(async ({ label }): Promise<MediaItem | null> => {
      const path = relPath(cycle, label);
      const r = ref(bucket, cloudPath(uid, path));
      try {
        const [meta, src] = await Promise.all([getMetadata(r), getDownloadURL(r)]);
        return { cycle, label, kind: meta.contentType?.startsWith("video/") ? "video" : "image", src, savedAt: Date.parse(meta.updated), path };
      } catch (err) {
        if ((err as { code?: string }).code === "storage/object-not-found") return null;
        throw err;
      }
    })),
  );
  return found.filter((m): m is MediaItem => m !== null);
}

async function deleteCloud(uid: string, path: string): Promise<void> {
  const { bucket, ref, deleteObject } = await storage();
  await deleteObject(ref(bucket, cloudPath(uid, path)));
}

// ── IndexedDB (dev bypass, and photos saved before the move) ────────────

const DB = "trackfit-media";
const STORE = "files";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = (e) => {
      // v1 kept one file per slot in "media", keyed by label. Those are cycle 1's.
      const db = req.result;
      const files = db.createObjectStore(STORE, { keyPath: "path" });
      if (e.oldVersion < 1) return;
      const old = req.transaction!.objectStore("media");
      old.getAll().onsuccess = (ev) => {
        for (const m of (ev.target as IDBRequest).result as { label: MediaLabel; kind: "image" | "video"; blob: Blob; savedAt: number }[]) {
          files.put({ path: relPath(1, m.label), kind: m.kind, blob: m.blob, savedAt: m.savedAt } satisfies LocalMedia);
        }
        db.deleteObjectStore("media");
      };
    };
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

/** Uploads files left in IndexedDB, unless that path already has one in the cloud. */
async function migrateLocal(uid: string, cloud: MediaItem[]): Promise<boolean> {
  const local = await listLocal();
  if (!local.length) return false;
  for (const m of local) {
    if (!cloud.some((c) => c.path === m.path)) await uploadCloud(uid, m.path, m.kind, m.blob);
    await tx("readwrite", (s) => s.delete(m.path));
  }
  return true;
}

// ── Public API ──────────────────────────────────────────────────────────

/** Saves this cycle's photo for a slot. `replacing` is the item shown in that slot now, if any. */
export async function saveMedia(cycle: number, label: MediaLabel, kind: "image" | "video", blob: Blob, replacing?: MediaItem): Promise<void> {
  const path = relPath(cycle, label);
  const uid = cloudUid();
  if (uid) await uploadCloud(uid, path, kind, blob);
  else await tx("readwrite", (s) => s.put({ path, kind, blob, savedAt: Date.now() } satisfies LocalMedia));
  // An old-style photo shown in this slot is superseded by the one in the cycle's own folder.
  if (replacing && replacing.path !== path) await deleteMedia(replacing);
}

/** Photos for every cycle given. Blob URLs in the result are owned by the caller; pass the list to releaseMedia when done. */
export async function listMedia(cycles: CycleSpan[]): Promise<MediaItem[]> {
  const numbers = [...new Set([1, ...cycles.map((c) => c.cycleNumber)])];
  const uid = cloudUid();
  if (!uid) {
    const local = (await listLocal()).flatMap((m): MediaItem[] => {
      const at = parsePath(m.path);
      return at && numbers.includes(at.cycle) ? [{ ...at, kind: m.kind, src: URL.createObjectURL(m.blob), savedAt: m.savedAt, path: m.path }] : [];
    });
    return placeOldPhotos(local, cycles);
  }
  let cloud = await listCloud(uid, numbers);
  try {
    if (await migrateLocal(uid, cloud)) cloud = await listCloud(uid, numbers);
  } catch {
    // Leave local copies in place and try again next visit.
  }
  return placeOldPhotos(cloud, cycles);
}

export function releaseMedia(items: MediaItem[]): void {
  for (const m of items) if (m.src.startsWith("blob:")) URL.revokeObjectURL(m.src);
}

export async function deleteMedia(item: MediaItem): Promise<void> {
  const uid = cloudUid();
  if (uid) await deleteCloud(uid, item.path);
  else await tx("readwrite", (s) => s.delete(item.path));
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
