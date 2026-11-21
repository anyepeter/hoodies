import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentLogo } from "@/components/checkout/PaymentLogos";
import { myConversation } from "@/lib/chat/server";
import { INVOICE_COPY, invoiceNo } from "@/lib/chat/shared";
import { discountPercentOf } from "@/lib/orders/payment-rails";
import { getOrderByToken } from "@/lib/orders/queries";
import { CUSTOMER_STATUS_LABEL, orderNumber } from "@/lib/orders/status";
import { HOODIE, money } from "@/lib/store";
import { CopyText } from "./CopyText";
import { OpenChatButton, OpenChatOnLoad } from "./OpenChat";
import { OrderTimeline } from "./OrderTimeline";

// One customer's private page, found only by its secret token: always rendered fresh, never indexed.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Order confirmed", robots: { index: false, follow: false } };

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-900",
  PAID: "bg-sky-100 text-sky-900",
  SHIPPED: "bg-violet-100 text-violet-900",
  DELIVERED: "bg-emerald-100 text-emerald-900",
  CANCELLED: "bg-black/10 text-ink/70",
  REFUNDED: "bg-rose-100 text-rose-900",
};

/** What the chat box says, from where the order is in the chat (invoice sent → confirmed → details sent). */
function chatCopy(
  o: { invoiceAnswer: string | null; paymentDetailsSentAt: Date | null; paymentMethod: string; invoiceVersion: number },
  total: string,
  invoice: string,
): { title: string; text: string } {
  if (o.paymentDetailsSentAt) {
    return { title: "Your payment details are in the chat", text: `Send ${total} with ${o.paymentMethod} as the message says. We ship as soon as it arrives.` };
  }
  if (o.invoiceAnswer === "confirmed") {
    return { title: "Thanks for confirming your invoice", text: `We'll send your ${o.paymentMethod} payment details in the chat within 5 minutes.` };
  }
  if (o.invoiceAnswer === "wrong") {
    return { title: "Tell us what needs changing", text: "Write to us in the chat and we'll send you an updated invoice." };
  }
  if (o.invoiceVersion > 1) {
    return { title: `Your updated invoice ${invoice} is in the chat.`, text: `Check it and tap “${INVOICE_COPY.yesButton}” — we'll send your payment details right there.` };
  }
  return { title: "Your invoice is in the chat.", text: `Check it and tap “${INVOICE_COPY.yesButton}” — we'll send your payment details right there.` };
}

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = await getOrderByToken(token);
  if (!order) notFound();

  const number = orderNumber(order.number);
  const invoice = invoiceNo(order.number, order.invoiceVersion);
  const total = Number(order.total);
  const subtotal = Number(order.subtotal);
  const discount = Number(order.paymentDiscount);
  // Pack savings against full price, plus the payment method's discount.
  const saved = Number(order.compareAtTotal) - subtotal + discount;
  const firstName = order.name.split(/\s+/)[0] ?? order.name;
  const closed = order.status === "CANCELLED" || order.status === "REFUNDED";
  // The invoice is in the chat of the browser that placed the order. Only that browser can open it.
  const mine = order.conversationId ? await myConversation().catch(() => null) : null;
  const chatHere = Boolean(order.conversationId && mine?.id === order.conversationId);
  const chat = chatCopy(order, money(total), invoice);

  return (
    <section className="mx-auto max-w-[960px] px-4 pb-16 pt-8 md:px-8 md:pt-12">
      <header className="text-center">
        <span className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${closed ? "bg-black/10 text-ink/60" : "bg-brand text-white"}`} aria-hidden>
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.4}>
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="mt-4 text-[13px] font-bold uppercase tracking-[0.2em] text-brand">Order {number}</p>
        <h1 className="mt-1 text-[32px] font-bold leading-tight tracking-tight md:text-[42px]">{closed ? `Order ${number}` : "Order confirmed"}</h1>
        <p className="mt-2 text-[15px] text-ink/65">
          {!closed && <>Thank you, {firstName}. </>}Placed {day(order.createdAt)} ·{" "}
          <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${STATUS_TONE[order.status]}`}>{CUSTOMER_STATUS_LABEL[order.status]}</span>
        </p>
      </header>

      {order.status === "PENDING" && (
        <div className="mx-auto mt-8 max-w-2xl rounded-3xl bg-ink p-5 text-white md:p-8" id="chat" data-testid="order-chat-box">
          {chatHere && <OpenChatOnLoad />}
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-brand">Next step · in the chat</p>
          {order.conversationId ? (
            <>
              <p className="mt-2 text-[24px] font-bold leading-tight tracking-tight md:text-[28px]">{chat.title}</p>
              <p className="mt-2 text-[15px] leading-relaxed text-white/80">{chat.text}</p>
              {chatHere ? (
                <OpenChatButton className="mt-5 w-full sm:w-auto" />
              ) : (
                <p className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-[14px] leading-relaxed text-white/80">
                  Your chat is on the device you ordered from: open this page there to see it. Or write to info@akatsukizipup.com and quote {number}.
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-[15px] leading-relaxed text-white/80">
              We&apos;ll send you the details to pay {money(total)} with {order.paymentMethod}. Questions? Write to info@akatsukizipup.com and quote {number}.
            </p>
          )}
          <p className="mt-5 flex items-center gap-2 text-[13px] text-white/60">
            Paying with <PaymentLogo paymentKey={order.paymentKey} name={order.paymentMethod} /> <span className="font-semibold text-white">{order.paymentMethod}</span>
          </p>
        </div>
      )}

      {order.status !== "PENDING" && (
        <p className="mx-auto mt-6 max-w-xl rounded-2xl bg-soft px-5 py-4 text-center text-[15px]">
          {order.status === "PAID" && <>Payment received{order.paidAt ? ` on ${day(order.paidAt)}` : ""}. We&apos;re getting your order ready to ship.</>}
          {order.status === "SHIPPED" && <>Your order shipped{order.shippedAt ? ` on ${day(order.shippedAt)}` : ""}. It usually arrives within 5–7 days.</>}
          {order.status === "DELIVERED" && <>Delivered{order.deliveredAt ? ` on ${day(order.deliveredAt)}` : ""}. Enjoy the hoodie!</>}
          {order.status === "CANCELLED" && <>This order was cancelled{order.cancelledAt ? ` on ${day(order.cancelledAt)}` : ""}. There&apos;s nothing to pay.</>}
          {order.status === "REFUNDED" && <>This order was refunded. If you have questions, reply to us at info@akatsukizipup.com.</>}
        </p>
      )}

      {!closed && (
        <div className="mt-8 rounded-3xl bg-soft px-3 py-6 md:px-6">
          <OrderTimeline order={order} />
        </div>
      )}

      <div className="mt-8 grid items-start gap-6 md:grid-cols-[1fr_300px]">
        <div className="rounded-3xl border border-black/10 p-4 md:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-[18px] font-bold">Your items</h2>
            <p className="text-[13px] text-ink/55" data-testid="invoice-number">
              Invoice <b className="font-semibold text-ink">{invoice}</b>
            </p>
          </div>
          <ul className="mt-3 divide-y divide-black/5">
            {order.items.map((it) => (
              <li key={it.id} className="flex gap-3 py-3">
                <span className="relative shrink-0">
                  <Image src={it.image} alt="" width={64} height={64} className={`h-16 w-16 rounded-xl bg-soft ${it.kind === "addon" ? "object-contain p-1" : "object-cover"}`} />
                  <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] font-bold text-white tabular-nums">
                    {it.quantity}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-snug">{it.title}</span>
                  {it.detail && <span className="block text-[13px] text-ink/55">{it.detail}</span>}
                  {it.quantity > 1 && (
                    <span className="block text-[12px] text-ink/50">
                      {it.quantity} × {money(Number(it.unitPrice))}
                    </span>
                  )}
                </span>
                <span className="text-right text-[15px]">
                  <b>{money(Number(it.lineTotal))}</b>
                  {it.unitCompareAt && <s className="block text-[12px] text-ink/40">{money(Number(it.unitCompareAt) * it.quantity)}</s>}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-2 space-y-1.5 border-t border-black/5 pt-3 text-[15px]">
            <div className="flex justify-between">
              <dt className="text-ink/65">Subtotal</dt>
              <dd>{money(subtotal)}</dd>
            </div>
            {discount > 0 && (
              <div className="flex justify-between font-semibold text-brand">
                <dt>
                  {order.paymentMethod} discount ({discountPercentOf(discount, subtotal)})
                </dt>
                <dd>−{money(discount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-ink/65">Shipping</dt>
              <dd className="font-semibold">{Number(order.shipping) > 0 ? money(Number(order.shipping)) : "Free"}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-black/5 pt-2">
              <dt className="font-semibold">Total</dt>
              <dd className="text-[24px] font-bold tracking-tight">{money(total)}</dd>
            </div>
            {saved > 0.004 && (
              <div className="flex justify-between text-[14px] font-semibold text-brand">
                <dt>You saved</dt>
                <dd>{money(saved)}</dd>
              </div>
            )}
          </dl>
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-black/10 p-5">
            <h2 className="text-[13px] font-bold uppercase tracking-wider text-ink/50">Ships to</h2>
            <address className="mt-2 text-[15px] not-italic leading-relaxed">
              {order.name}
              <br />
              {order.address1}
              {order.address2 && (
                <>
                  <br />
                  {order.address2}
                </>
              )}
              <br />
              {[order.postalCode, order.city].filter(Boolean).join(" ")}
              {order.region && `, ${order.region}`}
              <br />
              {order.country}
            </address>
            <p className="mt-3 break-words text-[14px] text-ink/65">
              {order.email}
              {order.phone && (
                <>
                  <br />
                  {order.phone}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Link href={`/invoice/${token}`} className="btn-brand h-12 rounded-2xl text-[15px]">
              View invoice
            </Link>
            <Link
              href={`/products/${HOODIE.handle}`}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-black/15 text-[15px] font-semibold transition hover:border-ink"
            >
              Continue shopping
            </Link>
          </div>
          <div className="rounded-2xl bg-soft p-4 text-[13px] leading-relaxed text-ink/70">
            <p>
              <b className="text-ink">Keep this page.</b> Its link is the only way back to your order, so bookmark it or copy it now.
            </p>
            <CopyText value="location" label="Copy link to this page" className="mt-2 bg-white text-ink ring-1 ring-black/10 hover:ring-black/30" />
          </div>
        </aside>
      </div>
    </section>
  );
}
