import type { NextRequest } from "next/server";
import { myConversation } from "@/lib/chat/server";
import { CONVERSATION_ID } from "@/lib/chat/shared";
import { prisma } from "@/lib/db";
import { fail, serverError } from "@/lib/http";
import { fileResponse } from "../../file-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/files/<id> — a picture or PDF from the caller's own conversation (akz_chat cookie). Anything
 * else (no cookie, another chat's file, a made-up id) is the same plain 404, so ids can't be probed.
 */

const notFound = () => fail("That file isn't available.", 404);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!CONVERSATION_ID.test(id)) return notFound();
  try {
    const conv = await myConversation();
    if (!conv) return notFound();
    const [file, message] = await Promise.all([
      prisma.chatFile.findFirst({ where: { id, conversationId: conv.id }, select: { mime: true, data: true } }),
      prisma.chatMessage.findFirst({ where: { fileId: id, conversationId: conv.id }, select: { fileName: true } }),
    ]);
    if (!file) return notFound();
    return fileResponse(file, message?.fileName ?? null);
  } catch (err) {
    return serverError("chat:file-get", err);
  }
}
