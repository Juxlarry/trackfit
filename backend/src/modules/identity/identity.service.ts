import { requireUser, type GraphQLContext } from "../../shared/auth/context.js";
import type { VerifiedFirebaseUser } from "../../shared/auth/firebase.js";
import { forbidden } from "../../shared/errors.js";
import { createUser, findUserByFirebaseUid, getAppRole, type AppRole, type UserRow } from "./identity.repository.js";

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

/**
 * The console's gate: the caller must be the App Owner (ownerOnly) or an App
 * Owner/Admin. Checked on every console call, never trusted from the client.
 */
export async function requireAppStaff(context: GraphQLContext, ownerOnly = false): Promise<{ user: UserRow; role: AppRole }> {
  const user = requireUser(context);
  const role = await getAppRole(user.id);
  if (!role || (ownerOnly && role !== "OWNER")) {
    throw forbidden(ownerOnly ? "Only the App Owner can do this." : "Only the App Owner and App Admins can do this.");
  }
  return { user, role };
}
