import "server-only";
import { prisma } from "@/lib/db";
import { messageSelect, withInvoices } from "@/lib/chat/order-chat";
import { visitorConversationDTO, type MyConversation } from "@/lib/chat/server";
import type { ChatMessageDTO, VisitorConversationDTO } from "@/lib/chat/shared";

/**
 * The visitor's thread, as GET /api/chat returns it: the newest 200 messages, oldest first, with invoice and
 * payment cards attached (the visitor's own orders only: the conversation is theirs). Marks the replies read.
 */
export async function visitorThread(conv: MyConversation): Promise<{ conversation: VisitorConversationDTO; messages: ChatMessageDTO[] }> {
  const latest = await prisma.chatMessage.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: messageSelect,
  });
  const [messages] = await Promise.all([
    withInvoices(latest.reverse(), { admin: false }),
    conv.unreadForVisitor > 0 ? prisma.conversation.update({ where: { id: conv.id }, data: { unreadForVisitor: 0 } }) : null,
  ]);
  return { conversation: visitorConversationDTO({ ...conv, unreadForVisitor: 0 }), messages };
}
