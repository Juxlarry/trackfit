import { useSyncExternalStore } from "react";
import { useAuth } from "../auth/AuthContext";
import { readJson, removeKey, writeJson } from "./storage";

/**
 * The workout in progress (README "A started workout is never lost").
 * Saved on this device as it changes, so leaving the workout screen, another
 * app, a locked phone or a reload never loses it. Cleared on Finish or Discard.
 * Times are stored as timestamps, so the clock and rest stay right while away.
 */

export type Ease = "EASY" | "OKAY" | "HARD";
export interface WorkoutRow { kg: string; reps: string; done: boolean }
export interface OneOffSwap {
  exerciseId: string; name: string; equipment: string; sameMovement: boolean; reason: string; suggestedLoadKg: number | null;
  replaces: { exerciseId: string; name: string };
}
export interface ActiveWorkout {
  v: 1;
  templateId: string;
  date: string;
  name: string;
  startedAt: number;
  /** Last tick or edit, for "Still training?". */
  touchedAt: number;
  rows: WorkoutRow[][];
  warm: boolean[];
  oneOff: Record<number, OneOffSwap>;
  ratings: Record<number, Ease>;
  /** Progression offers answered in this workout: true = accepted, false = kept. */
  offers: Record<number, boolean>;
  rest: { endsAt: number; total: number; ei: number; si: number } | null;
}

/** After this long without a tick, the resume bar asks "Still training?". */
export const STALE_MS = 4 * 60 * 60 * 1000;

const keyFor = (user: string) => `trackfit.activeWorkout.${user}`;
const EVENT = "trackfit:active-workout";
let cache: { key: string; raw: string | null; value: ActiveWorkout | null } | null = null;

export function readActive(user: string | null): ActiveWorkout | null {
  if (!user) return null;
  const key = keyFor(user);
  let raw: string | null = null;
  try { raw = localStorage.getItem(key); } catch { /* private mode */ }
  // A memory copy keeps working where storage is blocked.
  if (raw === null && memory.has(key)) return memory.get(key)!;
  if (cache && cache.key === key && cache.raw === raw) return cache.value;
  const value = raw ? readJson<ActiveWorkout | null>(key, null) : null;
  cache = { key, raw, value: value && value.v === 1 ? value : null };
  return cache.value;
}

const memory = new Map<string, ActiveWorkout>();

export function writeActive(user: string | null, w: ActiveWorkout): void {
  if (!user) return;
  memory.set(keyFor(user), w);
  writeJson(keyFor(user), w);
  window.dispatchEvent(new Event(EVENT));
}

export function clearActive(user: string | null): void {
  if (!user) return;
  memory.delete(keyFor(user));
  removeKey(keyFor(user));
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
}

/** Who the saved workout belongs to: the Firebase user, or the dev-bypass id. */
export function useWorkoutUser(): string | null {
  const { firebaseUser, devUserId } = useAuth();
  return firebaseUser?.uid ?? devUserId ?? null;
}

export function useActiveWorkout(): { user: string | null; active: ActiveWorkout | null } {
  const user = useWorkoutUser();
  const active = useSyncExternalStore(subscribe, () => readActive(user), () => null);
  return { user, active };
}

export const sessionPath = (w: { templateId: string; date: string }) => `/session/${w.templateId}?date=${w.date}`;
