import "server-only";
import type { Prisma } from "@prisma/client";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { notifyAdmins } from "@/lib/notify";
import { orderNumber } from "@/lib/orders/status";
import { chatChannel, ping } from "@/lib/pusher-server";
import { money } from "@/lib/store";
import { cookies } from "next/headers";
import { fillPaymentTemplate } from "@/lib/orders/payment-rails";
import { CHAT_COOKIE, hashChatToken, newChatToken } from "./server";

const CHAT_TOKEN = /^[A-Za-z0-9_-]{43}$/; // same shape server.ts accepts (32 bytes, base64url)
import { CHAT_EVENT, INVOICE_COPY, chatFileKind, invoiceNo, previewOf, type ChatMessageDTO, type InvoiceAnswer, type InvoiceDTO, type MessageKind } from "./shared";
import { pushToConversation } from "./visitor-push";

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

// Neon can be slow to answer under load; the default 5 s made a "Yes, all correct" fail once in testing.
const TX_OPTS = { maxWait: 10_000, timeout: 15_000 };

/**
 * The shopper's conversation for a new order: the one their chat cookie points at, or a new one. When a new one
 * is made, `token` is returned and the caller must set it as the `akz_chat` cookie on the response.
 */
export async function ensureOrderConversation(
  tx: Tx,
  who: { name: string; email: string; visitorId: string | null; userAgent: string | null },
): Promise<{ id: string; token: string | null }> {
  // Look the cookie's conversation up with the transaction's own connection (the global client would need a
  // second connection while this transaction holds one: with a pool of 1 that waits until it times out).
  const cookieToken = (await cookies()).get(CHAT_COOKIE)?.value;
  const mine =
    cookieToken && CHAT_TOKEN.test(cookieToken)
      ? await tx.conversation.findUnique({ where: { visitorToken: hashChatToken(cookieToken) }, select: { id: true, name: true, email: true } })
      : null;
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
  const body = `Invoice ${invoiceNo(order.number, 1)} · ${order.total}\n${INVOICE_COPY.question}`;
  await tx.chatMessage.create({ data: { conversationId, sender: "ADMIN", kind: "INVOICE", orderId: order.id, body, meta: { version: 1 }, createdAt: now } });
  await tx.conversation.update({
    where: { id: conversationId },
    // Unread for both: the admin has a new order waiting, and a shopper who closed the tab before the chat opened
    // sees a badge on the bubble next time.
    data: { lastMessage: previewOf(`New order ${orderNumber(order.number)} · ${order.total}`), lastMessageAt: now, unreadForAdmin: { increment: 1 }, unreadForVisitor: { increment: 1 }, status: "OPEN" },
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
  invoiceVersion: true,
  items: { orderBy: { sortOrder: "asc" as const }, select: { title: true, detail: true, quantity: true, lineTotal: true } },
} satisfies Prisma.OrderSelect;

type InvoiceOrder = Prisma.OrderGetPayload<{ select: typeof orderForInvoice }>;

/** The card for one invoice message: `version` is the message's (older ones are REPLACED). */
function toInvoiceDTO(o: InvoiceOrder, admin: boolean, version: number, oldAnswer: InvoiceAnswer | null): InvoiceDTO {
  const discount = Number(o.paymentDiscount);
  const latest = version >= o.invoiceVersion;
  const orderAnswer = o.invoiceAnswer === "confirmed" || o.invoiceAnswer === "wrong" ? o.invoiceAnswer : null;
  return {
    ...(admin ? { orderId: o.id } : {}),
    number: orderNumber(o.number),
    invoiceNumber: invoiceNo(o.number, version),
    version,
    latest,
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
    // The latest invoice carries the order's answer; a replaced one keeps whatever was answered on it.
    answer: latest ? orderAnswer : oldAnswer,
  };
}

const metaOf = (meta: unknown): { version: number; answer: InvoiceAnswer | null } => {
  const m = (meta && typeof meta === "object" ? meta : {}) as { version?: unknown; answer?: unknown };
  return {
    version: typeof m.version === "number" && m.version >= 1 ? m.version : 1,
    answer: m.answer === "confirmed" || m.answer === "wrong" ? m.answer : null,
  };
};

/** The columns withInvoices() needs when loading messages. */
export const messageSelect = {
  id: true,
  sender: true,
  body: true,
  createdAt: true,
  kind: true,
  orderId: true,
  meta: true,
  fileId: true,
  fileName: true,
  fileMime: true,
  fileSize: true,
  fileWidth: true,
  fileHeight: true,
} satisfies Prisma.ChatMessageSelect;

type MessageRow = Prisma.ChatMessageGetPayload<{ select: typeof messageSelect }>;

/**
 * Turns message rows (loaded with `messageSelect`) into DTOs: invoice cards on INVOICE / PAYMENT messages (each
 * invoice with its own version, so replaced ones show REPLACED), and the attached file with the right URL for the
 * viewer (`admin` → /api/admin/chat/files/<id>, shopper → /api/chat/files/<id>; both check access).
 */
export async function withInvoices(rows: MessageRow[], opts: { admin: boolean }): Promise<ChatMessageDTO[]> {
  const ids = [...new Set(rows.map((r) => r.orderId).filter((x): x is string => Boolean(x)))];
  const orders = ids.length ? await prisma.order.findMany({ where: { id: { in: ids } }, select: orderForInvoice }) : [];
  const byId = new Map(orders.map((o) => [o.id, o]));
  const fileBase = opts.admin ? "/api/admin/chat/files/" : "/api/chat/files/";
  return rows.map((r) => {
    const kind: MessageKind = r.kind === "INVOICE" || r.kind === "PAYMENT" ? r.kind : "TEXT";
    const order = r.orderId ? byId.get(r.orderId) : undefined;
    let invoice: InvoiceDTO | null | undefined;
    if (kind !== "TEXT") {
      if (!order) invoice = null;
      else if (kind === "INVOICE") {
        const m = metaOf(r.meta);
        invoice = toInvoiceDTO(order, opts.admin, m.version, m.answer);
      } else invoice = toInvoiceDTO(order, opts.admin, order.invoiceVersion, null);
    }
    const fileKind = r.fileId && r.fileMime ? chatFileKind(r.fileMime) : null;
    return {
      id: r.id,
      sender: r.sender,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      kind,
      invoice,
      file:
        r.fileId && fileKind
          ? { id: r.fileId, url: fileBase + r.fileId, name: r.fileName ?? "file", mime: r.fileMime!, size: r.fileSize ?? 0, width: r.fileWidth, height: r.fileHeight, kind: fileKind }
          : null,
    };
  });
}

export class InvoiceAnswerError extends Error {}

/**
 * The shopper answered "is everything correct?". Only the conversation's owner may call this (the caller passes
 * their conversation from myConversation()). Answering twice is refused; the order remembers the answer.
 */
export async function answerInvoice(conv: { id: string; name: string | null }, messageId: string, answer: InvoiceAnswer): Promise<void> {
  const msg = await prisma.chatMessage.findFirst({ where: { id: messageId, conversationId: conv.id, kind: "INVOICE" }, select: { id: true, orderId: true, meta: true } });
  if (!msg?.orderId) throw new InvoiceAnswerError("That invoice isn't in your chat.");
  const order = await prisma.order.findUnique({ where: { id: msg.orderId }, select: { id: true, number: true, invoiceAnswer: true, status: true, invoiceVersion: true } });
  if (!order) throw new InvoiceAnswerError("That order doesn't exist any more.");
  if (order.invoiceAnswer) throw new InvoiceAnswerError("You've already answered for this invoice.");
  // Only an order still waiting for payment can be confirmed or questioned (the widget hides the buttons otherwise).
  if (order.status !== "PENDING") throw new InvoiceAnswerError("This order has moved on already. Write to us below if something's not right.");
  const version = metaOf(msg.meta).version;
  if (version !== order.invoiceVersion) throw new InvoiceAnswerError("This invoice was replaced by an updated one. Please check the newest invoice below.");

  const now = new Date();
  const yes = answer === "confirmed";
  await prisma.$transaction(async (tx) => {
    // Conditional, so a double tap can't answer twice.
    const claimed = await tx.order.updateMany({ where: { id: order.id, invoiceAnswer: null }, data: { invoiceAnswer: answer, invoiceAnsweredAt: now } });
    if (claimed.count === 0) throw new InvoiceAnswerError("You've already answered for this invoice.");
    await tx.chatMessage.update({ where: { id: msg.id }, data: { meta: { version, answer } } });
    await tx.chatMessage.create({ data: { conversationId: conv.id, sender: "VISITOR", body: yes ? INVOICE_COPY.yesMessage : INVOICE_COPY.noMessage, createdAt: now } });
    await tx.chatMessage.create({ data: { conversationId: conv.id, sender: "ADMIN", body: yes ? INVOICE_COPY.yesReply : INVOICE_COPY.noReply, createdAt: new Date(now.getTime() + 1) } });
    await tx.conversation.update({
      where: { id: conv.id },
      data: { unreadForAdmin: { increment: 1 }, lastMessage: previewOf(yes ? INVOICE_COPY.yesMessage : INVOICE_COPY.noMessage), lastMessageAt: now, status: "OPEN" },
    });
  }, TX_OPTS);

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
  return fillPaymentTemplate(template, vars);
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
  pushToConversation(conversationId, "Your payment details are here. Tap to open the chat.");
}

export class UpdatedInvoiceError extends Error {}

/**
 * The admin fixed an order (after "Something's wrong") and sends the shopper an updated invoice: version + 1, the
 * old card shows REPLACED, the new one asks "is everything correct?" again. Admin-only: the caller checks.
 * Only while the order still awaits payment.
 */
export async function postUpdatedInvoice(orderId: string): Promise<{ invoiceNumber: string }> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, number: true, status: true, conversationId: true, total: true, invoiceVersion: true } });
  if (!order) throw new UpdatedInvoiceError("That order doesn't exist any more.");
  if (order.status !== "PENDING") throw new UpdatedInvoiceError("Only an order that's still waiting for payment can get an updated invoice.");
  if (!order.conversationId) throw new UpdatedInvoiceError("This order has no chat to send to.");
  const conversationId = order.conversationId;
  const exists = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { id: true } });
  if (!exists) throw new UpdatedInvoiceError("The shopper's chat was deleted, so there's nowhere to send this.");

  const now = new Date();
  const version = await prisma.$transaction(async (tx) => {
    // Conditional on the version we read, so two clicks can't make two "updated" invoices with the same number.
    const bumped = await tx.order.updateMany({
      where: { id: order.id, invoiceVersion: order.invoiceVersion, status: "PENDING" },
      data: { invoiceVersion: { increment: 1 }, invoiceAnswer: null, invoiceAnsweredAt: null },
    });
    if (bumped.count === 0) throw new UpdatedInvoiceError("The order changed a moment ago. Reload and try again.");
    const v = order.invoiceVersion + 1;
    // Re-read under the lock the bump just took: an edit saved a moment ago may have changed the total.
    const fresh = await tx.order.findUnique({ where: { id: order.id }, select: { total: true } });
    const total = money(Number(fresh?.total ?? order.total));
    await tx.chatMessage.create({
      data: { conversationId, sender: "ADMIN", kind: "INVOICE", orderId: order.id, body: `${INVOICE_COPY.updated}\nInvoice ${invoiceNo(order.number, v)} · ${total}\n${INVOICE_COPY.question}`, meta: { version: v }, createdAt: now },
    });
    await tx.conversation.update({ where: { id: conversationId }, data: { unreadForVisitor: { increment: 1 }, lastMessage: previewOf(`${INVOICE_COPY.updated} ${invoiceNo(order.number, v)}`), lastMessageAt: now, status: "OPEN" } });
    await tx.orderEvent.create({ data: { orderId: order.id, type: "note", message: `Updated invoice sent in the chat: ${invoiceNo(order.number, v)}` } });
    return v;
  }, TX_OPTS);
  after(() => ping(chatChannel(conversationId), CHAT_EVENT, { from: "ADMIN" }));
  notifyAdmins("chat.message", null, { id: conversationId, from: "ADMIN" });
  pushToConversation(conversationId, `${INVOICE_COPY.updated} Please check it and confirm.`);
  return { invoiceNumber: invoiceNo(order.number, version) };
}
