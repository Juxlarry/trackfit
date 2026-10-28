/**
 * Progress photos and videos, stored on this device in IndexedDB.
 *
 * Cloud storage is still an open decision (architecture.md §12), so media
 * deliberately never leaves the device yet. The UI says so. When storage is
 * chosen, swap saveMedia/listMedia for an upload + signed-URL API; the
 * limits below stay the same and are enforced server-side too.
 */
export const MEDIA_LIMITS = { imageBytes: 10 * 1024 * 1024, videoBytes: 50 * 1024 * 1024, videoSeconds: 30 };
export type MediaLabel = "Day 1" | "Week 3" | "Week 6";
export const MEDIA_SLOTS: { label: MediaLabel; dayOffset: number }[] = [
  { label: "Day 1", dayOffset: 0 },
  { label: "Week 3", dayOffset: 14 },
  { label: "Week 6", dayOffset: 35 },
];

export interface StoredMedia {
  label: MediaLabel;
  kind: "image" | "video";
  blob: Blob;
  savedAt: number;
}

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

export async function saveMedia(m: StoredMedia): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(m);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listMedia(): Promise<StoredMedia[]> {
  try {
    const db = await open();
    const items = await new Promise<StoredMedia[]>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as StoredMedia[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return items;
  } catch {
    return [];
  }
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
