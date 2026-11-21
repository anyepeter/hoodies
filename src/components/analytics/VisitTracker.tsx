"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/*
 * Records page views and time on page for Admin → Analytics. Per page view: one POST to /api/track/view, and
 * when the page is hidden or left, one sendBeacon to /api/track/duration with the time the page was actually
 * *visible* (a background tab banks nothing). The server re-checks and clamps everything.
 *
 * Skipped for the admin's own browsing and for automation that admits to it (navigator.webdriver).
 */

const MAX_MS = 30 * 60 * 1000; // mirrors MAX_PAGE_VIEW_MS in src/lib/visitor.ts (the server clamps again)

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export function VisitTracker() {
  const pathname = usePathname();
  // The first view of a page load carries document.referrer; later client-side navigations are internal.
  const firstView = useRef(true);
  // React's dev double-mount re-runs the effect for the same path: reuse that view instead of counting twice.
  const current = useRef<{ path: string; viewId: string } | null>(null);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    if (typeof navigator === "undefined" || navigator.webdriver) return;

    let viewId: string;
    if (current.current?.path === pathname) {
      viewId = current.current.viewId;
    } else {
      viewId = randomId();
      current.current = { path: pathname, viewId };
      const referrer = firstView.current ? document.referrer : "";
      firstView.current = false;
      fetch("/api/track/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathname, referrer, viewId }),
        keepalive: true,
      }).catch(() => {
        /* analytics never bothers the shopper */
      });
    }

    let visibleMs = 0;
    let since: number | null = document.visibilityState === "visible" ? performance.now() : null;
    let sent = 0;

    const bank = () => {
      if (since === null) return;
      const now = performance.now();
      visibleMs += now - since;
      since = now;
    };
    const send = () => {
      bank();
      const ms = Math.min(Math.round(visibleMs), MAX_MS);
      if (ms < 200 || ms <= sent) return; // nothing new (or a blink): skip the request
      sent = ms;
      const body = JSON.stringify({ viewId, ms });
      if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/track/duration", new Blob([body], { type: "application/json" }))) return;
      fetch("/api/track/duration", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        send();
        since = null; // hidden time is not reading time
      } else if (since === null) {
        since = performance.now();
      }
    };
    const onPageHide = () => {
      send();
      since = null;
    };
    const onPageShow = () => {
      if (document.visibilityState === "visible" && since === null) since = performance.now();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      send(); // client-side navigation: this view ends here
    };
  }, [pathname]);

  return null;
}
