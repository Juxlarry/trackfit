import type { GraphQLContext } from "../../shared/auth/context.js";
import { requireUser } from "../../shared/auth/context.js";
import { badInput } from "../../shared/errors.js";
import {
  deletePushSubscription, getReminderPrefs, setReminderPrefs, setUserTimeZone, upsertPushSubscription, type ReminderPrefsRow,
} from "./notifications.repository.js";
import { pushPublicKey, sendPushToUser } from "./push.js";
import { isValidTimeZone } from "./reminders.js";

interface SubscribeArg { endpoint: string; p256dh: string; auth: string; timeZone: string }

export const notificationsResolvers = {
  Query: {
    pushConfig: () => ({ publicKey: pushPublicKey() }),
    reminderPrefs: (_p: unknown, _a: unknown, ctx: GraphQLContext) => getReminderPrefs(requireUser(ctx).id),
  },
  Mutation: {
    subscribePush: async (_p: unknown, { input }: { input: SubscribeArg }, ctx: GraphQLContext) => {
      const user = requireUser(ctx);
      let url: URL;
      try { url = new URL(input.endpoint); } catch { throw badInput("That isn't a push address."); }
      if (url.protocol !== "https:" || input.endpoint.length > 1000 || input.p256dh.length > 200 || input.auth.length > 100) throw badInput("That isn't a push address.");
      if (!isValidTimeZone(input.timeZone)) throw badInput("Unknown time zone.", [{ field: "timeZone", message: "Use an IANA name like Africa/Accra." }]);
      await upsertPushSubscription(user.id, { endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth, userAgent: ctx.userAgent ?? null });
      await setUserTimeZone(user.id, input.timeZone);
      return true;
    },
    unsubscribePush: async (_p: unknown, { endpoint }: { endpoint: string }, ctx: GraphQLContext) => {
      await deletePushSubscription(requireUser(ctx).id, endpoint);
      return true;
    },
    setReminderPrefs: async (_p: unknown, { input }: { input: ReminderPrefsRow }, ctx: GraphQLContext) => {
      const userId = requireUser(ctx).id;
      await setReminderPrefs(userId, { weighIn: input.weighIn, progressPhotos: input.progressPhotos, missedSession: input.missedSession });
      return getReminderPrefs(userId);
    },
    sendTestPush: async (_p: unknown, _a: unknown, ctx: GraphQLContext) =>
      sendPushToUser(requireUser(ctx).id, { title: "Reminders are on", body: "This is how TrackFit will nudge you on training days.", url: "/today", tag: "test" }),
  },
};
