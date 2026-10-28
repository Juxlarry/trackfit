import { initializeApp, type FirebaseOptions } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  type User,
} from "firebase/auth";

/**
 * Firebase Authentication: Google sign-in and email/password with email
 * verification (architecture.md §5, v0.6). Phone + OTP from MVP 1 can be
 * re-enabled later as an extra provider.
 *
 * Only initializes when real config is present. In dev-bypass mode
 * (VITE_DEV_AUTH_BYPASS=true, mirroring the backend's DEV_AUTH_BYPASS) none
 * of this runs.
 */
const config: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const DEV_AUTH_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === "true";

let app: ReturnType<typeof initializeApp> | null = null;
export function getFirebaseApp() {
  if (!app) app = initializeApp(config);
  return app;
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export async function signInWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
  return cred.user;
}

/** Creates the account and sends Firebase's verification email. */
export async function signUpWithEmail(email: string, password: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  try {
    await sendEmailVerification(cred.user);
  } catch {
    // Non-fatal: the user can resend from the welcome screen.
  }
  return cred.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  return cred.user;
}

export async function resendVerification(): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (user) await sendEmailVerification(user);
}

/** Plain-language messages for the Firebase errors users actually hit. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/email-already-in-use": "That email already has a TrackFit account. Sign in instead.",
    "auth/invalid-email": "That doesn't look like a full email address, for example ama@gmail.com.",
    "auth/weak-password": "Use at least 8 characters with a letter and a number.",
    "auth/invalid-credential": "That email and password don't match. Check them and try again.",
    "auth/wrong-password": "That email and password don't match. Check them and try again.",
    "auth/user-not-found": "There's no account with that email yet. Build your plan to create one.",
    "auth/popup-closed-by-user": "The Google window closed before you finished. Try again.",
    "auth/popup-blocked": "Your browser blocked the Google window. Allow pop-ups for this site and try again.",
    "auth/network-request-failed": "No connection. Check your internet and try again.",
    "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  };
  return map[code] ?? (err instanceof Error ? err.message : "Something went wrong. Try again.");
}
