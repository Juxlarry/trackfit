import { addDaysIso, mondayOf, weekdayOf } from "@engine";

export { addDaysIso, mondayOf, weekdayOf };

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Today's date in the user's own time zone, as YYYY-MM-DD. */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const asDate = (iso: string) => new Date(iso + "T12:00:00");
/** "Tuesday 27 October" */
export const dayLabel = (iso: string) => asDate(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
/** "Tue 27 Oct" */
export const dayShort = (iso: string) => asDate(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
/** "27 October 2026" */
export const dateLong = (iso: string) => asDate(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
export const dayOfMonth = (iso: string) => Number(iso.slice(8, 10));
export const daysUntil = (fromIso: string, toIso: string) => Math.round((asDate(toIso).getTime() - asDate(fromIso).getTime()) / 86_400_000);

/** Midday local time on a date, as an ISO timestamp (for logging a past session on its own day). */
export const noonOn = (iso: string) => asDate(iso).toISOString();

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
