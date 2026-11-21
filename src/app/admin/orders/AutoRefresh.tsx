"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// With Pusher, pings arrive instantly and the timer is only a slow safety net; without it (keys empty
// locally) the timer is how the page stays current. Either way it only runs while the tab is visible.
const FALLBACK_MS = process.env.NEXT_PUBLIC_PUSHER_KEY ? 5 * 60_000 : 60_000;

/**
 * Re-renders the current admin page when an order changes: on the `admin:<event>` window events that
 * AdminRealtime dispatches for each Pusher ping, when the tab comes back into view, and on a slow timer.
 * `orderId` limits it to pings about that one order.
 */
export function AutoRefresh({ events, orderId }: { events: string[]; orderId?: string }) {
  const router = useRouter();
  const key = events.join(",");

  useEffect(() => {
    const names = key.split(",");
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const onPing = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string } | undefined>).detail?.id;
      if (orderId && id && id !== orderId) return;
      refresh();
    };
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    names.forEach((n) => window.addEventListener(`admin:${n}`, onPing));
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(refresh, FALLBACK_MS);
    return () => {
      names.forEach((n) => window.removeEventListener(`admin:${n}`, onPing));
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [key, orderId, router]);

  return null;
}
