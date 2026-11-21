// AkatsukiZipUp store service worker: notifications for shoppers, nothing else. No fetch handler and no caching,
// so it never sits between the shopper and the network. Registered with scope "/" only when a shopper taps
// "Turn on notifications" in the chat (src/components/chat/NotifyCard.tsx), never on page load.
// The admin's own worker is /admin-sw.js (scope "/admin/"); pages under /admin/ keep using that one.
// Payload (src/lib/chat/visitor-push.ts): { title, body, url, tag }.

// Only a path on this site ("/x", never "//elsewhere" or "/\elsewhere"), so a tap can't send anyone off-site.
const SAFE_PATH = /^\/(?![\/\\])[^\s\\]*$/;
const safePath = (url) => (typeof url === "string" && SAFE_PATH.test(url) ? url : "/");

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

// Every push shows a notification (browsers drop subscriptions that receive silent ones).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "AkatsukiZipUp";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      renotify: typeof data.tag === "string",
      icon: "/icon.png",
      badge: "/icon.png",
      data: { url: safePath(data.url) },
    }),
  );
});

// Tapping it: bring an open store tab forward and tell it where to go (the chat widget opens itself for
// "/?chat=open"), or open the page in a new tab.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safePath(event.notification.data && event.notification.data.url);
  const target = new URL(path, self.location.origin);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const store = windows.find((c) => {
        try {
          const u = new URL(c.url);
          // The admin and the printable invoice have no chat widget to answer the message.
          return u.origin === target.origin && !/^\/(admin|invoice)(\/|$)/.test(u.pathname);
        } catch {
          return false;
        }
      });
      if (store) {
        try {
          await store.focus();
          store.postMessage({ type: "akz:open", url: target.pathname + target.search });
          return;
        } catch {
          // fall through and open a fresh window
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target.href);
    })(),
  );
});
