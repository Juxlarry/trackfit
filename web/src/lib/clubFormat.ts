import type { ClubPostKind, ClubReaction } from "../graphql/types";

/** Wording for the club feed, in the viewer's units. */

export const REACTION_EMOJI: Record<ClubReaction, string> = { FIRE: "🔥", STRONG: "💪", CLAP: "👏", HEART: "❤️" };
export const REACTION_LABEL: Record<ClubReaction, string> = { FIRE: "Fire", STRONG: "Strong", CLAP: "Applause", HEART: "Love" };
export const REACTIONS: ClubReaction[] = ["FIRE", "STRONG", "CLAP", "HEART"];

export const KIND_LABEL: Record<ClubPostKind, string> = {
  WORKOUT: "Workout", RUN: "Run", CYCLE: "Ride", ACTIVITY: "Activity", PROGRESS: "Progress", MEAL: "Meal",
  CHALLENGE_WIN: "Challenge win", COACH_VIDEO: "Coach video",
};

/** "just now", "5 min ago", "3 h ago", "yesterday", then a date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 2 * 86_400) return "yesterday";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}) });
}

const MI = 1.609344;
export const distanceText = (km: number, imperial: boolean) => (imperial ? `${(Math.round((km / MI) * 10) / 10)} mi` : `${Math.round(km * 10) / 10} km`);

export function paceText(minutes: number, km: number, imperial: boolean): string {
  const per = imperial ? minutes / (km / MI) : minutes / km;
  let m = Math.floor(per), s = Math.round((per - m) * 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, "0")} /${imperial ? "mi" : "km"}`;
}

export function speedText(minutes: number, km: number, imperial: boolean): string {
  const kmh = km / (minutes / 60);
  return imperial ? `${(kmh / MI).toFixed(1)} mph` : `${kmh.toFixed(1)} km/h`;
}

export function minutesText(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "Kofi", "Kofi · Coach", "Kofi · Admin and Coach", or "Kofi · left the club". */
export function personLabel(p: { isAdmin: boolean; isCoach: boolean; inClub: boolean }): string | null {
  if (!p.inClub) return "Left the club";
  if (p.isAdmin && p.isCoach) return "Admin and Coach";
  return p.isAdmin ? "Admin" : p.isCoach ? "Coach" : null;
}

export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

// ── Club routines ───────────────────────────────────────────────────────

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_PLURAL = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

/** "Every day", "Weekdays", "Weekends", "Tuesdays", or "Tue, Thu". */
export function routineDays(weekdays: number[]): string {
  const d = [...weekdays].sort((a, b) => a - b).join(",");
  if (d === "0,1,2,3,4,5,6") return "Every day";
  if (d === "0,1,2,3,4") return "Weekdays";
  if (d === "5,6") return "Weekends";
  if (weekdays.length === 1) return DAY_PLURAL[weekdays[0]];
  return [...weekdays].sort((a, b) => a - b).map((x) => DAY_SHORT[x]).join(", ");
}

/** What counts: "Running, at least 5 km" or "4 exercises, 11 sets". */
export function routineRule(r: { kind: string; activityLabel: string | null; minDistanceKm: number | null; minMinutes: number | null; exercises: { sets: number }[] }, imperial: boolean): string {
  if (r.kind === "WORKOUT") {
    const sets = r.exercises.reduce((a, e) => a + e.sets, 0);
    return `${r.exercises.length} exercise${r.exercises.length === 1 ? "" : "s"}, ${sets} sets`;
  }
  const parts = [r.activityLabel ?? "Any activity"];
  if (r.minDistanceKm) parts.push(`at least ${distanceText(r.minDistanceKm, imperial)}`);
  if (r.minMinutes) parts.push(`${minutesText(r.minMinutes)} or more`);
  return parts.join(", ");
}
