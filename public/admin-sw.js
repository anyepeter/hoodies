// AkatsukiZipUp admin service worker: web push only (no caching, no fetch handler, so it never sits between the
// admin and the network). Registered by src/components/admin/AdminRealtime.tsx with scope "/admin/".
// Payload (src/lib/push.ts): { title, body, url, tag }.

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "AkatsukiZipUp Admin";
  const options = {
    body: data.body || "",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    // Only a path on this site ("/admin/…", never "//elsewhere"), so a tap can't send anyone off-site.
    data: { url: typeof data.url === "string" && /^\/(?![\/\\])[^\s\\]*$/.test(data.url) ? data.url : "/admin" },
    icon: "/icon.png",
    badge: "/icon.png",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping a notification: bring an open admin tab forward and send it to the page, or open a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/admin", self.location.origin);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const admin = windows.find((c) => {
        try {
          const u = new URL(c.url);
          return u.origin === target.origin && (u.pathname === "/admin" || u.pathname.startsWith("/admin/"));
        } catch {
          return false;
        }
      });
      if (admin) {
        try {
          await admin.focus();
          // The page navigates itself (client-side, no reload): AdminRealtime listens for this message.
          admin.postMessage({ type: "akz:navigate", url: target.pathname + target.search });
          return;
        } catch {
          // fall through and open a fresh window
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target.href);
    })(),
  );
});
