import { requireAdminApi } from "@/lib/admin-session";
import { prisma } from "@/lib/db";
import { ok, serverError } from "@/lib/http";
import { LOW_STOCK } from "@/lib/store";

export const dynamic = "force-dynamic";



/** The counts on the sidebar: orders waiting for payment, unread chats and messages, styles running low. */
export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const [pendingOrders, unreadChats, unreadMessages, lowStock] = await Promise.all([
      prisma.order.count({ where: { status: "PENDING" } }),
      prisma.conversation.count({ where: { unreadForAdmin: { gt: 0 }, status: "OPEN" } }),
      prisma.contactMessage.count({ where: { status: "UNREAD" } }),
      prisma.styleStock.count({ where: { stock: { lte: LOW_STOCK } } }),
    ]);
    return ok({ pendingOrders, unreadChats, unreadMessages, lowStock });
  } catch (err) {
    return serverError("badges", err);
  }
}
