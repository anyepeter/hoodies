import "server-only";
import type { Prisma } from "@prisma/client";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { notifyAdmins } from "@/lib/notify";
import { orderNumber } from "@/lib/orders/status";
import { chatChannel, ping } from "@/lib/pusher-server";
import { money } from "@/lib/store";
import { myConversation, newChatToken } from "./server";
import { CHAT_EVENT, INVOICE_COPY, previewOf, type ChatMessageDTO, type InvoiceAnswer, type InvoiceDTO, type MessageKind } from "./shared";

/*
 * Orders live in the chat (the owner's Bourbon / Muh-med flow):
 *   1. Checkout places the order, then postInvoice() puts the invoice in the shopper's own chat (created for them
 *      if they never chatted) with "Are your items, address and contact details all correct?" and two buttons.
 *   2. The shopper taps one → answerInvoice(): their answer + an automatic reply go into the thread, the admin
 *      gets a push.
 *   3. The admin sends the payment details for that order from the order page → sendPaymentDetails().
 * Every function here only reads/writes; callers check who's asking (cookie owner / admin).
 */

type Tx = Prisma.TransactionClient;

/**
 * The shopper's conversation for a new order: the one their chat cookie points at, or a new one. When a new one
 * is made, `token` is returned and the caller must set it as the `akz_chat` cookie on the response.
 */
export async function ensureOrderConversation(
  tx: Tx,
  who: { name: string; email: string; visitorId: string | null; userAgent: string | null },
): Promise<{ id: string; token: string | null }> {
  const mine = await myConversation();
  if (mine) {
    // Fill in who they are if the chat didn't know yet.
    await tx.conversation.update({ where: { id: mine.id }, data: { name: mine.name ?? who.name, email: mine.email ?? who.email.toLowerCase(), status: "OPEN" } });
    return { id: mine.id, token: null };
  }
  const { token, hash } = newChatToken();
  const conv = await tx.conversation.create({
    data: { visitorToken: hash, name: who.name, email: who.email.toLowerCase(), visitorId: who.visitorId, pagePath: "/checkout", userAgent: who.userAgent?.slice(0, 500) ?? null },
    select: { id: true },
  });
  return { id: conv.id, token };
}

/** Posts the invoice card for `order` into `conversationId`. Use inside the order transaction. */
export async function postInvoice(tx: Tx, order: { id: string; number: number; total: string }, conversationId: string): Promise<void> {
  const now = new Date();
  const body = `Invoice ${orderNumber(order.number)} · ${order.total}\n${INVOICE_COPY.question}`;
  await tx.chatMessage.create({ data: { conversationId, sender: "ADMIN", kind: "INVOICE", orderId: order.id, body, createdAt: now } });
  await tx.conversation.update({
    where: { id: conversationId },
    // Counts as something for the admin to look at (a new order waiting in the chat).
    data: { lastMessage: previewOf(`New order ${orderNumber(order.number)} · ${order.total}`), lastMessageAt: now, unreadForAdmin: { increment: 1 }, status: "OPEN" },
  });
  await tx.order.update({ where: { id: order.id }, data: { conversationId } });
}

/** After the order transaction: wake the shopper's widget and every admin tab. */
export function pingAfterInvoice(conversationId: string): void {
  after(() => Promise.all([ping(chatChannel(conversationId), CHAT_EVENT, { from: "ADMIN" })]));
  notifyAdmins("chat.message", null, { id: conversationId, from: "SYSTEM" });
}

const orderForInvoice = {
  id: true,
  number: true,
  token: true,
  status: true,
  createdAt: true,
  subtotal: true,
  shipping: true,
  total: true,
  paymentMethod: true,
  paymentKey: true,
  paymentDiscount: true,
  invoiceAnswer: true,
  items: { orderBy: { sortOrder: "asc" as const }, select: { title: true, detail: true, quantity: true, lineTotal: true } },
} satisfies Prisma.OrderSelect;

type InvoiceOrder = Prisma.OrderGetPayload<{ select: typeof orderForInvoice }>;

function toInvoiceDTO(o: InvoiceOrder, admin: boolean): InvoiceDTO {
  const discount = Number(o.paymentDiscount);
  return {
    ...(admin ? { orderId: o.id } : {}),
    number: orderNumber(o.number),
    token: o.token,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    lines: o.items.map((i) => ({ title: i.title, detail: i.detail, quantity: i.quantity, total: money(Number(i.lineTotal)) })),
    subtotal: money(Number(o.subtotal)),
    discount: discount > 0 ? `−${money(discount)} (${o.paymentMethod})` : null,
    shipping: Number(o.shipping) > 0 ? money(Number(o.shipping)) : "Free",
    total: money(Number(o.total)),
    paymentMethod: o.paymentMethod,
    paymentKey: o.paymentKey,
    answer: o.invoiceAnswer === "confirmed" || o.invoiceAnswer === "wrong" ? o.invoiceAnswer : null,
  };
}

/**
 * Turns message rows into DTOs, attaching the invoice card to INVOICE / PAYMENT messages.
 * `admin` adds the order id (for links into the admin). Select `kind` and `orderId` when loading messages.
 */
