import { useEffect, useState } from "react";

/**
 * "Install as an app" support: service worker registration (public/sw.js),
 * Chrome/Edge/Android's install prompt, and the cases where installing isn't
 * possible yet (iOS needs Safari's Share menu; in-app browsers like Telegram's
 * can't install or complete Google sign-in at all).
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => { void navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// The event fires once, often before React mounts, so catch it at module load.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

const ua = () => navigator.userAgent;

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

export const isIos = () => /iPhone|iPad|iPod/.test(ua()) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Telegram, Instagram, Facebook, TikTok, LinkedIn, Snapchat and generic Android WebViews. */
export function inAppBrowserName(): string | null {
  const u = ua();
  if (/Telegram/i.test(u) || "TelegramWebview" in window || "TelegramWebviewProxy" in window) return "Telegram";
  if (/Instagram/i.test(u)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(u)) return "Facebook";
  if (/musical_ly|BytedanceWebview|TikTok/i.test(u)) return "TikTok";
  if (/LinkedInApp/i.test(u)) return "LinkedIn";
  if (/Snapchat/i.test(u)) return "Snapchat";
  if (/Android.*; wv\)/.test(u)) return "this app";
  return null;
}

export type InstallState =
  | { kind: "installed" }
  | { kind: "prompt"; install: () => Promise<boolean> }
  | { kind: "ios" }
  | { kind: "in-app"; app: string }
  | { kind: "unsupported" };

export function useInstall(): InstallState {
  const [, rerender] = useState(0);
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  if (isStandalone()) return { kind: "installed" };
  const app = inAppBrowserName();
  if (app) return { kind: "in-app", app };
  if (deferred) {
    const ev = deferred;
    return {
      kind: "prompt",
      install: async () => {
        await ev.prompt();
        const { outcome } = await ev.userChoice;
        deferred = null;
        listeners.forEach((l) => l());
        return outcome === "accepted";
      },
    };
  }
  if (isIos()) return { kind: "ios" };
  return { kind: "unsupported" };
}
