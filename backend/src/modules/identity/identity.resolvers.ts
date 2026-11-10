import type { GraphQLContext } from "../../shared/auth/context.js";
import { requireUser } from "../../shared/auth/context.js";
import { badInput } from "../../shared/errors.js";
import {
  addAppAdmin, createUser, findUserByEmail, getAppRole, listAppStaff, removeAppAdmin, updateUserProfile, type AppStaffRow, type UnitsPreference,
} from "./identity.repository.js";
import { requireAppStaff } from "./identity.service.js";

const DEV_AUTH_BYPASS = process.env.DEV_AUTH_BYPASS === "true";

export const identityResolvers = {
  Query: {
    me: (_parent: unknown, _args: unknown, context: GraphQLContext) => context.user,
    appStaff: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      await requireAppStaff(context);
      return listAppStaff();
    },
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
    addAppAdmin: async (_parent: unknown, args: { email: string }, context: GraphQLContext) => {
      const { user } = await requireAppStaff(context, true);
      const target = await findUserByEmail(args.email.trim());
      if (!target) throw badInput("Nobody with that email has signed in to TrackFit yet. Ask them to sign in once, then add them.", [{ field: "email", message: "No account yet." }]);
      if (!(await addAppAdmin(target.id, user.id))) throw badInput("That person already has an app role.", [{ field: "email", message: "Already staff." }]);
      return listAppStaff();
    },
    removeAppAdmin: async (_parent: unknown, args: { userId: string }, context: GraphQLContext) => {
      await requireAppStaff(context, true);
      if (!(await removeAppAdmin(args.userId))) throw badInput("That person isn't an App Admin.");
      return listAppStaff();
    },
  },
  User: {
    // GraphQL's default String scalar coerces via Date.valueOf() (epoch ms)
    // before ever checking toJSON(), so every Date field needs an explicit
    // field resolver to come out as ISO-8601 instead of a raw number.
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    // Only for the caller themselves: nobody learns another user's role from this.
    appRole: (parent: { id: string }, _args: unknown, context: GraphQLContext) =>
      context.user?.id === parent.id ? getAppRole(parent.id) : null,
  },
  AppStaff: {
    grantedAt: (parent: AppStaffRow) => parent.grantedAt.toISOString(),
  },
};
