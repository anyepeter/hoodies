import "server-only";
import { randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { messageSelect, withInvoices } from "@/lib/chat/order-chat";
import { CHAT_IMAGE_MAX_BYTES, CHAT_PDF_MAX_BYTES, MESSAGE_MAX, chatFileKind, previewOf, type ChatMessageDTO } from "@/lib/chat/shared";
import { prisma } from "@/lib/db";
import { fail } from "@/lib/http";

/*
 * Pictures and PDFs in the chat, both directions. The browser has already made pictures small (longest side
 * 1600 px, WebP or JPEG, which also drops EXIF/GPS), so the server only checks and stores: no image processing
 * here (Vercel CPU is scarce). Checks, in order: the declared type is one we take (never SVG or HTML), the size is
 * within its limit, and the first bytes really are that type. The bytes live in ChatFile, so loading a thread
 * never loads them; they're served by the access-checked GET routes with fileResponse().
 * Used by POST /api/chat/files (shopper) and POST /api/admin/chat/<id>/files (admin).
 */

/** The largest file plus room for the rest of the form (caption, sizes, multipart boundaries). */
const BODY_MAX = CHAT_PDF_MAX_BYTES + 64_000;

const EXT: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

/** Whether the first bytes match the declared type: WebP RIFF....WEBP, JPEG FF D8 FF, PNG 89 50 4E 47 0D 0A 1A 0A, PDF %PDF-. */
function bytesMatch(mime: string, b: Uint8Array): boolean {
  const at = (i: number, ...xs: number[]) => b.length >= i + xs.length && xs.every((x, k) => b[i + k] === x);
  switch (mime) {
    case "image/webp":
      return at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50);
    case "image/jpeg":
      return at(0, 0xff, 0xd8, 0xff);
    case "image/png":
      return at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "application/pdf":
      return at(0, 0x25, 0x50, 0x44, 0x46, 0x2d);
    default:
      return false;
  }
}

/**
 * A name that's safe to store, show and put in a header: no folders, no control/bidi/quote characters, at most 80
 * characters, and always the extension of the real type ("../../x.html" sent as a PNG becomes "x.png").
 */
export function safeFileName(raw: string, mime: string): string {
  const ext = EXT[mime] ?? "bin";
  const base = (raw.split(/[\\/]/).pop() ?? "").slice(0, 300);
  const stem = base
    .replace(/\.[^.]*$/, "")
    .normalize("NFC")
    // C0/C1 controls, bidi overrides and isolates, zero-width marks, and characters that break headers or file systems
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff"*:<>?|;`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const room = 80 - ext.length - 1;
  let cut = "";
  for (const ch of stem) {
    if (cut.length + ch.length > room) break;
    cut += ch;
  }
  cut = cut.replace(/^[.\s]+|[.\s]+$/g, "");
  return `${cut || (ext === "pdf" ? "document" : "photo")}.${ext}`;
}

export type Upload = {
  kind: "image" | "file";
  mime: string;
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
  width: number | null;
  height: number | null;
  caption: string;
};

const Dimension = z.coerce.number().int().min(1).max(10_000);
const Caption = z.string().trim().max(MESSAGE_MAX, `Keep the caption under ${MESSAGE_MAX} characters.`);

