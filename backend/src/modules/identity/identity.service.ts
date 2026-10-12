import type { VerifiedFirebaseUser } from "../../shared/auth/firebase.js";
import { createUser, findUserByFirebaseUid, type UserRow } from "./identity.repository.js";

/**
 * Maps a verified Firebase identity to TrackFit's internal User record,
 * creating it on first login (architecture.md §5 — there's no separate
 * "signup" step; the first successful Firebase auth creates the account).
 */
export async function getOrCreateUser(verified: VerifiedFirebaseUser): Promise<UserRow> {
  const existing = await findUserByFirebaseUid(verified.firebaseUid);
  if (existing) return existing;

  return createUser({
    firebaseUid: verified.firebaseUid,
    displayName: verified.displayName ?? "TrackFit User",
    phoneNumber: verified.phoneNumber,
    email: verified.email,
  });
}
