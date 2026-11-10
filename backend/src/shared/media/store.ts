import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat as fsStat, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize } from "node:path";
import { firebaseAdmin } from "../auth/firebase.js";

/**
 * Where club photos and videos live (README "Clubs v1", "Privacy and safety").
 * Files are never public: the API hands out short-lived links to upload one
 * file and to view it, and only after checking the caller is in the club.
 *
 * - MEDIA_STORE=firebase (the default unless DEV_AUTH_BYPASS is on): the
 *   Firebase Storage bucket in FIREBASE_STORAGE_BUCKET, through V4 signed URLs.
 *   storage.rules gives browsers no access to clubs/, and signed URLs don't go
 *   through rules. The bucket needs CORS for uploads: `npm run media:cors`.
 * - MEDIA_STORE=local: files in MEDIA_DIR on this machine, served by the API
 *   itself (/media-local/...), for dev and tests. Never on Render: its disk
 *   is wiped on every deploy.
 */
export interface UploadTarget {
  url: string;
  method: "PUT";
  /** Headers the upload must send exactly as given. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObject { size: number; contentType: string }

export interface MediaStore {
  /** A link that accepts one PUT of this type, up to maxBytes. */
  uploadTarget(path: string, contentType: string, maxBytes: number): Promise<UploadTarget>;
  /** A link to view the file, valid for about an hour. */
  viewUrl(path: string): Promise<string>;
  stat(path: string): Promise<StoredObject | null>;
  copy(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export const UPLOAD_LINK_MINUTES = 15;
export const VIEW_LINK_MINUTES = 60;

// ── Firebase Storage ────────────────────────────────────────────────────

class FirebaseStore implements MediaStore {
  /** View links are reused while they have 10+ minutes left, so images stay cached between feed loads. */
  private views = new Map<string, { url: string; expires: number }>();

  private bucket() {
    // Same default as the web app (web/src/firebase.ts). Older projects use <project>.appspot.com: set it then.
    const name = process.env.FIREBASE_STORAGE_BUCKET || (process.env.FIREBASE_PROJECT_ID ? `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app` : "");
    if (!name) throw new Error("Club photos and videos need FIREBASE_STORAGE_BUCKET (or FIREBASE_PROJECT_ID) set on the API.");
    return firebaseAdmin().storage().bucket(name);
  }

  async uploadTarget(path: string, contentType: string, maxBytes: number): Promise<UploadTarget> {
    const expires = Date.now() + UPLOAD_LINK_MINUTES * 60_000;
    const range = `0,${maxBytes}`;
    const [url] = await this.bucket().file(path).getSignedUrl({
      version: "v4", action: "write", expires, contentType,
      // Storage rejects a body outside this range, so the size limit holds even if the app is bypassed.
      extensionHeaders: { "x-goog-content-length-range": range },
    });
    return { url, method: "PUT", headers: { "content-type": contentType, "x-goog-content-length-range": range }, expiresAt: new Date(expires) };
  }

  async viewUrl(path: string): Promise<string> {
    const hit = this.views.get(path);
    if (hit && hit.expires - Date.now() > 10 * 60_000) return hit.url;
    const expires = Date.now() + VIEW_LINK_MINUTES * 60_000;
    const [url] = await this.bucket().file(path).getSignedUrl({ version: "v4", action: "read", expires });
    this.views.set(path, { url, expires });
    if (this.views.size > 5000) this.views.clear();
    return url;
  }

  async stat(path: string): Promise<StoredObject | null> {
    try {
      const [meta] = await this.bucket().file(path).getMetadata();
      return { size: Number(meta.size), contentType: String(meta.contentType ?? "") };
    } catch (err) {
      if ((err as { code?: number }).code === 404) return null;
      throw err;
    }
  }

  async copy(from: string, to: string): Promise<void> {
    const b = this.bucket();
    await b.file(from).copy(b.file(to));
  }

  async remove(path: string): Promise<void> {
    this.views.delete(path);
    await this.bucket().file(path).delete({ ignoreNotFound: true });
  }
}

// ── Local folder (dev and tests) ────────────────────────────────────────

interface LocalGrant { p: string; a: "r" | "w"; e: number; ct?: string; max?: number }

export class LocalStore implements MediaStore {
  private readonly secret = randomBytes(32);
  constructor(readonly dir: string, private readonly baseUrl: string) {}

  private sign(g: LocalGrant): string {
    const body = Buffer.from(JSON.stringify(g)).toString("base64url");
    return `${body}.${createHmac("sha256", this.secret).update(body).digest("base64url")}`;
  }

  /** The grant inside a token, or null if it's forged, expired or for the other action. */
  verify(token: string, action: "r" | "w"): LocalGrant | null {
    const [body, mac] = token.split(".");
    if (!body || !mac) return null;
    const want = createHmac("sha256", this.secret).update(body).digest();
    const got = Buffer.from(mac, "base64url");
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    const g = JSON.parse(Buffer.from(body, "base64url").toString()) as LocalGrant;
    return g.a === action && g.e > Date.now() ? g : null;
  }

  private file(path: string): string {
    const full = normalize(join(this.dir, path));
    if (!full.startsWith(normalize(this.dir))) throw new Error("Bad media path.");
    return full;
  }

  async uploadTarget(path: string, contentType: string, maxBytes: number): Promise<UploadTarget> {
    const e = Date.now() + UPLOAD_LINK_MINUTES * 60_000;
    return { url: `${this.baseUrl}/media-local/${this.sign({ p: path, a: "w", e, ct: contentType, max: maxBytes })}`, method: "PUT", headers: { "content-type": contentType }, expiresAt: new Date(e) };
  }

  async viewUrl(path: string): Promise<string> {
    return `${this.baseUrl}/media-local/${this.sign({ p: path, a: "r", e: Date.now() + VIEW_LINK_MINUTES * 60_000 })}`;
  }

  /** What PUT /media-local/:token does. Returns an HTTP status. */
  async put(token: string, contentType: string, body: Buffer): Promise<number> {
    const g = this.verify(token, "w");
    if (!g) return 403;
    if (contentType !== g.ct) return 400;
    if (body.length > (g.max ?? 0)) return 413;
    const f = this.file(g.p);
    await mkdir(dirname(f), { recursive: true });
    await writeFile(f, body);
    await writeFile(`${f}.json`, JSON.stringify({ contentType }));
    return 200;
  }

  /** What GET /media-local/:token serves. */
  async read(token: string): Promise<{ body: Buffer; contentType: string } | null> {
    const g = this.verify(token, "r");
    if (!g) return null;
    const meta = await this.stat(g.p);
    return meta ? { body: await readFile(this.file(g.p)), contentType: meta.contentType } : null;
  }

  async stat(path: string): Promise<StoredObject | null> {
    try {
      const f = this.file(path);
      const [s, meta] = await Promise.all([fsStat(f), readFile(`${f}.json`, "utf8")]);
      return { size: s.size, contentType: (JSON.parse(meta) as { contentType: string }).contentType };
    } catch {
      return null;
    }
  }

  async copy(from: string, to: string): Promise<void> {
    const a = this.file(from), b = this.file(to);
    await mkdir(dirname(b), { recursive: true });
    await copyFile(a, b);
    await copyFile(`${a}.json`, `${b}.json`);
  }

  async remove(path: string): Promise<void> {
    const f = this.file(path);
    await rm(f, { force: true });
    await rm(`${f}.json`, { force: true });
  }
}

// ── Choosing one ────────────────────────────────────────────────────────

let store: MediaStore | null = null;

export function mediaStoreKind(): "firebase" | "local" {
  const set = process.env.MEDIA_STORE?.toLowerCase();
  if (set === "local" || set === "firebase") return set;
  return process.env.DEV_AUTH_BYPASS === "true" ? "local" : "firebase";
}

export function getMediaStore(): MediaStore {
  if (store) return store;
  store = mediaStoreKind() === "local"
    ? new LocalStore(process.env.MEDIA_DIR || join(tmpdir(), "trackfit-media"), (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/$/, ""))
    : new FirebaseStore();
  return store;
}

/** Test hook. */
export function setMediaStore(s: MediaStore): void {
  store = s;
}
