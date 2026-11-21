import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { myConversation } from "@/lib/chat/server";
import { CONVERSATION_ID } from "@/lib/chat/shared";
import { fail, sameOrigin, serverError } from "@/lib/http";
import { ADMIN_CHANNEL, pusher } from "@/lib/pusher-server";

export const dynamic = "force-dynamic";

/*
 * Signs a browser's Pusher subscription to a private channel (pusher-js posts socket_id + channel_name,
 * form-encoded). Channel names are guessable, so this is what keeps them private:
 *   private-admin           → only with a valid admin session
 *   private-chat-<id>       → only for the visitor whose akz_chat cookie belongs to conversation <id>
 *   anything else           → 403
 * The permission checks run before the "is Pusher set up" check, so they hold (and can be tested) either way.
 */

const SOCKET_ID = /^\d{1,20}\.\d{1,20}$/;
const CHAT = /^private-chat-(.+)$/;

const denied = () => fail("Not allowed.", 403);

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return denied();
  try {
    const raw = await req.text();
    if (raw.length > 2_000) return fail("That request is too large.", 413);
    const form = new URLSearchParams(raw);
    const socketId = form.get("socket_id") ?? "";
    const channel = form.get("channel_name") ?? "";
    if (!SOCKET_ID.test(socketId)) return denied();

    let allowed = false;
    if (channel === ADMIN_CHANNEL) {
      allowed = await isAdmin();
    } else {
      const wanted = CHAT.exec(channel)?.[1];
      if (wanted && CONVERSATION_ID.test(wanted)) allowed = (await myConversation())?.id === wanted;
    }
    if (!allowed) return denied();

    const p = pusher();
    if (!p) return fail("Live updates aren't set up.", 503);
    return NextResponse.json(p.authorizeChannel(socketId, channel));
  } catch (err) {
    return serverError("pusher-auth", err);
  }
}
