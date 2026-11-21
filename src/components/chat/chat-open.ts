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

/*
 * "Open the chat" requests from elsewhere on the site: `window.dispatchEvent(new CustomEvent("akz:open-chat"))`,
 * fired by the order-confirmed page so the shopper sees their invoice straight away. The listener is attached
 * when this module loads, before any component's effects run, so a request made on a hard page load (when the
 * page's effect can run before the widget's) is kept and handed over as soon as the widget is ready.
 */
export const OPEN_CHAT_EVENT = "akz:open-chat";

let openHandler: (() => void) | null = null;
let missedOpen = false;

if (typeof window !== "undefined") {
  window.addEventListener(OPEN_CHAT_EVENT, () => {
    if (openHandler) openHandler();
    else missedOpen = true;
  });
}

/** The chat widget registers what an open request does. A request that came before it did runs right away. */
export function handleOpenRequests(fn: () => void): () => void {
  openHandler = fn;
  let t: number | undefined;
  if (missedOpen) {
    missedOpen = false;
    t = window.setTimeout(fn, 0);
  }
  return () => {
    window.clearTimeout(t);
    if (openHandler === fn) openHandler = null;
  };
}
