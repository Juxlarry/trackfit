import type { IncomingHttpHeaders } from "node:http";
import { verifyFirebaseIdToken } from "./firebase.js";
import { getOrCreateUser } from "../../modules/identity/identity.service.js";
import { findUserById, type UserRow } from "../../modules/identity/identity.repository.js";

export interface GraphQLContext {
  user: UserRow | null;
  /** How the caller signed in. Null in dev-bypass mode. */
  auth?: { emailVerified: boolean; signInProvider: string | null; email?: string | null } | null;
  /** Caller's browser, stored with push subscriptions so people can tell devices apart. */
  userAgent?: string | null;
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
      return { user, auth: null };
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
  return { user, auth: { emailVerified: verified.emailVerified, signInProvider: verified.signInProvider, email: verified.email ?? null } };
}

export function requireUser(context: GraphQLContext): UserRow {
  if (!context.user) {
    const err = new Error("Not authenticated");
    (err as any).extensions = { code: "UNAUTHENTICATED" };
    throw err;
  }
  return context.user;
}

/**
 * The caller's email, lower-cased, only when it's proven theirs: from a
 * verified Firebase token. Email/password accounts can sign up with any
 * address, so an unverified one never counts. In dev-bypass mode (no auth
 * object at all) the stored email is trusted, so invites work locally.
 */
export function verifiedEmail(context: GraphQLContext): string | null {
  if (context.auth) return context.auth.emailVerified && context.auth.email ? context.auth.email.toLowerCase() : null;
  return DEV_AUTH_BYPASS && context.user?.email ? context.user.email.toLowerCase() : null;
}
