import admin from "firebase-admin";

/**
 * Firebase Admin SDK initialization for verifying ID tokens issued by
 * Firebase Authentication (phone+OTP, Facebook — architecture.md §5).
 *
 * This only initializes when real Firebase service-account credentials are
 * present. In DEV_AUTH_BYPASS mode (see shared/auth/context.ts) none of this
 * runs — that mode exists so this backend is testable in an environment
 * with no live Firebase project yet.
 */
let initialized = false;

function ensureInitialized() {
  if (initialized) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin credentials are not configured. Set FIREBASE_PROJECT_ID, " +
        "FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY (from your Firebase service " +
        "account JSON), or set DEV_AUTH_BYPASS=true for local development.",
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
  initialized = true;
}

export interface VerifiedFirebaseUser {
  firebaseUid: string;
  phoneNumber?: string;
  email?: string;
  displayName?: string;
}

/** Verifies a Firebase ID token sent by the client and returns its claims. */
export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
  ensureInitialized();
  const decoded = await admin.auth().verifyIdToken(idToken);
  return {
    firebaseUid: decoded.uid,
    phoneNumber: decoded.phone_number,
    email: decoded.email,
    displayName: (decoded.name as string | undefined) ?? decoded.phone_number ?? decoded.email,
  };
}
