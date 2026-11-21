import type { NextRequest } from "next/server";
import { z } from "zod";
import { InvoiceAnswerError, answerInvoice } from "@/lib/chat/order-chat";
import { myConversation } from "@/lib/chat/server";
import { CONVERSATION_ID } from "@/lib/chat/shared";
import { clientIp, fail, ok, rateLimit, readJson, sameOrigin, serverError } from "@/lib/http";
import { visitorThread } from "../thread";

export const dynamic = "force-dynamic";

/*
 * POST /api/chat/invoice { messageId, answer: "confirmed" | "wrong" }
 * The shopper taps "Yes, all correct" or "Something's wrong" under an invoice in their own chat. Their answer
 * and the automatic reply go into the thread (answerInvoice), and the fresh thread comes back in the same shape
 * as GET /api/chat, so the widget updates at once. Only an invoice in the caller's own conversation (by the
 * akz_chat cookie) can be answered, and only once: anything else is a 409 with a plain sentence.
 */

const AnswerSchema = z.object({
  // Message ids are cuids, the same shape as conversation ids.
  messageId: z.string().regex(CONVERSATION_ID, "That invoice isn't in your chat."),
  answer: z.enum(["confirmed", "wrong"], { message: "Pick one of the two answers." }),
});

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  if (!(await rateLimit(`chat-invoice:${clientIp(req)}`, 20, 600))) {
    return fail("That's a lot of taps. Please wait a few minutes and try again.", 429);
  }
  const parsed = await readJson(req, AnswerSchema);
  if ("response" in parsed) return parsed.response;

  try {
    const conv = await myConversation();
    if (!conv) return fail("We couldn't find your chat. Reload the page and try again.", 403);
    try {
      await answerInvoice(conv, parsed.data.messageId, parsed.data.answer);
    } catch (err) {
      if (err instanceof InvoiceAnswerError) return fail(err.message, 409);
      throw err;
    }
    // Answering reopens a closed conversation (answerInvoice sets it OPEN).
    return ok(await visitorThread({ ...conv, status: "OPEN" }));
  } catch (err) {
    return serverError("chat:invoice", err);
  }
}
