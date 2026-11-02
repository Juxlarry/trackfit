import webpush, { WebPushError } from "web-push";
import { deletePushSubscriptionById, listPushSubscriptions, markPushSent } from "./notifications.repository.js";

/**
 * Web Push (VAPID). Works in Chrome/Edge/Firefox on Android and desktop, and
 * on iPhone (iOS 16.4+) once TrackFit is added to the home screen.
 *
 * Generate keys once with `npx web-push generate-vapid-keys` and set
 * VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY. Without them push is off and the
 * reminder sheet says so.
 */
export interface PushMessage {
  title: string;
  body: string;
  /** Path to open on tap, e.g. "/today". */
  url: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag: string;
}

export type PushSender = (sub: webpush.PushSubscription, payload: string) => Promise<unknown>;

// A reminder an hour late is noise, so let the push service drop it.
let sender: PushSender = (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 3600, urgency: "normal" });

/** Tests swap in a fake push service (like setMailer). */
export function setPushSender(s: PushSender): void {
  sender = s;
}

let configured: boolean | null = null;
export function pushPublicKey(): string | null {
  if (configured === null) {
    const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
    // Push services require a contact: a mailto: address or the site's https URL.
    const subject = process.env.VAPID_SUBJECT || (process.env.APP_URL?.startsWith("https://") ? process.env.APP_URL : "mailto:hello@trackfit.app");
    configured = !!(pub && priv);
    if (configured) webpush.setVapidDetails(subject, pub!, priv!);
  }
  return configured ? process.env.VAPID_PUBLIC_KEY! : null;
}

/** Sends to every device the user turned notifications on for. Returns how many accepted it. */
export async function sendPushToUser(userId: string, msg: PushMessage): Promise<number> {
  if (!pushPublicKey()) return 0;
  const subs = await listPushSubscriptions(userId);
  const results = await Promise.all(subs.map(async (s) => {
    try {
      await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg));
      await markPushSent(s.id);
      return 1;
    } catch (err) {
      if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) await deletePushSubscriptionById(s.id);
      else console.error(`Push to ${new URL(s.endpoint).host} failed:`, err instanceof Error ? err.message : err);
      return 0;
    }
  }));
  return results.reduce<number>((a, b) => a + b, 0);
}
