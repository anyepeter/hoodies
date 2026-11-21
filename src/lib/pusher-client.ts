import type Pusher from "pusher-js";

/*
 * The browser side of "ping, then pull" (see src/lib/pusher-server.ts). One Pusher connection per tab, loaded on
 * demand so pusher-js stays out of a shopper's first load: only someone who has started a chat, or the admin,
 * ever connects. Without NEXT_PUBLIC_PUSHER_KEY / NEXT_PUBLIC_PUSHER_CLUSTER there's no connection at all and
 * every screen falls back to its slow refresh, so the site works the same, just without instant updates.
 *
 * Private channels are signed by POST /api/pusher/auth (admin session, or the visitor's chat cookie).
 */

// Same names as the server's (pusher-server.ts is server-only, so they're repeated here).
export const ADMIN_CHANNEL = "private-admin";
export const chatChannel = (conversationId: string) => `private-chat-${conversationId}`;

const KEY = process.env.NEXT_PUBLIC_PUSHER_KEY ?? "";
const CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "";

export const pusherConfigured = Boolean(KEY && CLUSTER);

let instance: Promise<Pusher | null> | undefined;

/** The tab's Pusher client, or null when Pusher isn't configured (or pusher-js failed to load). */
export function getPusher(): Promise<Pusher | null> {
  if (typeof window === "undefined" || !pusherConfigured) return Promise.resolve(null);
  instance ??= import("pusher-js")
    .then(({ default: PusherJs }) => new PusherJs(KEY, { cluster: CLUSTER, channelAuthorization: { endpoint: "/api/pusher/auth", transport: "ajax" } }))
    .catch((err) => {
      console.warn("[pusher] could not load", err);
      return null;
    });
  return instance;
}

const holders = new Map<string, number>();

/**
 * Calls `cb` whenever `event` arrives on `channel`. Several listeners can share a channel; it's left when the
 * last one goes. Returns the unsubscribe function (safe to call before Pusher has even loaded).
 */
export function listen(channel: string, event: string, cb: (data: unknown) => void): () => void {
  let stopped = false;
  let undo: (() => void) | null = null;

  void getPusher().then((pusher) => {
    if (stopped || !pusher) return;
    // Always subscribe(), never `pusher.channel(name) ?? pusher.subscribe(name)`: a subscription cancelled while
    // still pending is only reinstated by subscribe(). On a live channel it's a no-op returning the same one.
    const ch = pusher.subscribe(channel);
    holders.set(channel, (holders.get(channel) ?? 0) + 1);
    ch.bind(event, cb);
    undo = () => {
      ch.unbind(event, cb);
      const left = (holders.get(channel) ?? 1) - 1;
      if (left <= 0) {
        holders.delete(channel);
        pusher.unsubscribe(channel);
      } else holders.set(channel, left);
    };
  });

  return () => {
    stopped = true;
    undo?.();
    undo = null;
  };
}
