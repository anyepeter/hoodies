import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderByToken } from "@/lib/orders/queries";
import { orderNumber } from "@/lib/orders/status";
import { STORE_NAME, money } from "@/lib/store";
import { PrintButton } from "./PrintButton";

// A printable invoice, outside the store's chrome. Found only by the order's secret token; never indexed.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const STAMP: Record<string, { text: string; tone: string }> = {
  PENDING: { text: "Unpaid", tone: "border-brand text-brand" },
  PAID: { text: "Paid", tone: "border-emerald-700 text-emerald-700" },
  SHIPPED: { text: "Paid", tone: "border-emerald-700 text-emerald-700" },
  DELIVERED: { text: "Paid", tone: "border-emerald-700 text-emerald-700" },
  CANCELLED: { text: "Cancelled", tone: "border-zinc-500 text-zinc-500" },
  REFUNDED: { text: "Refunded", tone: "border-zinc-500 text-zinc-500" },
};

export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = await getOrderByToken(token);
  if (!order) notFound();

  const number = orderNumber(order.number);
  const stamp = STAMP[order.status]!;
  const saved = Number(order.compareAtTotal) - Number(order.subtotal);

  return (
    <div className="min-h-dvh bg-zinc-200 px-3 py-6 text-ink print:bg-white print:p-0 sm:py-10">
      <style>{"@page { size: A4; margin: 14mm; }"}</style>
      <div className="mx-auto mb-4 flex max-w-[794px] flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/order/${token}`} className="text-[14px] font-semibold text-ink/60 transition hover:text-ink">
          ← Back to your order
        </Link>
        <PrintButton />
      </div>

      <article className="mx-auto max-w-[794px] overflow-hidden rounded-2xl bg-white p-6 shadow-xl [print-color-adjust:exact] print:max-w-none print:rounded-none print:p-0 print:shadow-none sm:p-12">
        <header className="flex flex-col gap-6 border-b border-black/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Image src="/store/logo.jpg" alt={STORE_NAME} width={1600} height={719} className="h-10 w-auto" priority />
            <p className="mt-3 text-[13px] leading-relaxed text-ink/70">
              <b className="text-ink">{STORE_NAME}</b> · info@akatsukizipup.com
            </p>
          </div>
          <div className="sm:text-right">
            <h1 className="text-[28px] font-extrabold uppercase tracking-[0.15em]">Invoice</h1>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[13px] sm:justify-end">
              <dt className="text-ink/55">Invoice no.</dt>
              <dd className="font-semibold">{number}</dd>
              <dt className="text-ink/55">Date</dt>
              <dd>{date(order.createdAt)}</dd>
              {order.paidAt ? (
                <>
                  <dt className="text-ink/55">Paid</dt>
                  <dd>{date(order.paidAt)}</dd>
                </>
              ) : (
                <>
                  <dt className="text-ink/55">Due</dt>
                  <dd>On receipt</dd>
                </>
              )}
            </dl>
          </div>
        </header>

        <section className="grid gap-6 border-b border-black/10 py-6 sm:grid-cols-2">
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-ink/50">Bill to</h2>
            <p className="mt-2 text-[14px] leading-relaxed">
              <b>{order.name}</b>
              <br />
              <span className="break-all">{order.email}</span>
              {order.phone && (
                <>
                  <br />
                  {order.phone}
                </>
              )}
            </p>
          </div>
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-ink/50">Ship to</h2>
            <address className="mt-2 text-[14px] not-italic leading-relaxed">
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
          </div>
        </section>

        <table className="mt-6 w-full text-left text-[13px] sm:text-[14px]">
          <thead>
            <tr className="border-b border-black/10 text-[11px] uppercase tracking-[0.12em] text-ink/50">
              <th className="pb-2 font-bold">Item</th>
              <th className="pb-2 pl-3 text-right font-bold">Qty</th>
              <th className="hidden pb-2 pl-3 text-right font-bold sm:table-cell print:table-cell">Unit price</th>
              <th className="pb-2 pl-4 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {order.items.map((it) => (
              <tr key={it.id} className="align-top">
                <td className="py-3 pr-3">
                  <span className="font-semibold">{it.title}</span>
                  {it.detail && <span className="block text-[12px] text-ink/55">{it.detail}</span>}
                </td>
                <td className="py-3 text-right tabular-nums">{it.quantity}</td>
                <td className="hidden py-3 text-right tabular-nums sm:table-cell print:table-cell">{money(Number(it.unitPrice))}</td>
                <td className="py-3 pl-4 text-right font-semibold tabular-nums">{money(Number(it.lineTotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex flex-col-reverse gap-6 border-t border-black/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p
            className={`w-fit rotate-[-8deg] rounded-lg border-[3px] px-4 py-1 text-[24px] font-extrabold uppercase tracking-[0.2em] opacity-85 sm:ml-6 sm:text-[30px] ${stamp.tone}`}
          >
            {stamp.text}
          </p>
          <div className="w-full sm:max-w-[300px]">
            <dl className="space-y-1.5 text-[14px]">
              <div className="flex justify-between">
                <dt className="text-ink/60">Subtotal</dt>
                <dd className="tabular-nums">{money(Number(order.subtotal))}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/60">Shipping</dt>
                <dd>{Number(order.shipping) > 0 ? money(Number(order.shipping)) : "Free"}</dd>
              </div>
              {saved > 0.004 && (
                <div className="flex justify-between text-ink/60">
                  <dt>You saved</dt>
                  <dd className="tabular-nums">{money(saved)}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-black/10 pt-2">
                <dt className="font-bold">Total ({order.currency})</dt>
                <dd className="text-[22px] font-extrabold tabular-nums">{money(Number(order.total))}</dd>
              </div>
            </dl>
            <p className="mt-1 text-right text-[11px] text-ink/50">Taxes included.</p>
          </div>
        </div>

        <section className="mt-8 rounded-xl bg-zinc-100 p-4 print:border print:border-black/15 print:bg-white sm:p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-ink/50">Payment · {order.paymentMethod}</h2>
          {order.status === "PENDING" ? (
            <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed">{order.paymentInstructions}</p>
          ) : order.paidAt ? (
            <p className="mt-2 text-[14px]">
              Received {date(order.paidAt)}
              {order.paymentReference && <> · reference {order.paymentReference}</>}.
            </p>
          ) : (
            <p className="mt-2 text-[14px]">No payment is due.</p>
          )}
        </section>

        <footer className="mt-8 border-t border-black/10 pt-4 text-[12px] leading-relaxed text-ink/55">
          <p>Thank you for your order. Questions? Write to info@akatsukizipup.com and quote {number}.</p>
          <p className="mt-1">This store is a design preview: your order is recorded but nothing is charged or shipped.</p>
        </footer>
      </article>
    </div>
  );
}
