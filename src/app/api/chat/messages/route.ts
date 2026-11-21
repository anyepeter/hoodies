import type { NextRequest } from "next/server";
import { z } from "zod";
import { addVisitorMessage, myConversation } from "@/lib/chat/server";
import { MESSAGE_MAX } from "@/lib/chat/shared";
import { touchVisitor } from "@/lib/chat/visitor-push";
import { clientIp, fail, ok, rateLimit, readJson, sameOrigin, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** POST /api/chat/messages — the visitor writes in their own conversation (found by the akz_chat cookie). */

const MessageSchema = z.object({
  message: z.string().trim().min(1, "Please write a message.").max(MESSAGE_MAX, `Keep it under ${MESSAGE_MAX} characters.`),
  website: z.string().max(500).optional(), // honeypot
});

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  if (!(await rateLimit(`chat-msg:${clientIp(req)}`, 30, 600))) {
    return fail("You're sending messages very fast. Please wait a few minutes and try again.", 429);
  }
  const parsed = await readJson(req, MessageSchema);
  if ("response" in parsed) return parsed.response;
  if (parsed.data.website) return ok({ message: null });

  try {
    const conv = await myConversation();
    if (!conv) return fail("This chat has ended. Send your message again to start a new one.", 404, { code: "no_conversation" });
    const [message] = await Promise.all([addVisitorMessage(conv, parsed.data.message), touchVisitor(conv.id)]);
    return ok({ message }, 201);
  } catch (err) {
    return serverError("chat:message", err);
  }
}
