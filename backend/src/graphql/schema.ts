import { identityTypeDefs } from "../modules/identity/identity.schema.js";
import { identityResolvers } from "../modules/identity/identity.resolvers.js";
import { trackingTypeDefs } from "../modules/tracking/tracking.schema.js";
import { trackingResolvers } from "../modules/tracking/tracking.resolvers.js";
import { planningTypeDefs } from "../modules/planning/planning.schema.js";
import { planningResolvers } from "../modules/planning/planning.resolvers.js";
import { nutritionTypeDefs } from "../modules/nutrition/nutrition.schema.js";
import { nutritionResolvers } from "../modules/nutrition/nutrition.resolvers.js";

/**
 * Schema composition: Identity defines the base Query/Mutation types,
 * every other module extends them (architecture.md §3 — "a GraphQL schema
 * organized by module"). When Nutrition/Goals/Social/Notifications are
 * built, they plug in here the same way Tracking does. MVP 2 adds Planning
 * (onboarding orchestration, architecture.md §3.1) and Nutrition.
 */
export const typeDefs = [identityTypeDefs, trackingTypeDefs, planningTypeDefs, nutritionTypeDefs];

function mergeResolvers(...maps: Record<string, any>[]) {
  const merged: Record<string, any> = {};
  for (const map of maps) {
    for (const [typeName, fields] of Object.entries(map)) {
      merged[typeName] = { ...(merged[typeName] ?? {}), ...fields };
    }
  }
  return merged;
}

export const resolvers = mergeResolvers(identityResolvers, trackingResolvers, planningResolvers, nutritionResolvers);
