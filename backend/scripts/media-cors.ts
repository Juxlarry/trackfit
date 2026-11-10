/**
 * Lets the web app upload club photos and videos straight to the Firebase
 * Storage bucket (README, Deploying step 8). Run once, and again if the web
 * app's address changes:
 *
 *   npm run media:cors                       # allows APP_URL
 *   npm run media:cors -- https://other.app  # allows these origins instead
 *
 * Needs FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY and
 * FIREBASE_STORAGE_BUCKET (defaults to <project>.firebasestorage.app), the same values as on Render.
 */
import "dotenv/config";
import { firebaseAdmin } from "../src/shared/auth/firebase.js";

const origins = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!origins.length && process.env.APP_URL) origins.push(process.env.APP_URL);
const bucketName = process.env.FIREBASE_STORAGE_BUCKET || (process.env.FIREBASE_PROJECT_ID ? `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app` : "");
const missing = [
  !origins.length && "the web app's address (pass it, e.g. `npm run media:cors -- https://your-project.web.app`, or set APP_URL)",
  !bucketName && "FIREBASE_PROJECT_ID (or FIREBASE_STORAGE_BUCKET)",
  !process.env.FIREBASE_CLIENT_EMAIL && "FIREBASE_CLIENT_EMAIL",
  !process.env.FIREBASE_PRIVATE_KEY && "FIREBASE_PRIVATE_KEY",
].filter(Boolean);
if (missing.length) {
  console.error(`Missing: ${missing.join("; ")}.\nUse the same Firebase values as on Render (dashboard > trackfit-api > Environment).`);
  process.exit(1);
}
const clean = origins.map((o) => new URL(o).origin);
const bucket = firebaseAdmin().storage().bucket(bucketName);
await bucket.setCorsConfiguration([
  {
    origin: clean,
    method: ["PUT", "GET", "HEAD"],
    responseHeader: ["content-type", "x-goog-content-length-range"],
    maxAgeSeconds: 3600,
  },
]);
console.log(`Uploads to ${bucketName} are allowed from: ${clean.join(", ")}`);
