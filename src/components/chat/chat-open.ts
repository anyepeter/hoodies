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
 * fired by the order-confirmed page so the shopper sees their invoice straight away. `detail: { at: "latest" }`
 * lands on the newest message instead (a tapped notification: "/?chat=open"). The listener is attached when this
 * module loads, before any component's effects run, so a request made on a hard page load (when the page's effect
 * can run before the widget's) is kept and handed over as soon as the widget is ready.
 */
export const OPEN_CHAT_EVENT = "akz:open-chat";

export type OpenRequest = { at: "invoice" | "latest" };

let openHandler: ((req: OpenRequest) => void) | null = null;
let missedOpen: OpenRequest | null = null;

const requestOf = (e: Event): OpenRequest => {
  const d = (e as CustomEvent<unknown>).detail;
  return d && typeof d === "object" && (d as { at?: unknown }).at === "latest" ? { at: "latest" } : { at: "invoice" };
};

if (typeof window !== "undefined") {
  window.addEventListener(OPEN_CHAT_EVENT, (e) => {
    const req = requestOf(e);
    if (openHandler) openHandler(req);
    else missedOpen = req;
  });
}

/** The chat widget registers what an open request does. A request that came before it did runs right away. */
export function handleOpenRequests(fn: (req: OpenRequest) => void): () => void {
  openHandler = fn;
  let t: number | undefined;
  if (missedOpen) {
    const req = missedOpen;
    missedOpen = null;
    t = window.setTimeout(() => fn(req), 0);
  }
  return () => {
    window.clearTimeout(t);
    if (openHandler === fn) openHandler = null;
  };
}

/** Only a path on this site ("/x", never "//elsewhere" or "/\elsewhere"). */
export const SAFE_PATH = /^\/(?![\/\\])[^\s\\]*$/;
