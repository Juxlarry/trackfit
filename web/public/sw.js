// TrackFit service worker. Makes the installed app open instantly and show
// the last-loaded app shell when offline. Data (GraphQL, Firebase) is never
// cached here, so nothing goes stale: only the HTML shell and the hashed,
// immutable build files under /assets/.
const CACHE = "trackfit-shell-v1";
const SHELL = ["/index.html", "/favicon.svg", "/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Firebase Auth's /__/ handlers and anything off-site go straight to the network.
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/__/")) return;

  // Pages: always try for the latest deploy, fall back to the cached shell offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) void caches.open(CACHE).then((c) => c.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  // Hashed build output never changes, so serve it from cache once seen.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        if (res.ok) void caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })),
    );
  }
});

// Workout reminders (backend modules/notifications). Payload: { title, body, url, tag }.
self.addEventListener("push", (event) => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch { msg = { body: event.data && event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(msg.title || "TrackFit", {
      body: msg.body || "",
      tag: msg.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: msg.url || "/today" },
    }),
  );
});

// Tap: focus an open TrackFit window on that page, or open one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/today", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) return win.focus().then((w) => (w && "navigate" in w ? w.navigate(url) : w));
      return self.clients.openWindow(url);
    }),
  );
});
