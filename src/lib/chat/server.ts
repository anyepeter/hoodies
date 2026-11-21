import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { notifyAdmins } from "@/lib/notify";
import { chatChannel, ping } from "@/lib/pusher-server";
import { CHAT_EVENT, previewOf, type ChatMessageDTO, type ChatSender, type ChatStatus, type VisitorConversationDTO } from "./shared";

/*
 * Who owns a conversation: whoever holds its secret. The visitor's browser keeps a random 32-byte token in the
 * httpOnly cookie `akz_chat`; the database keeps only its SHA-256, so a leaked database can't be used to read or
 * write anyone's chat. Everything a visitor can do (read, post, subscribe on Pusher) goes through
 * myConversation(), which finds the conversation by that hash.
 */

export const CHAT_COOKIE = "akz_chat";
/** The analytics visitor cookie (set by the insights module). Read only, to link a chat to a visitor. */
export const VISITOR_COOKIE = "akz_vid";

export const chatCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 180 * 86_400,
};

const TOKEN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url, no padding

export function hashChatToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function newChatToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashChatToken(token) };
}

export type MyConversation = { id: string; status: ChatStatus; name: string | null; email: string | null; unreadForVisitor: number };

/** The conversation the caller's cookie belongs to, or null (no cookie, malformed, or deleted). */
export async function myConversation(): Promise<MyConversation | null> {
  const token = (await cookies()).get(CHAT_COOKIE)?.value;
  if (!token || !TOKEN.test(token)) return null;
  return prisma.conversation.findUnique({
    where: { visitorToken: hashChatToken(token) },
    select: { id: true, status: true, name: true, email: true, unreadForVisitor: true },
  });
}

/** Whether the request carries a chat cookie at all (so a stale one can be cleared). */
export async function hasChatCookie(): Promise<boolean> {
  return Boolean((await cookies()).get(CHAT_COOKIE)?.value);
}

/** The analytics visitor id from the `akz_vid` cookie, if it looks like one. */
export async function visitorIdFromCookie(): Promise<string | null> {
  const v = (await cookies()).get(VISITOR_COOKIE)?.value;
  return v && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

/** Plain text message → DTO. For lists that may hold invoice/payment messages use withInvoices() (order-chat.ts). */
export function messageDTO(m: { id: string; sender: ChatSender; body: string; createdAt: Date; kind?: string }): ChatMessageDTO {
  const kind = m.kind === "INVOICE" || m.kind === "PAYMENT" ? m.kind : "TEXT";
  return { id: m.id, sender: m.sender, body: m.body, createdAt: m.createdAt.toISOString(), kind };
}

export function visitorConversationDTO(c: { id: string; status: ChatStatus; unreadForVisitor: number }): VisitorConversationDTO {
  return { id: c.id, status: c.status, unread: c.unreadForVisitor };
}

/**
 * Tells everyone watching a conversation to refetch it: the visitor's widget (private-chat-<id>), and every
 * admin tab (private-admin "chat.message"). Runs after the response so nobody waits on Pusher.
 */
export function pingConversation(conversationId: string, from: ChatSender): void {
  after(() => ping(chatChannel(conversationId), CHAT_EVENT, { from }));
}

/** Saves a visitor's message, bumps the admin's unread count, and alerts the admin (Pusher + phone). */
export async function addVisitorMessage(conv: { id: string; name: string | null }, body: string): Promise<ChatMessageDTO> {
  const now = new Date();
  const [message] = await prisma.$transaction([
    prisma.chatMessage.create({ data: { conversationId: conv.id, sender: "VISITOR", body, createdAt: now } }),
    // Writing again reopens a conversation the admin had closed: someone is waiting for an answer.
    prisma.conversation.update({
      where: { id: conv.id },
      data: { unreadForAdmin: { increment: 1 }, lastMessage: previewOf(body), lastMessageAt: now, status: "OPEN" },
    }),
  ]);
  after(() => ping(chatChannel(conv.id), CHAT_EVENT, { from: "VISITOR" }));
  notifyAdmins(
    "chat.message",
    {
      title: `New message from ${conv.name || "a visitor"}`,
      body: previewOf(body, 120),
      url: `/admin/chat?c=${conv.id}`,
      tag: `chat-${conv.id}`,
    },
    { id: conv.id, from: "VISITOR" },
  );
  return messageDTO(message);
}