export async function withInvoices(
  rows: { id: string; sender: "VISITOR" | "ADMIN" | "SYSTEM"; body: string; createdAt: Date; kind: string; orderId: string | null }[],
  opts: { admin: boolean },
): Promise<ChatMessageDTO[]> {
  const ids = [...new Set(rows.map((r) => r.orderId).filter((x): x is string => Boolean(x)))];
  const orders = ids.length ? await prisma.order.findMany({ where: { id: { in: ids } }, select: orderForInvoice }) : [];
  const byId = new Map(orders.map((o) => [o.id, toInvoiceDTO(o, opts.admin)]));
  return rows.map((r) => {
    const kind: MessageKind = r.kind === "INVOICE" || r.kind === "PAYMENT" ? r.kind : "TEXT";
    return {
      id: r.id,
      sender: r.sender,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      kind,
      invoice: kind !== "TEXT" && r.orderId ? (byId.get(r.orderId) ?? null) : undefined,
    };
  });
}

export class InvoiceAnswerError extends Error {}

/**
 * The shopper answered "is everything correct?". Only the conversation's owner may call this (the caller passes
 * their conversation from myConversation()). Answering twice is refused; the order remembers the answer.
 */
export async function answerInvoice(conv: { id: string; name: string | null }, messageId: string, answer: InvoiceAnswer): Promise<void> {
  const msg = await prisma.chatMessage.findFirst({ where: { id: messageId, conversationId: conv.id, kind: "INVOICE" }, select: { id: true, orderId: true } });
  if (!msg?.orderId) throw new InvoiceAnswerError("That invoice isn't in your chat.");
  const order = await prisma.order.findUnique({ where: { id: msg.orderId }, select: { id: true, number: true, invoiceAnswer: true } });
  if (!order) throw new InvoiceAnswerError("That order doesn't exist any more.");
  if (order.invoiceAnswer) throw new InvoiceAnswerError("You've already answered for this invoice.");

  const now = new Date();
  const yes = answer === "confirmed";
  await prisma.$transaction(async (tx) => {
    // Conditional, so a double tap can't answer twice.
    const claimed = await tx.order.updateMany({ where: { id: order.id, invoiceAnswer: null }, data: { invoiceAnswer: answer, invoiceAnsweredAt: now } });
    if (claimed.count === 0) throw new InvoiceAnswerError("You've already answered for this invoice.");
    await tx.chatMessage.update({ where: { id: msg.id }, data: { meta: { answer } } });
    await tx.chatMessage.create({ data: { conversationId: conv.id, sender: "VISITOR", body: yes ? INVOICE_COPY.yesMessage : INVOICE_COPY.noMessage, createdAt: now } });
    await tx.chatMessage.create({ data: { conversationId: conv.id, sender: "ADMIN", body: yes ? INVOICE_COPY.yesReply : INVOICE_COPY.noReply, createdAt: new Date(now.getTime() + 1) } });
    await tx.conversation.update({
      where: { id: conv.id },
      data: { unreadForAdmin: { increment: 1 }, lastMessage: previewOf(yes ? INVOICE_COPY.yesMessage : INVOICE_COPY.noMessage), lastMessageAt: now, status: "OPEN" },
    });
  });

  after(() => ping(chatChannel(conv.id), CHAT_EVENT, { from: "VISITOR" }));
  const n = orderNumber(order.number);
  notifyAdmins(
    "chat.message",
    yes
      ? { title: `Invoice confirmed · ${n}`, body: `${conv.name || "The shopper"} is ready for the payment details.`, url: `/admin/orders/${order.id}`, tag: `invoice-${order.id}` }
      : { title: `Invoice needs changes · ${n}`, body: `${conv.name || "The shopper"} says something's wrong. Open the chat.`, url: `/admin/chat?c=${conv.id}`, tag: `invoice-${order.id}` },
    { id: conv.id, from: "VISITOR" },
  );
}

/** The payment-details message for an order, from its method's template: {order}, {total}, {details}. */
export function paymentMessage(template: string, vars: { order: string; total: string; details: string }): string {
  return template.replaceAll("{order}", vars.order).replaceAll("{total}", vars.total).replaceAll("{details}", vars.details).trim();
}

export class PaymentDetailsError extends Error {}

/** The admin sends the payment details for an order into its chat. Admin-only: the caller checks. */
export async function sendPaymentDetails(orderId: string, body: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, conversationId: true } });
  if (!order) throw new PaymentDetailsError("That order doesn't exist any more.");
  if (!order.conversationId) throw new PaymentDetailsError("This order has no chat to send to.");
  const conversationId = order.conversationId;
  const exists = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { id: true } });
  if (!exists) throw new PaymentDetailsError("The shopper's chat was deleted, so there's nowhere to send this.");
  const now = new Date();
  await prisma.$transaction([
    prisma.chatMessage.create({ data: { conversationId, sender: "ADMIN", kind: "PAYMENT", orderId, body, createdAt: now } }),
    prisma.conversation.update({ where: { id: conversationId }, data: { unreadForVisitor: { increment: 1 }, lastMessage: previewOf(body), lastMessageAt: now, status: "OPEN" } }),
    prisma.order.update({ where: { id: orderId }, data: { paymentDetailsSentAt: now } }),
  ]);
  after(() => ping(chatChannel(conversationId), CHAT_EVENT, { from: "ADMIN" }));
  notifyAdmins("chat.message", null, { id: conversationId, from: "ADMIN" });
}
