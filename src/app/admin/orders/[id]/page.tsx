import type { OrderStatus } from "@prisma/client";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, StatusPill, btn, shortDate, usd } from "@/components/admin/ui";
import { PaymentLogo } from "@/components/checkout/PaymentLogos";
import { isAdmin, requireAdminPage } from "@/lib/admin-session";
import { paymentMessage } from "@/lib/chat/order-chat";
import { invoiceNo } from "@/lib/chat/shared";
import { prisma } from "@/lib/db";
import { COUNTRIES } from "@/lib/orders/countries";
import { clampRate, discountPercentOf } from "@/lib/orders/payment-rails";
import { describeUnits, itemKey, parseStockTaken } from "@/lib/orders/pricing";
import { STATUS_LABEL, orderNumber } from "@/lib/orders/status";
import { getStock } from "@/lib/stock";
import { STOCK, money } from "@/lib/store";
import { AutoRefresh } from "../AutoRefresh";
import { CopyButton } from "./CopyButton";
import { NoteForm } from "./NoteForm";
import { OrderEditor } from "./OrderEditor";
import { PaymentDetailsForm } from "./PaymentDetailsForm";
import { SendUpdatedInvoice } from "./SendUpdatedInvoice";
import { StatusActions } from "./StatusActions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  return prisma.order.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: "asc" } }, events: { orderBy: { createdAt: "asc" } } },
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  // Metadata runs separately from the page: check the session here too before touching the order.
  if (!(await isAdmin())) return { title: "Order" };
  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id }, select: { number: true } }).catch(() => null);
  return { title: order ? `Order ${orderNumber(order.number)}` : "Order" };
}

const EVENT_DOT: Record<string, string> = {
  created: "bg-ink",
  payment: "bg-sky-500",
  status: "bg-violet-500",
  stock: "bg-emerald-500",
  note: "bg-amber-400",
  chat: "bg-brand",
  edited: "bg-sky-700",
  invoice: "bg-brand",
};

/** postUpdatedInvoice() records the updated invoice as a note: shown under its own title. */
const isInvoiceEvent = (e: { type: string; message: string | null }) => e.type === "note" && Boolean(e.message?.startsWith("Updated invoice sent"));

function eventTitle(e: { type: string; toStatus: OrderStatus | null; message: string | null }): string {
  if (e.type === "created") return "Order placed";
  if (e.type === "edited") return "Order edited";
  if (isInvoiceEvent(e)) return "Updated invoice";
  if (e.type === "payment") return "Payment confirmed";
  if (e.type === "stock") return "Stock";
  if (e.type === "note") return "Note";
  if (e.type === "chat") return "Chat";
  return e.toStatus ? `Marked ${STATUS_LABEL[e.toStatus].toLowerCase()}` : "Status changed";
}

