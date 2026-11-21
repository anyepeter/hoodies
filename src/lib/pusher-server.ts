import "server-only";
import Pusher from "pusher";

/*
 * Realtime is "ping, then pull" (same as the vape store and muh-med): the server sends a tiny event saying
 * something changed, and the browser fetches the new data from our API. Nothing secret or large ever goes
 * through Pusher, and no browser holds a function open (that's what burned the CPU allowance on muh-med).
 *
 * Channels:
 *   private-admin                — the admin panel: new order, new chat message, new contact message, badges
 *   private-chat-<conversationId> — one visitor's chat window
 * Both are private: /api/pusher/auth only signs them for the admin, or for the visitor holding that
 * conversation's secret cookie.
 */

export const ADMIN_CHANNEL = "private-admin";
export const chatChannel = (conversationId: string) => `private-chat-${conversationId}`;

export type AdminEvent = "order.created" | "order.updated" | "chat.message" | "contact.created" | "badges";

let client: Pusher | null | undefined;

export function pusher(): Pusher | null {
  if (client !== undefined) return client;
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;
  client = PUSHER_APP_ID && PUSHER_KEY && PUSHER_SECRET && PUSHER_CLUSTER
    ? new Pusher({ appId: PUSHER_APP_ID, key: PUSHER_KEY, secret: PUSHER_SECRET, cluster: PUSHER_CLUSTER, useTLS: true })
    : null;
  return client;
}

/** Sends a ping. Never throws: realtime is a nicety, the data is always in the database. */
export async function ping(channel: string, event: string, data: Record<string, unknown> = {}): Promise<void> {
  const p = pusher();
  if (!p) return;
  try {
    await p.trigger(channel, event, data);
  } catch (err) {
    console.error("[pusher] trigger failed", channel, event, err);
  }
}
