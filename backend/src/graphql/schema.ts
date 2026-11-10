import { identityTypeDefs } from "../modules/identity/identity.schema.js";
import { identityResolvers } from "../modules/identity/identity.resolvers.js";
import { trackingTypeDefs } from "../modules/tracking/tracking.schema.js";
import { trackingResolvers } from "../modules/tracking/tracking.resolvers.js";
import { planningTypeDefs } from "../modules/planning/planning.schema.js";
import { planningResolvers } from "../modules/planning/planning.resolvers.js";
import { nutritionTypeDefs } from "../modules/nutrition/nutrition.schema.js";
import { nutritionResolvers } from "../modules/nutrition/nutrition.resolvers.js";
import { notificationsTypeDefs } from "../modules/notifications/notifications.schema.js";
import { notificationsResolvers } from "../modules/notifications/notifications.resolvers.js";
import { clubsTypeDefs } from "../modules/clubs/clubs.schema.js";
import { clubsResolvers } from "../modules/clubs/clubs.resolvers.js";
import { feedTypeDefs } from "../modules/clubs/feed.schema.js";
import { feedResolvers } from "../modules/clubs/feed.resolvers.js";
import { routinesTypeDefs } from "../modules/clubs/routines.schema.js";
import { routinesResolvers } from "../modules/clubs/routines.resolvers.js";

/**
 * Schema composition: Identity defines the base Query/Mutation types,
 * every other module extends them (architecture.md §3 — "a GraphQL schema
 * organized by module"). When Nutrition/Goals/Social/Notifications are
 * built, they plug in here the same way Tracking does. MVP 2 adds Planning
 * (onboarding orchestration, architecture.md §3.1) and Nutrition; push
 * reminders add Notifications; Clubs v1 adds Clubs.
 */
export const typeDefs = [identityTypeDefs, trackingTypeDefs, planningTypeDefs, nutritionTypeDefs, notificationsTypeDefs, clubsTypeDefs, feedTypeDefs, routinesTypeDefs];

function mergeResolvers(...maps: Record<string, any>[]) {
  const merged: Record<string, any> = {};
  for (const map of maps) {
    for (const [typeName, fields] of Object.entries(map)) {
      merged[typeName] = { ...(merged[typeName] ?? {}), ...fields };
    }
  }
  return merged;
}

export const resolvers = mergeResolvers(identityResolvers, trackingResolvers, planningResolvers, nutritionResolvers, notificationsResolvers, clubsResolvers, feedResolvers, routinesResolvers);
