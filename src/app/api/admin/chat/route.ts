import type { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin-session";
import { prisma } from "@/lib/db";
import { ok, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/admin/chat?status=open|closed|all — the inbox, newest activity first, with counts per status. */
export async function GET(req: NextRequest) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const s = req.nextUrl.searchParams.get("status");
  const status = s === "closed" ? "CLOSED" : s === "all" ? undefined : "OPEN";
  try {
    const [rows, groups] = await Promise.all([
      prisma.conversation.findMany({
        where: status ? { status } : {},
        orderBy: { lastMessageAt: "desc" },
        take: 200,
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          unreadForAdmin: true,
          lastMessage: true,
          lastMessageAt: true,
          createdAt: true,
          messages: { orderBy: { createdAt: "desc" }, take: 1, select: { sender: true } },
        },
      }),
      prisma.conversation.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    const count = (st: string) => groups.find((g) => g.status === st)?._count._all ?? 0;
    return ok({
      conversations: rows.map(({ messages, ...c }) => ({
        ...c,
        lastMessageAt: c.lastMessageAt.toISOString(),
        createdAt: c.createdAt.toISOString(),
        lastFrom: messages[0]?.sender ?? null,
      })),
      counts: { open: count("OPEN"), closed: count("CLOSED"), all: count("OPEN") + count("CLOSED") },
    });
  } catch (err) {
    return serverError("admin-chat:list", err);
  }
}
