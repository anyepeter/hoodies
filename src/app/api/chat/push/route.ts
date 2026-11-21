import type { NextRequest } from "next/server";
import { z } from "zod";
import { myConversation } from "@/lib/chat/server";
import { CONVERSATION_ID } from "@/lib/chat/shared";
import { prisma } from "@/lib/db";
import { clientIp, fail, ok, rateLimit, readJson, sameOrigin, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

/*
 * A shopper's notifications for their own chat (the "Don't miss your payment details" card).
 *   POST   { endpoint, keys: { p256dh, auth }, conversationId? } → save this browser's push subscription and
 *          attach it to the caller's conversation (found by the akz_chat cookie). The same browser always has
 *          the same endpoint, so it moves to whichever chat turned it on last.
 *   DELETE { endpoint } → stop notifications for this browser (only if it belongs to the caller's chat).
 * Pushes themselves are sent by src/lib/chat/visitor-push.ts when the store writes.
 */

// Push services hand out https URLs; refusing anything else keeps the server from posting to odd places.
const Endpoint = z
  .string()
  .trim()
  .max(2000, "That push endpoint is too long.")
  .url("That push endpoint isn't a URL.")
  .refine((u) => u.startsWith("https://"), "Push endpoints must be https.");
// base64url (RFC 4648 §5), padding optional. A P-256 key is 87 characters, the auth secret 22.
const Key = z
  .string()
  .trim()
  .min(16, "Invalid key.")
  .max(200, "Invalid key.")
  .regex(/^[A-Za-z0-9_-]+={0,2}$/, "Invalid key.");

const SubscribeSchema = z.object({
  endpoint: Endpoint,
  keys: z.object({ p256dh: Key, auth: Key }),
  /** The chat the widget thinks it's in. Must be the cookie's own (a mismatch is refused, never followed). */
  conversationId: z.string().regex(CONVERSATION_ID, "That isn't your chat.").optional(),
});
const UnsubscribeSchema = z.object({ endpoint: Endpoint });

const NO_CHAT = "We couldn't find your chat. Reload the page and try again.";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  if (!(await rateLimit(`chat-push:${clientIp(req)}`, 10, 3600))) {
    return fail("That's a lot of tries. Please wait a little and try again.", 429);
  }
  const parsed = await readJson(req, SubscribeSchema, 4_000);
  if ("response" in parsed) return parsed.response;
  const { endpoint, keys, conversationId } = parsed.data;
  try {
    const conv = await myConversation();
    if (!conv) return fail(NO_CHAT, 403);
    if (conversationId && conversationId !== conv.id) return fail("That isn't your chat.", 403);
    const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;
    await prisma.chatPushSubscription.upsert({
      where: { endpoint },
      update: { conversationId: conv.id, p256dh: keys.p256dh, auth: keys.auth, userAgent, failures: 0 },
      create: { conversationId: conv.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    });
    return ok({}, 201);
  } catch (err) {
    return serverError("chat-push:subscribe", err);
  }
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  if (!(await rateLimit(`chat-push:${clientIp(req)}`, 10, 3600))) {
    return fail("That's a lot of tries. Please wait a little and try again.", 429);
  }
  const parsed = await readJson(req, UnsubscribeSchema, 4_000);
  if ("response" in parsed) return parsed.response;
  try {
    const conv = await myConversation();
    if (!conv) return fail(NO_CHAT, 403);
    await prisma.chatPushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint, conversationId: conv.id } });
    return ok();
  } catch (err) {
    return serverError("chat-push:unsubscribe", err);
  }
}
