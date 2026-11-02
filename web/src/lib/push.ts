import type { ApolloClient } from "@apollo/client";
import { PUSH_CONFIG, SUBSCRIBE_PUSH, UNSUBSCRIBE_PUSH } from "../graphql/operations";
import { inAppBrowserName, isIos, isStandalone } from "./pwa";

/**
 * Workout reminders as push notifications (backend: modules/notifications).
 * The service worker (public/sw.js) shows them, so they arrive with TrackFit
 * closed. iPhone only allows this for home-screen apps (iOS 16.4+).
 */
export type PushStatus =
  | "on" // this device is subscribed
  | "off" // can be turned on with one tap
  | "denied" // the user blocked notifications for the site
  | "needs-install" // iPhone in Safari: add to home screen first
  | "in-app" // Telegram/Instagram browser
  | "unsupported" // old browser
  | "server-off"; // the API has no VAPID keys yet

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

async function publicKey(client: ApolloClient): Promise<string | null> {
  const { data } = await client.query<{ pushConfig: { publicKey: string | null } }>({ query: PUSH_CONFIG, fetchPolicy: "cache-first" });
  return data?.pushConfig.publicKey ?? null;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function save(client: ApolloClient, sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  await client.mutate({
    mutation: SUBSCRIBE_PUSH,
    variables: { input: { endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } },
  });
}

export async function pushStatus(client: ApolloClient): Promise<PushStatus> {
  if (inAppBrowserName()) return "in-app";
  if (isIos() && !isStandalone()) return "needs-install";
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (!(await publicKey(client).catch(() => null))) return "server-off";
  if (Notification.permission !== "granted") return "off";
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ? "on" : "off";
}

/**
 * Asks for permission and subscribes this device. Call straight from a tap:
 * Safari only shows the permission prompt during a user gesture, so nothing
 * slow may run before requestPermission.
 */
export async function enablePush(client: ApolloClient): Promise<PushStatus> {
  if (!supported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const key = await publicKey(client);
  if (!key) return "server-off";
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  await save(client, sub);
  return "on";
}

/**
 * On each app open: re-sends this device's subscription (push services rotate
 * them, and it keeps the user's time zone current). Never prompts.
 */
export async function syncPush(client: ApolloClient): Promise<void> {
  if (!supported() || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await save(client, sub);
}

/** Before sign-out, so the next person on this browser doesn't get your reminders. */
export async function disablePushHere(client: ApolloClient): Promise<void> {
  if (!supported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await client.mutate({ mutation: UNSUBSCRIBE_PUSH, variables: { endpoint: sub.endpoint } });
  await sub.unsubscribe();
}
