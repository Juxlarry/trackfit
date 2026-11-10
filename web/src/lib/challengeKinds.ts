import { Droplet, Dumbbell, Flag, Utensils, type LucideIcon } from "lucide-react";
import type { ClubChallengeDto, ClubChallengeKind } from "../graphql/types";
import { clockText } from "./clubFormat";

/** Shared bits for club challenges (app/clubs/Challenges.tsx and friends). */

export const KIND_ICON: Record<ClubChallengeKind, LucideIcon> = { WORKOUT: Dumbbell, ACTIVITY: Flag, FOOD: Utensils, WATER: Droplet };
export const KIND_NAME: Record<ClubChallengeKind, string> = { WORKOUT: "Workout", ACTIVITY: "Activity", FOOD: "Food", WATER: "Water" };
/** Queries to refresh after anything changes a challenge. */
export const REFETCH_CHALLENGES = ["MyClubChallenges", "ClubChallenge", "ClubChallenges", "PendingClubChallenges"];

/** The result in words, for an entry. */
export function entryText(c: Pick<ClubChallengeDto, "kind">, e: { resultSeconds: number | null; resultReps: number | null; distanceKm: number | null; minutes: number | null; waterMl: number | null }, imperial: boolean) {
  if (c.kind === "WORKOUT") return [e.resultSeconds ? clockText(e.resultSeconds) : "", e.resultReps ? `${e.resultReps} reps` : ""].filter(Boolean).join(", ");
  if (c.kind === "ACTIVITY") return [e.distanceKm ? (imperial ? `${Math.round((e.distanceKm / 1.609344) * 10) / 10} mi` : `${e.distanceKm} km`) : "", e.minutes ? `${e.minutes} min` : ""].filter(Boolean).join(" in ");
  if (c.kind === "WATER") return e.waterMl ? `${e.waterMl.toLocaleString("en-GB")} ml` : "";
  return "Done";
}

