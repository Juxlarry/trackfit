import { identityTypeDefs } from "../modules/identity/identity.schema.js";
import { identityResolvers } from "../modules/identity/identity.resolvers.js";
import { trackingTypeDefs } from "../modules/tracking/tracking.schema.js";
import { trackingResolvers } from "../modules/tracking/tracking.resolvers.js";

/**
 * Schema composition: Identity defines the base Query/Mutation types,
 * every other module extends them (architecture.md §3 — "a GraphQL schema
 * organized by module"). When Nutrition/Goals/Social/Notifications are
 * built, they plug in here the same way Tracking does.
 */
export const typeDefs = [identityTypeDefs, trackingTypeDefs];

function mergeResolvers(...maps: Record<string, any>[]) {
  const merged: Record<string, any> = {};
  for (const map of maps) {
    for (const [typeName, fields] of Object.entries(map)) {
      merged[typeName] = { ...(merged[typeName] ?? {}), ...fields };
    }
  }
  return merged;
}

export const resolvers = mergeResolvers(identityResolvers, trackingResolvers);