/** "width"/"height" form fields: absent → null; present → a whole number 1–10000, or the upload is refused. */
function dimension(v: FormDataEntryValue | null): number | null | undefined {
  if (v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const r = Dimension.safeParse(v);
  return r.success ? r.data : undefined;
}

type Refused = { response: NextResponse };

/** Reads and checks a multipart upload: `file`, optional `caption`, optional `width` + `height` (pictures). */
export async function readUpload(req: NextRequest): Promise<{ upload: Upload } | Refused> {
  const tooBig = "That file is too big. Pictures can be up to 1.5 MB and PDFs up to 3 MB.";
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > BODY_MAX) return { response: fail(tooBig, 413) };

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return { response: fail("That upload didn't come through. Try again.", 400) };
  }
  const file = form.get("file");
  if (!(file instanceof File)) return { response: fail("Choose a picture or a PDF to send.", 400) };

  const mime = file.type.toLowerCase();
  const kind = chatFileKind(mime);
  if (!kind) return { response: fail("Only pictures (JPEG, PNG or WebP) and PDFs can be sent.", 415) };
  if (file.size === 0) return { response: fail("That file is empty.", 400) };
  if (kind === "image" && file.size > CHAT_IMAGE_MAX_BYTES) return { response: fail("That picture is over 1.5 MB. Try a screenshot of it instead.", 413) };
  if (kind === "file" && file.size > CHAT_PDF_MAX_BYTES) return { response: fail("That PDF is over 3 MB. Send a smaller one.", 413) };

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytesMatch(mime, bytes)) {
    return { response: fail(kind === "image" ? "That file isn't a picture we can show. Try a JPEG or PNG." : "That file isn't a valid PDF.", 415) };
  }

  const rawCaption = form.get("caption");
  const caption = Caption.safeParse(typeof rawCaption === "string" ? rawCaption : "");
  if (!caption.success) return { response: fail(caption.error.issues[0]?.message ?? "Invalid caption.", 400) };

  let width: number | null = null;
  let height: number | null = null;
  if (kind === "image") {
    const w = dimension(form.get("width"));
    const h = dimension(form.get("height"));
    if (w === undefined || h === undefined) return { response: fail("Invalid picture size.", 400) };
    // Both or neither: one side alone can't keep the picture's shape.
    if (w !== null && h !== null) {
      width = w;
      height = h;
    }
  }

  return { upload: { kind, mime, name: safeFileName(file.name, mime), bytes, width, height, caption: caption.data } };
}

/** "📷 Photo", "📷 <caption>", "📄 invoice.pdf": the inbox preview and the notification text. */
export function filePreview(up: Pick<Upload, "kind" | "name" | "caption">): string {
  if (up.kind === "image") return up.caption ? `📷 ${previewOf(up.caption, 120)}` : "📷 Photo";
  return `📄 ${up.name}`;
}

/** A file id in the same shape as a cuid (25 lowercase letters/digits), made here so one batch saves everything. */
const newFileId = () => `f${randomBytes(12).toString("hex")}`;

/**
 * Saves the file and its message in one transaction and updates the conversation: a shopper's upload is unread
 * for the admin (and reopens a closed chat), an admin's is unread for the shopper. Returns the message as the
 * sender's side sees it.
 */
export async function saveChatFile(conversationId: string, sender: "VISITOR" | "ADMIN", up: Upload): Promise<{ message: ChatMessageDTO; preview: string }> {
  const now = new Date();
  const id = newFileId();
  const preview = filePreview(up);
  const [, row] = await prisma.$transaction([
    prisma.chatFile.create({ data: { id, conversationId, mime: up.mime, size: up.bytes.length, data: up.bytes }, select: { id: true } }),
    prisma.chatMessage.create({
      data: {
        conversationId,
        sender,
        body: up.caption,
        fileId: id,
        fileName: up.name,
        fileMime: up.mime,
        fileSize: up.bytes.length,
        fileWidth: up.width,
        fileHeight: up.height,
        createdAt: now,
      },
      select: messageSelect,
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data:
        sender === "VISITOR"
          ? { unreadForAdmin: { increment: 1 }, lastMessage: previewOf(preview), lastMessageAt: now, status: "OPEN" }
          : { unreadForVisitor: { increment: 1 }, lastMessage: previewOf(preview), lastMessageAt: now },
    }),
  ]);
  const [message] = await withInvoices([row], { admin: sender === "ADMIN" });
  return { message, preview };
}

/** RFC 5987 value for filename*: percent-encoded UTF-8, with the characters encodeURIComponent leaves alone escaped too. */
const rfc5987 = (s: string) => encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * The bytes of a chat file, served so a browser can never run them: exact type, nosniff, a sandboxing CSP, and
 * PDFs as a download. Callers have already checked who's asking.
 */
export function fileResponse(file: { mime: string; data: Uint8Array }, storedName: string | null): Response {
  const kind = chatFileKind(file.mime);
  if (!kind) return fail("That file isn't available.", 404);
  const name = safeFileName(storedName ?? "", file.mime);
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const disposition = `${kind === "image" ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${rfc5987(name)}`;
  return new Response(Buffer.from(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.data.length),
      "Content-Disposition": disposition,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
