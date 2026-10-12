import type { GraphQLContext } from "../../shared/auth/context.js";
import { requireUser } from "../../shared/auth/context.js";
import { createUser, updateUserProfile, type UnitsPreference } from "./identity.repository.js";

const DEV_AUTH_BYPASS = process.env.DEV_AUTH_BYPASS === "true";

export const identityResolvers = {
  Query: {
    me: (_parent: unknown, _args: unknown, context: GraphQLContext) => context.user,
  },
  Mutation: {
    devCreateUser: async (_parent: unknown, args: { displayName: string }) => {
      if (!DEV_AUTH_BYPASS) {
        throw new Error("devCreateUser is only available with DEV_AUTH_BYPASS=true");
      }
      // Dev-only convenience: a throwaway Firebase UID so the row satisfies
      // the unique constraint without a real Firebase token.
      const fakeFirebaseUid = `dev-${crypto.randomUUID()}`;
      return createUser({ firebaseUid: fakeFirebaseUid, displayName: args.displayName });
    },
    updateProfile: async (
      _parent: unknown,
      args: { input: { displayName?: string; units?: UnitsPreference } },
      context: GraphQLContext,
    ) => {
      const user = requireUser(context);
      return updateUserProfile(user.id, args.input);
    },
  },
  User: {
    // GraphQL's default String scalar coerces via Date.valueOf() (epoch ms)
    // before ever checking toJSON(), so every Date field needs an explicit
    // field resolver to come out as ISO-8601 instead of a raw number.
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
  },
};
