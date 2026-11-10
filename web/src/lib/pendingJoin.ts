import { readJson, removeKey, writeJson } from "./storage";

/**
 * A club join link someone opened before they could use it (signed out, or
 * no plan yet). Kept on the device through sign-in or the quiz; the app
 * shell sends them back to it once, then forgets it.
 */
const KEY = "trackfit.pendingJoin";

export const savePendingJoin = (token: string) => writeJson(KEY, token);
export const clearPendingJoin = () => removeKey(KEY);

/** Returns the token and forgets it, so the redirect happens once. */
export function takePendingJoin(): string | null {
  const token = readJson<string | null>(KEY, null);
  if (token) removeKey(KEY);
  return token;
}
