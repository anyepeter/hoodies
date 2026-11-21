import type { OrderStatus } from "@prisma/client";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, StatusPill, btn, shortDate, usd } from "@/components/admin/ui";
import { isAdmin, requireAdminPage } from "@/lib/admin-session";
import { prisma } from "@/lib/db";
import { describeUnits, parseStockTaken } from "@/lib/orders/pricing";
import { STATUS_LABEL, orderNumber } from "@/lib/orders/status";
import { AutoRefresh } from "../AutoRefresh";
import { CopyButton } from "./CopyButton";
import { NoteForm } from "./NoteForm";
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
};

function eventTitle(e: { type: string; toStatus: OrderStatus | null }): string {
  if (e.type === "created") return "Order placed";
  if (e.type === "payment") return "Payment confirmed";
  if (e.type === "stock") return "Stock";
  if (e.type === "note") return "Note";
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
  const addressLines = [
    order.name,
    order.address1,
    order.address2,
    [order.postalCode, order.city].filter(Boolean).join(" ") + (order.region ? `, ${order.region}` : ""),
    order.country,
  ].filter(Boolean) as string[];
  const previous = await prisma.order.count({ where: { email: order.email, id: { not: order.id } } });

  return (
    <>
      <AutoRefresh events={["order.updated", "order.created"]} orderId={order.id} />
      <PageHeader
        back={{ href: "/admin/orders", label: "All orders" }}
        title={`Order ${number}`}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusPill status={order.status} /> Placed {shortDate(order.createdAt)}
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

          <Card title={`Items · ${usd(order.total)}`}>
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
          </Card>

          <Card title={`Payment · ${order.paymentMethod}`}>
            <div className="space-y-3 p-5 text-sm">
              {order.paidAt ? (
                <p className="font-medium text-emerald-700">
                  Paid {shortDate(order.paidAt)}
                  {order.paymentReference && <span className="font-normal text-zinc-600"> · reference {order.paymentReference}</span>}
                </p>
              ) : order.status === "PENDING" ? (
                <p className="font-medium text-amber-800">
                  Waiting for {usd(order.total)} with reference {number}.
                </p>
              ) : null}
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">What the customer was told</p>
                <p className="whitespace-pre-line rounded-lg bg-zinc-50 p-3 text-zinc-700">{order.paymentInstructions}</p>
              </div>
            </div>
          </Card>

          <Card title="Timeline">
            <ol className="space-y-4 p-5">
              {order.events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${EVENT_DOT[e.type] ?? "bg-zinc-400"}`} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{eventTitle(e)}</p>
                    {e.message && <p className={`whitespace-pre-line text-sm ${e.type === "note" ? "text-ink" : "text-zinc-600"}`}>{e.message}</p>}
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