export default async function OrderDetail({ params }: Params) {
  await requireAdminPage();
  const { id } = await params;
  const order = await load(id);
  if (!order) notFound();

  const number = orderNumber(order.number);
  const taken = parseStockTaken(order.stockTaken);
  const stockText = describeUnits(taken);
  const saved = Number(order.compareAtTotal) - Number(order.subtotal);
  const discount = Number(order.paymentDiscount);
  const addressLines = [
    order.name,
    order.address1,
    order.address2,
    [order.postalCode, order.city].filter(Boolean).join(" ") + (order.region ? `, ${order.region}` : ""),
    order.country,
  ].filter(Boolean) as string[];
  // Only an order waiting for payment can be edited (and only while it still holds its stock).
  const editable = order.status === "PENDING" && !order.stockRestored;
  const [previous, option, conversation, latestInvoice, editOptions, stock] = await Promise.all([
    prisma.order.count({ where: { email: order.email, id: { not: order.id } } }),
    order.paymentOptionId ? prisma.paymentOption.findUnique({ where: { id: order.paymentOptionId }, select: { instructions: true, details: true } }) : null,
    order.conversationId ? prisma.conversation.findUnique({ where: { id: order.conversationId }, select: { id: true } }) : null,
    prisma.chatMessage.findFirst({ where: { orderId: order.id, kind: "INVOICE" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    // The editor offers the active methods, plus the order's own if it was turned off since (keeping it is allowed).
    editable
      ? prisma.paymentOption.findMany({
          where: { OR: [{ active: true }, ...(order.paymentOptionId ? [{ id: order.paymentOptionId }] : [])] },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, name: true, active: true, discountRate: true },
        })
      : [],
    editable ? getStock() : { ...STOCK },
  ]);
  const invoiceNumber = invoiceNo(order.number, order.invoiceVersion);
  const nextInvoiceNumber = invoiceNo(order.number, order.invoiceVersion + 1);
  // Edited after the newest invoice went out: the shopper hasn't seen these changes yet.
  const lastEdit = order.events.findLast((e) => e.type === "edited");
  const unsentEdits = Boolean(lastEdit && (!latestInvoice || lastEdit.createdAt > latestInvoice.createdAt));
  const wrong = order.invoiceAnswer === "wrong";
  const invoiceBlocked =
    order.status !== "PENDING"
      ? "Only an order that's still waiting for payment can get an updated invoice."
      : !conversation
        ? "This order has no chat, so there's nowhere to send an updated invoice."
        : null;
  // The message as the method reads today (account details may have changed since the order); if the
  // method was deleted, the copy made when the order was placed.
  const detailsMessage = option
    ? paymentMessage(option.instructions, { order: number, total: money(Number(order.total)), details: option.details ?? "" })
    : order.paymentInstructions;

  return (
    <>
      <AutoRefresh events={["order.updated", "order.created", "chat.message"]} orderId={order.id} conversationId={order.conversationId} />
      <PageHeader
        back={{ href: "/admin/orders", label: "All orders" }}
        title={`Order ${number}`}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusPill status={order.status} /> Placed {shortDate(order.createdAt)} · Invoice {invoiceNumber}
          </span>
        }
        actions={
          <>
            <a href={`/invoice/${order.token}`} target="_blank" rel="noopener" className={btn.secondary}>
              Invoice
            </a>
            <a href={`/order/${order.token}`} target="_blank" rel="noopener" className={btn.ghost}>
              Customer&apos;s page ↗
            </a>
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card title="Next step">
            <div className="p-5">
              <StatusActions id={order.id} status={order.status} stockBack={order.stockRestored ? "" : stockText} />
            </div>
          </Card>

          <div id="items" className="scroll-mt-6">
            <OrderEditor
              orderId={order.id}
              title={`Items · ${usd(order.total)}`}
              editable={editable}
              reason={editable ? null : `Only orders waiting for payment can be edited. This one is ${STATUS_LABEL[order.status].toLowerCase()}.`}
              emphasize={wrong}
              customer={{
                name: order.name,
                email: order.email,
                phone: order.phone ?? "",
                country: COUNTRIES.find((c) => c.name === order.country)?.code ?? "",
                address1: order.address1,
                address2: order.address2 ?? "",
                city: order.city,
                region: order.region ?? "",
                postalCode: order.postalCode,
                notes: order.notes ?? "",
                paymentOptionId: order.paymentOptionId ?? "",
              }}
              lines={order.items.map((it) => ({ key: itemKey(it), qty: it.quantity, title: it.title }))}
              options={editOptions.map((o) => ({ id: o.id, name: o.name, discountRate: clampRate(o.discountRate), off: !o.active }))}
              stock={stock}
              taken={taken}
            >
              <ul className="divide-y divide-zinc-100">
                {order.items.map((it) => (
                  <li key={it.id} className="flex gap-3 px-5 py-3">
                    <Image
                      src={it.image}
                      alt=""
                      width={48}
                      height={48}
                      className={`h-12 w-12 shrink-0 rounded-lg bg-zinc-100 ${it.kind === "addon" ? "object-contain p-1" : "object-cover"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{it.title}</p>
                      {it.detail && <p className="text-xs text-zinc-500">{it.detail}</p>}
                      <p className="text-xs text-zinc-500">
                        {it.quantity} × {usd(it.unitPrice)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">{usd(it.lineTotal)}</p>
                  </li>
                ))}
              </ul>
              <dl className="space-y-1 border-t border-zinc-100 px-5 py-4 text-sm">
                <div className="flex justify-between text-zinc-600">
                  <dt>Subtotal</dt>
                  <dd className="tabular-nums">{usd(order.subtotal)}</dd>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-zinc-600">
                    <dt>
                      {order.paymentMethod} discount ({discountPercentOf(discount, Number(order.subtotal))})
                    </dt>
                    <dd className="tabular-nums">−{usd(discount)}</dd>
                  </div>
                )}
                <div className="flex justify-between text-zinc-600">
                  <dt>Shipping</dt>
                  <dd>{Number(order.shipping) > 0 ? usd(order.shipping) : "Free"}</dd>
                </div>
                {saved > 0.004 && (
                  <div className="flex justify-between text-zinc-500">
                    <dt>Customer saved (vs full price {usd(order.compareAtTotal)})</dt>
                    <dd className="tabular-nums">{usd(saved)}</dd>
                  </div>
                )}
                <div className="flex justify-between pt-1 text-base font-bold text-ink">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{usd(order.total)}</dd>
                </div>
              </dl>
              <p className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500">
                Stock taken: {stockText || "none"}
                {order.stockRestored ? " · put back" : ""}. Prices were worked out on the server from the catalogue.
              </p>
            </OrderEditor>
          </div>

          <div id="payment" className="scroll-mt-6">
            <Card
              title="Chat & payment"
              actions={
                conversation && (
                  <Link prefetch={false} href={`/admin/chat?c=${conversation.id}`} className={btn.secondary}>
                    Open chat
                  </Link>
                )
              }
            >
              <div className="space-y-4 p-5 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <PaymentLogo paymentKey={order.paymentKey} name={order.paymentMethod} />
                  <span className="font-semibold text-ink">{order.paymentMethod}</span>
                  {discount > 0 && <span className="text-zinc-500">{discountPercentOf(discount, Number(order.subtotal))} off (−{usd(discount)})</span>}
                  <span className="text-zinc-400">·</span>
                  {order.paidAt ? (
                    <span className="font-medium text-emerald-700">
                      Paid {shortDate(order.paidAt)}
                      {order.paymentReference && <span className="font-normal text-zinc-600"> · reference {order.paymentReference}</span>}
                    </span>
                  ) : order.status === "PENDING" ? (
                    <span className="font-medium text-amber-800">
                      Waiting for {usd(order.total)} with reference {number}
                    </span>
                  ) : (
                    <span className="text-zinc-500">Not paid</span>
                  )}
                </div>

                <div className={`rounded-lg px-3 py-2.5 ${wrong ? "border border-red-200 bg-red-50" : "bg-zinc-50"}`} data-testid="invoice-answer">
                  <p className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <span>Invoice in the chat</span>
                    <span className="font-mono text-[13px] normal-case tracking-normal text-ink" data-testid="invoice-number">
                      {invoiceNumber}
                    </span>
                  </p>
                  {!order.conversationId ? (
                    <p className="mt-0.5 text-zinc-600">This order was placed before invoices went to the chat.</p>
                  ) : order.invoiceAnswer === "confirmed" ? (
                    <p className="mt-0.5 font-semibold text-emerald-700">
                      Confirmed ✓{order.invoiceAnsweredAt && <span className="font-normal text-zinc-600"> · {shortDate(order.invoiceAnsweredAt)}</span>}
                    </p>
                  ) : wrong ? (
                    <div className="mt-1" data-testid="invoice-wrong">
                      <p className="text-base font-bold text-brand">The shopper says something&apos;s wrong with {invoiceNumber}</p>
                      <p className="mt-0.5 text-zinc-700">
                        {order.invoiceAnsweredAt && <>{shortDate(order.invoiceAnsweredAt)}. </>}
                        Read what needs changing in the chat, fix it with{" "}
                        <a href="#items" className="font-semibold text-ink underline decoration-zinc-300 underline-offset-2 hover:decoration-ink">
                          Edit order
                        </a>
                        , then send the updated invoice.
                      </p>
                      {conversation && (
                        <Link prefetch={false} href={`/admin/chat?c=${conversation.id}`} className={`${btn.primary} mt-2.5`}>
                          Read the chat
                        </Link>
                      )}
                    </div>
                  ) : (
                    <p className="mt-0.5 font-medium text-amber-800">Waiting for the shopper to check it and tap “Yes, all correct”.</p>
                  )}
                </div>

                {order.conversationId && (
                  <SendUpdatedInvoice
                    id={order.id}
                    current={invoiceNumber}
                    next={nextInvoiceNumber}
                    enabled={!invoiceBlocked}
                    reason={invoiceBlocked}
                    prompt={unsentEdits && order.status === "PENDING"}
                  />
                )}

                {conversation ? (
                  <PaymentDetailsForm
                    // Starts again from the new message when an edit changes the total or the method.
                    key={detailsMessage}
                    id={order.id}
                    initial={detailsMessage}
                    sentAt={order.paymentDetailsSentAt ? shortDate(order.paymentDetailsSentAt) : null}
                    waiting={order.invoiceAnswer !== "confirmed"}
                  />
                ) : (
                  <div className="space-y-2">
                    <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-2.5 text-zinc-600" data-testid="payment-no-chat">
                      {order.conversationId
                        ? "The shopper's chat was deleted, so the payment details can't be sent there. Email them instead."
                        : "This order has no chat, so the payment details can't be sent there. Email them instead."}
                    </p>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Payment message</p>
                    <p className="whitespace-pre-line rounded-lg bg-zinc-50 p-3 text-zinc-700">{detailsMessage}</p>
                    <button type="button" disabled className={btn.primary}>
                      Send payment details
                    </button>
                  </div>
                )}
              </div>
            </Card>
          </div>

          <Card title="Timeline">
            <ol className="space-y-4 p-5">
              {order.events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${EVENT_DOT[isInvoiceEvent(e) ? "invoice" : e.type] ?? "bg-zinc-400"}`} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{eventTitle(e)}</p>
                    {e.message && <p className={`whitespace-pre-line text-sm ${e.type === "note" && !isInvoiceEvent(e) ? "text-ink" : "text-zinc-600"}`}>{e.message}</p>}
                    <p className="text-xs text-zinc-500">{shortDate(e.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="border-t border-zinc-100 p-5">
              <NoteForm id={order.id} />
            </div>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card title="Customer">
            <div className="space-y-3 p-5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{order.name}</p>
                  <a
                    href={`mailto:${order.email}?subject=${encodeURIComponent(`Your AkatsukiZipUp order ${number}`)}`}
                    className="break-all text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:text-ink"
                  >
                    {order.email}
                  </a>
                </div>
                <CopyButton value={order.email} />
              </div>
              {order.phone && (
                <div className="flex items-center justify-between gap-2">
                  <a href={`tel:${order.phone.replace(/[^\d+]/g, "")}`} className="text-zinc-600 hover:text-ink">
                    {order.phone}
                  </a>
                  <CopyButton value={order.phone} />
                </div>
              )}
              <p className="text-xs text-zinc-500">
                {previous > 0 ? (
                  <Link prefetch={false} href={`/admin/orders?q=${encodeURIComponent(order.email)}`} className="font-medium text-ink hover:text-brand">
                    {previous} other {previous === 1 ? "order" : "orders"} from this email →
                  </Link>
                ) : (
                  "First order from this email."
                )}
              </p>
            </div>
          </Card>

          <Card title="Ship to" actions={<CopyButton value={addressLines.join("\n")} label="Copy address" />}>
            <address className="p-5 text-sm not-italic leading-relaxed text-zinc-700">
              {addressLines.map((l, i) => (
                <span key={i} className="block">
                  {l}
                </span>
              ))}
            </address>
          </Card>

          {order.notes && (
            <Card title="Customer's note">
              <p className="whitespace-pre-line p-5 text-sm text-zinc-700">{order.notes}</p>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
