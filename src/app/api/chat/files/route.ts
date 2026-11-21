import type { NextRequest } from "next/server";
import { myConversation, pingConversation } from "@/lib/chat/server";
import { touchVisitor } from "@/lib/chat/visitor-push";
import { clientIp, fail, ok, rateLimit, sameOrigin, serverError } from "@/lib/http";
import { notifyAdmins } from "@/lib/notify";
import { readUpload, saveChatFile } from "../file-store";

export const dynamic = "force-dynamic";

/*
 * POST /api/chat/files (multipart: file, caption?, width?, height?) — the shopper sends a picture or a PDF in
 * their own conversation (found by the akz_chat cookie). Checks: file-store.ts. The admin's inbox is pinged and
 * their phone gets "New photo from …". The file is served back by GET /api/chat/files/<id>.
 */

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  // 10 per 10 minutes, and at most 40 a day: the bytes live in Postgres, so one visitor mustn't fill it.
  const ip = clientIp(req);
  if (!(await rateLimit(`chat-file:${ip}`, 10, 600)) || !(await rateLimit(`chat-file-day:${ip}`, 40, 86_400))) {
    return fail("You've sent a lot of files. Please wait a few minutes and try again.", 429);
  }
  try {
    const conv = await myConversation();
    if (!conv) return fail("This chat has ended. Send a message to start a new one.", 404, { code: "no_conversation" });
    const parsed = await readUpload(req);
    if ("response" in parsed) return parsed.response;
    const up = parsed.upload;

    const [{ message, preview }] = await Promise.all([saveChatFile(conv.id, "VISITOR", up), touchVisitor(conv.id)]);
    pingConversation(conv.id, "VISITOR");
    notifyAdmins(
      "chat.message",
      {
        title: `New ${up.kind === "image" ? "photo" : "PDF"} from ${conv.name || "a visitor"}`,
        body: preview,
        url: `/admin/chat?c=${conv.id}`,
        tag: `chat-${conv.id}`,
      },
      { id: conv.id, from: "VISITOR" },
    );
    return ok({ message }, 201);
  } catch (err) {
    return serverError("chat:file", err);
  }
}
