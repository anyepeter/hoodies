import type { NextRequest } from "next/server";
import { fileResponse } from "@/app/api/chat/file-store";
import { requireAdminApi } from "@/lib/admin-session";
import { CONVERSATION_ID } from "@/lib/chat/shared";
import { prisma } from "@/lib/db";
import { fail, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/admin/chat/files/<id> — any chat's picture or PDF, for the signed-in admin. */

const notFound = () => fail("That file isn't available.", 404);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!CONVERSATION_ID.test(id)) return notFound();
  try {
    const [file, message] = await Promise.all([
      prisma.chatFile.findUnique({ where: { id }, select: { mime: true, data: true } }),
      prisma.chatMessage.findFirst({ where: { fileId: id }, select: { fileName: true } }),
    ]);
    if (!file) return notFound();
    return fileResponse(file, message?.fileName ?? null);
  } catch (err) {
    return serverError("admin-chat:file-get", err);
  }
}
