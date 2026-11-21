import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  CHAT_COOKIE,
  addVisitorMessage,
  chatCookieOptions,
  hasChatCookie,
  messageDTO,
  myConversation,
  newChatToken,
  visitorConversationDTO,
  visitorIdFromCookie,
} from "@/lib/chat/server";
import { EMAIL_MAX, MESSAGE_MAX, NAME_MAX, previewOf } from "@/lib/chat/shared";
import { clientIp, fail, ok, rateLimit, readJson, sameOrigin, serverError } from "@/lib/http";
import { notifyAdmins } from "@/lib/notify";

export const dynamic = "force-dynamic";

/*
 * The visitor's side of live chat.
 *   GET  /api/chat          → my conversation + its messages (by cookie). Marks the replies read.
 *   GET  /api/chat?peek=1   → my conversation's unread count only (for the bubble badge). Marks nothing.
 *   POST /api/chat          → start a conversation with a first message; sets the akz_chat cookie.
 * Posting further messages: POST /api/chat/messages.
 */

const StartSchema = z.object({
  name: z.string().trim().max(NAME_MAX, `Keep your name under ${NAME_MAX} characters.`).optional(),
  email: z
    .string()
    .trim()
    .max(EMAIL_MAX, "That email address is too long.")
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, "Please enter a valid email address, or leave it empty."),
  message: z.string().trim().min(1, "Please write a message.").max(MESSAGE_MAX, `Keep it under ${MESSAGE_MAX} characters.`),
  pagePath: z.string().max(300).optional(),
  website: z.string().max(500).optional(), // honeypot
});

export async function GET(req: NextRequest) {
  try {
    const conv = await myConversation();
    if (!conv) {
      const res = ok({ conversation: null, messages: [] });
      // A cookie whose conversation was deleted is just noise from now on.
      if (await hasChatCookie()) res.cookies.set(CHAT_COOKIE, "", { ...chatCookieOptions, maxAge: 0 });
      return res;
    }
    if (req.nextUrl.searchParams.get("peek") === "1") return ok({ conversation: visitorConversationDTO(conv), messages: [] });

    const latest = await prisma.chatMessage.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, sender: true, body: true, createdAt: true },
    });
    if (conv.unreadForVisitor > 0) await prisma.conversation.update({ where: { id: conv.id }, data: { unreadForVisitor: 0 } });
    return ok({ conversation: visitorConversationDTO({ ...conv, unreadForVisitor: 0 }), messages: latest.reverse().map(messageDTO) });
  } catch (err) {
    return serverError("chat:get", err);
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  if (!(await rateLimit(`chat-start:${clientIp(req)}`, 5, 3600))) {
    return fail("You've started a few chats already. Please wait a little, or use the contact page.", 429);
  }
  const parsed = await readJson(req, StartSchema);
  if ("response" in parsed) return parsed.response;
  const { name, email, message, pagePath, website } = parsed.data;
  if (website) return ok({ conversation: null, messages: [] }); // a bot filled the hidden field

  try {
    // Already chatting (e.g. a second tab): carry on in the same conversation instead of starting another.
    const existing = await myConversation();
    if (existing) {
      const m = await addVisitorMessage(existing, message);
      return ok({ conversation: visitorConversationDTO(existing), messages: [m] });
    }

    const { token, hash } = newChatToken();
    const visitorId = await visitorIdFromCookie();
    const now = new Date();
    const conv = await prisma.conversation.create({
      data: {
        visitorToken: hash,
        name: name || null,
        email: email ? email.toLowerCase() : null,
        visitorId,
        // A path on this site only ("/x", never "//other.site"): the admin's inbox links to it.
        pagePath: pagePath && /^\/(?![\/\\])[^\s\\]*$/.test(pagePath) ? pagePath : null,
        userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
        unreadForAdmin: 1,
        lastMessage: previewOf(message),
        lastMessageAt: now,
        messages: { create: { sender: "VISITOR", body: message, createdAt: now } },
      },
      select: { id: true, status: true, unreadForVisitor: true, messages: { select: { id: true, sender: true, body: true, createdAt: true } } },
    });

    notifyAdmins(
      "chat.message",
      { title: `New message from ${name || "a visitor"}`, body: previewOf(message, 120), url: `/admin/chat?c=${conv.id}`, tag: `chat-${conv.id}` },
      { id: conv.id, from: "VISITOR" },
    );
    // The analytics visitor learns their email (only if they didn't have one yet). Best effort.
    if (visitorId && email) {
      after(() => prisma.visitor.updateMany({ where: { id: visitorId, email: null }, data: { email: email.toLowerCase() } }).catch(() => {}));
    }

    const res = ok({ conversation: visitorConversationDTO(conv), messages: conv.messages.map(messageDTO) }, 201);
    res.cookies.set(CHAT_COOKIE, token, chatCookieOptions);
    return res;
  } catch (err) {
    return serverError("chat:start", err);
  }
}
