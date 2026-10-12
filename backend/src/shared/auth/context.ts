import type { IncomingHttpHeaders } from "node:http";
import { verifyFirebaseIdToken } from "./firebase.js";
import { getOrCreateUser } from "../../modules/identity/identity.service.js";
import { findUserById, type UserRow } from "../../modules/identity/identity.repository.js";

export interface GraphQLContext {
  user: UserRow | null;
}

const DEV_AUTH_BYPASS = process.env.DEV_AUTH_BYPASS === "true";

/**
 * Builds the per-request GraphQL context by resolving the caller's identity.
 *
 * Production path: verifies the Firebase ID token from the Authorization
 * header and maps it to (or creates) the internal User.
 *
 * Dev path (DEV_AUTH_BYPASS=true, NEVER set in production): trusts an
 * `x-dev-user-id` header directly, or creates/reuses a fixed dev user if
 * none is given, so the API is testable without a live Firebase project.
 * See backend/README.md.
 */
export async function buildContext(headers: IncomingHttpHeaders): Promise<GraphQLContext> {
  if (DEV_AUTH_BYPASS) {
    const devUserId = headers["x-dev-user-id"];
    if (typeof devUserId === "string") {
      const user = await findUserById(devUserId);
      return { user };
    }
    // No header at all → anonymous request (e.g. introspection); mutations
    // that require a user will reject with UNAUTHENTICATED as normal.
    return { user: null };
  }

  const authHeader = headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return { user: null };
  }

  const idToken = authHeader.slice("Bearer ".length);
  const verified = await verifyFirebaseIdToken(idToken);
  const user = await getOrCreateUser(verified);
  return { user };
}

export function requireUser(context: GraphQLContext): UserRow {
  if (!context.user) {
    const err = new Error("Not authenticated");
    (err as any).extensions = { code: "UNAUTHENTICATED" };
    throw err;
  }
  return context.user;
}
