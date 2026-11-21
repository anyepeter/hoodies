import type { NextRequest } from "next/server";
import { readUpload, saveChatFile } from "@/app/api/chat/file-store";
import { requireAdminApi } from "@/lib/admin-session";
import { pingConversation } from "@/lib/chat/server";
import { CONVERSATION_ID } from "@/lib/chat/shared";
import { pushToConversation } from "@/lib/chat/visitor-push";
import { prisma } from "@/lib/db";
import { fail, ok, sameOrigin, serverError } from "@/lib/http";
import { notifyAdmins } from "@/lib/notify";

export const dynamic = "force-dynamic";

/*
 * POST /api/admin/chat/<id>/files (multipart: file, caption?, width?, height?) — the admin sends a picture or a
 * PDF into a conversation. Same checks as the shopper's upload (file-store.ts). The shopper's widget is pinged,
 * and their phone notified if they turned that on and aren't on the site.
 */

const notFound = () => fail("That conversation doesn't exist any more.", 404);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  const { id } = await ctx.params;
  if (!CONVERSATION_ID.test(id)) return notFound();
  try {
    if (!(await prisma.conversation.findUnique({ where: { id }, select: { id: true } }))) return notFound();
    const parsed = await readUpload(req);
    if ("response" in parsed) return parsed.response;
    const up = parsed.upload;

    const { message } = await saveChatFile(id, "ADMIN", up);
    pingConversation(id, "ADMIN");
    notifyAdmins("chat.message", null, { id, from: "ADMIN" });
    pushToConversation(id, up.caption || (up.kind === "image" ? "📷 We sent you a photo. Tap to open the chat." : `📄 We sent you ${up.name}. Tap to open the chat.`));
    return ok({ message }, 201);
  } catch (err) {
    return serverError("admin-chat:file", err);
  }
}
