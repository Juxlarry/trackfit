import { ExternalLink } from "lucide-react";
import { inAppBrowserName } from "../../lib/pwa";

/**
 * Google blocks sign-in inside in-app browsers (Telegram, Instagram…), and
 * they can't install the app either. Shown above the Google button so people
 * switch to a real browser before they hit Google's error page.
 */
export function InAppBrowserNote() {
  const app = inAppBrowserName();
  if (!app) return null;
  return (
    <div className="note" role="note" style={{ marginTop: 0, marginBottom: 16 }}>
      <ExternalLink />
      <span>You're in {app}'s built-in browser, where Google sign-in doesn't work. Tap <b>⋮</b> or <b>…</b> and choose <b>Open in browser</b>, or use email below.</span>
    </div>
  );
}
