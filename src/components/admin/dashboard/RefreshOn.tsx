"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/*
 * Re-renders the current admin page (router.refresh()) when AdminRealtime re-dispatches one of the given
 * Pusher pings as a window event ("admin:order.created"...). Without Pusher it still catches up: when the tab
 * comes back into view after a minute or more, and every 5 minutes while visible. Server CPU is scarce, so it
 * never refreshes a hidden tab and never more often than that.
 */
const STALE_MS = 60_000;
const INTERVAL_MS = 5 * 60_000;

export function RefreshOn({ events }: { events: string[] }) {
  const router = useRouter();
  const key = events.join("|");

  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      last = Date.now();
      router.refresh();
    };
    const names = key.split("|").filter(Boolean);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= STALE_MS) refresh();
    };
    const timer = window.setInterval(() => document.visibilityState === "visible" && refresh(), INTERVAL_MS);
    names.forEach((n) => window.addEventListener(n, refresh));
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      names.forEach((n) => window.removeEventListener(n, refresh));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, router]);

  return null;
}
