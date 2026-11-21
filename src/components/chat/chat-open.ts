"use client";

import { useSyncExternalStore } from "react";
import { HOODIE } from "@/lib/store";

// Whether the chat panel is open, for the other things floating at the bottom of the screen (the "Shop the
// hoodie" pill and Back to top) so they step aside instead of sitting under or beside the panel.

let open = false;
const subs = new Set<() => void>();

export function setChatOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  subs.forEach((f) => f());
}

export function useChatOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => open,
    () => false,
  );
}

/** The hoodie page has its own sticky "Add to cart" bar (68 px) along the bottom; floating things sit above it. */
export const STICKY_BAR_PATH = `/products/${HOODIE.handle}`;
