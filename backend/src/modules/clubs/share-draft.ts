import { ACTIVITY_TYPES } from "../planning/engine/index.js";
import type { WorkoutPr } from "../tracking/tracking.service.js";

/**
 * The drafted text in "Share with <club>?" after a workout or activity
 * (README "Clubs v1", "Sharing after a workout or activity"). It's only a
 * starting point: the member can edit it before posting.
 */
export type Units = "METRIC" | "IMPERIAL";

const LB = 2.20462;
const MI = 1.609344;
const n0 = (x: number) => Math.round(x).toLocaleString("en-GB");
const trim1 = (x: number) => String(Math.round(x * 10) / 10);

export function weightText(kg: number, units: Units): string {
  return units === "IMPERIAL" ? `${n0(kg * LB)} lb` : `${trim1(kg)} kg`;
}

export function minutesText(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** PRs worth announcing: the heaviest set or a new estimated 1RM, one per exercise (most-reps-at-a-weight is too noisy). */
export function headlinePrs(prs: WorkoutPr[]): WorkoutPr[] {
  const out: WorkoutPr[] = [];
  for (const type of ["HEAVIEST_SET", "ESTIMATED_1RM"] as const) {
    for (const p of prs) if (p.type === type && !out.some((o) => o.exerciseName === p.exerciseName)) out.push(p);
  }
  return out;
}

export function workoutDraft(w: {
  name: string; durationMinutes: number | null; setCount: number; volumeKg: number;
  exercises: { name: string }[]; prs: WorkoutPr[];
}, units: Units): string {
  const parts = [`${w.exercises.length} exercise${w.exercises.length === 1 ? "" : "s"}`, `${w.setCount} set${w.setCount === 1 ? "" : "s"}`];
  if (w.volumeKg > 0) parts.push(`${units === "IMPERIAL" ? `${n0(w.volumeKg * LB)} lb` : `${n0(w.volumeKg)} kg`} moved`);
  let text = `${w.name} done${w.durationMinutes ? ` in ${minutesText(w.durationMinutes)}` : ""}: ${parts.join(", ")}.`;
  const prs = headlinePrs(w.prs).slice(0, 3);
  if (prs.length) {
    const list = prs.map((p) => `${p.exerciseName} ${weightText(p.weightKg, units)} × ${p.reps}`).join(", ");
    text += ` New best${prs.length > 1 ? "s" : ""}: ${list}.`;
  }
  return text;
}

const VERB: Record<string, string> = { RUN: "Ran", WALK: "Walked", HIKE: "Hiked", CYCLE: "Cycled", SWIM: "Swam", ROW: "Rowed" };
const FOR: Record<string, string> = {
  SKIP: "Skipped rope", FOOTBALL: "Played football", BASKETBALL: "Played basketball", DANCE: "Danced",
};

/** "5:31 /km" (or per mile): minutes per unit of distance. */
export function paceText(minutes: number, km: number, units: Units): string {
  const per = units === "IMPERIAL" ? minutes / (km / MI) : minutes / km;
  let m = Math.floor(per), s = Math.round((per - m) * 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, "0")} /${units === "IMPERIAL" ? "mi" : "km"}`;
}

export function speedText(minutes: number, km: number, units: Units): string {
  const kmh = km / (minutes / 60);
  return units === "IMPERIAL" ? `${(kmh / MI).toFixed(1)} mph` : `${kmh.toFixed(1)} km/h`;
}

export function distanceText(km: number, units: Units): string {
  return units === "IMPERIAL" ? `${trim1(km / MI)} mi` : `${trim1(km)} km`;
}

export function activityDraft(a: { activityType: string; durationMinutes: number; distanceKm: number | null }, units: Units): string {
  const t = minutesText(a.durationMinutes);
  const km = a.distanceKm && a.distanceKm > 0 ? a.distanceKm : null;
  const verb = VERB[a.activityType];
  if (verb && km) {
    const rate = a.activityType === "CYCLE" ? speedText(a.durationMinutes, km, units) : a.activityType === "RUN" || a.activityType === "WALK" ? paceText(a.durationMinutes, km, units) : null;
    return `${verb} ${distanceText(km, units)} in ${t}${rate ? ` (${rate})` : ""}.`;
  }
  if (verb) return `${verb} for ${t}.`;
  if (FOR[a.activityType]) return `${FOR[a.activityType]} for ${t}.`;
  const label = ACTIVITY_TYPES[a.activityType]?.label;
  return label ? `Did the ${label.toLowerCase()} (${t}).` : `Logged an activity: ${t}.`;
}

/** The post kind a logged activity becomes. */
export function activityPostKind(activityType: string): "RUN" | "CYCLE" | "ACTIVITY" {
  return activityType === "RUN" ? "RUN" : activityType === "CYCLE" ? "CYCLE" : "ACTIVITY";
}
