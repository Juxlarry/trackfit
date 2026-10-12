import { initializeApp, type FirebaseOptions } from "firebase/app";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";

/**
 * Firebase Authentication — phone+OTP, per architecture.md §5.
 *
 * Only initializes when real config is present. In dev-bypass mode
 * (VITE_DEV_AUTH_BYPASS=true, mirroring the backend's DEV_AUTH_BYPASS) none
 * of this runs — see auth/DevSignIn.tsx instead.
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

/** Starts phone sign-in: sends the OTP SMS. Call confirmationResult.confirm(code) next. */
export async function startPhoneSignIn(
  phoneNumber: string,
  recaptchaContainerId: string,
): Promise<ConfirmationResult> {
  const auth = getFirebaseAuth();
  const verifier = new RecaptchaVerifier(auth, recaptchaContainerId, { size: "invisible" });
  return signInWithPhoneNumber(auth, phoneNumber, verifier);
}
