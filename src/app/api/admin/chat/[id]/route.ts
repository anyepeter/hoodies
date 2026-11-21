import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-session";
import { deviceLabel } from "@/lib/chat/device";
import { withInvoices } from "@/lib/chat/order-chat";
import { messageDTO, pingConversation } from "@/lib/chat/server";
import { CONVERSATION_ID, MESSAGE_MAX, previewOf } from "@/lib/chat/shared";
import { prisma } from "@/lib/db";
import { fail, ok, readJson, sameOrigin, serverError } from "@/lib/http";
import { notifyAdmins } from "@/lib/notify";

export const dynamic = "force-dynamic";

/*
 * One conversation, for the admin.
 *   GET    → visitor info + messages (invoice / payment cards attached). Opening it marks it read
 *            (unreadForAdmin = 0) and refreshes the badges.
 *   POST   → reply { message }. The visitor's widget is pinged and shows it.
 *   PATCH  → { status: "OPEN" | "CLOSED" }
 *   DELETE → removes the conversation and its messages for good.
 * Every change also pings private-admin "chat.message" (from: "ADMIN", so no toast) so other admin tabs and
 * devices refresh their inbox.
 */

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => fail("That conversation doesn't exist any more.", 404);

async function idFrom(ctx: Ctx): Promise<string | null> {
  const { id } = await ctx.params;
  return CONVERSATION_ID.test(id) ? id : null;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const id = await idFrom(ctx);
  if (!id) return notFound();
  try {
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        visitorId: true,
        pagePath: true,
        userAgent: true,
        unreadForAdmin: true,
        unreadForVisitor: true,
        createdAt: true,
        lastMessageAt: true,
        messages: { orderBy: { createdAt: "desc" }, take: 500, select: { id: true, sender: true, body: true, createdAt: true, kind: true, orderId: true } },
      },
    });
    if (!conv) return notFound();

    const cleared = conv.unreadForAdmin > 0;
    if (cleared) {
      await prisma.conversation.update({ where: { id }, data: { unreadForAdmin: 0 } });
      notifyAdmins("badges", null);
    }
    const { messages, userAgent, ...rest } = conv;
    return ok({
      conversation: {
        ...rest,
        unreadForAdmin: 0,
        device: deviceLabel(userAgent),
        createdAt: conv.createdAt.toISOString(),
        lastMessageAt: conv.lastMessageAt.toISOString(),
      },
      // Invoice / payment cards carry the order id, for the links into the admin's order page.
      messages: await withInvoices(messages.reverse(), { admin: true }),
      cleared,
    });
  } catch (err) {
    return serverError("admin-chat:get", err);
  }
}

const ReplySchema = z.object({
  message: z.string().trim().min(1, "Write a reply first.").max(MESSAGE_MAX, `Keep it under ${MESSAGE_MAX} characters.`),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  const id = await idFrom(ctx);
  if (!id) return notFound();
  const parsed = await readJson(req, ReplySchema);
  if ("response" in parsed) return parsed.response;
  try {
    if (!(await prisma.conversation.findUnique({ where: { id }, select: { id: true } }))) return notFound();
    const now = new Date();
    const [message] = await prisma.$transaction([
      prisma.chatMessage.create({ data: { conversationId: id, sender: "ADMIN", body: parsed.data.message, createdAt: now } }),
      prisma.conversation.update({
        where: { id },
        data: { unreadForVisitor: { increment: 1 }, lastMessage: previewOf(parsed.data.message), lastMessageAt: now },
      }),
    ]);
    pingConversation(id, "ADMIN");
    notifyAdmins("chat.message", null, { id, from: "ADMIN" });
    return ok({ message: messageDTO(message) }, 201);
  } catch (err) {
    return serverError("admin-chat:reply", err);
  }
}

const StatusSchema = z.object({ status: z.enum(["OPEN", "CLOSED"]) });

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  const id = await idFrom(ctx);
  if (!id) return notFound();
  const parsed = await readJson(req, StatusSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const res = await prisma.conversation.updateMany({ where: { id }, data: { status: parsed.data.status } });
    if (res.count === 0) return notFound();
    pingConversation(id, "ADMIN");
    notifyAdmins("chat.message", null, { id, from: "ADMIN" });
    return ok({ status: parsed.data.status });
  } catch (err) {
    return serverError("admin-chat:status", err);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  const id = await idFrom(ctx);
  if (!id) return notFound();
  try {
    const res = await prisma.conversation.deleteMany({ where: { id } });
    if (res.count === 0) return notFound();
    pingConversation(id, "ADMIN"); // the visitor's widget refetches, finds nothing, and starts fresh
    notifyAdmins("chat.message", null, { id, from: "ADMIN" });
    return ok();
  } catch (err) {
    return serverError("admin-chat:delete", err);
  }
}
