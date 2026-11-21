import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader, StatusPill, Tabs, btn, field, shortDate, usd } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/admin-session";
import { prisma } from "@/lib/db";
import { ORDER_STATUSES, STATUS_LABEL, isOrderStatus, orderNumber, parseOrderNumber } from "@/lib/orders/status";
import { BUNDLES } from "@/lib/store";
import { AutoRefresh } from "./AutoRefresh";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Orders" };

const PAGE_SIZE = 50;

type Search = { status?: string; q?: string; page?: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const status = isOrderStatus(sp.status) ? sp.status : null;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 100);
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(sp.page)) || 1));

  // Search what an admin has to hand when a customer writes: the order number, their email or their name.
  const num = parseOrderNumber(q);
  const searchWhere: Prisma.OrderWhereInput = q
    ? {
        OR: [...(num ? [{ number: num }] : []), { email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }],
      }
    : {};
  const where: Prisma.OrderWhereInput = { ...searchWhere, ...(status ? { status } : {}) };

  /** The current filters with one change, so no control drops another's state. */
  const href = (change: Partial<Search>) => {
    const merged: Search = { status: status ?? undefined, q: q || undefined, page: page > 1 ? String(page) : undefined, ...change };
    const params = new URLSearchParams(Object.entries(merged).filter((e): e is [string, string] => Boolean(e[1])));
    const qs = params.toString();
    return qs ? `/admin/orders?${qs}` : "/admin/orders";
  };

  let data;
  try {
    const [orders, filteredCount, groups] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          number: true,
          name: true,
          email: true,
          country: true,
          status: true,
          total: true,
          paymentMethod: true,
          createdAt: true,
          items: { select: { quantity: true, kind: true, sku: true } },
        },
      }),
      prisma.order.count({ where }),
      // Tab counts keep the search but drop the status filter, so each tab shows its own real size.
      prisma.order.groupBy({ by: ["status"], where: searchWhere, _count: { _all: true } }),
    ]);
    data = { orders, filteredCount, groups };
  } catch (err) {
    console.error("[admin/orders] load failed", err);
    data = null;
  }

  if (!data) {
    return (
      <>
        <PageHeader title="Orders" />
        <EmptyState
          title="Orders couldn't be loaded"
          action={
            <Link href={href({})} className={btn.secondary}>
              Try again
            </Link>
          }
        >
          The database didn&apos;t answer. Wait a moment and try again.
        </EmptyState>
      </>
    );
  }

  const { orders, filteredCount, groups } = data;
  const counts = new Map(groups.map((g) => [g.status, g._count._all]));
  const allCount = groups.reduce((n, g) => n + g._count._all, 0);
  const pages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const hoodies = (items: { quantity: number; kind: string; sku: string }[]) =>
    items.reduce((n, i) => n + (i.kind === "bundle" ? i.quantity * (BUNDLES.find((b) => b.id === i.sku)?.qty ?? 1) : 0), 0);

  return (
    <>
      <AutoRefresh events={["order.created", "order.updated"]} />
      <PageHeader
        title="Orders"
        subtitle={
          <>
            {filteredCount} {filteredCount === 1 ? "order" : "orders"}
            {status ? ` · ${STATUS_LABEL[status]}` : ""}
            {q ? ` · matching “${q}”` : ""}
          </>
        }
      />

      <form method="GET" action="/admin/orders" className="mb-4 flex gap-2" role="search">
        {status && <input type="hidden" name="status" value={status} />}
        <label htmlFor="q" className="sr-only">
          Search orders
        </label>
        <input id="q" type="search" name="q" defaultValue={q} placeholder="Order #, email or name" className={`${field} h-10 max-w-md`} />
        <button type="submit" className={btn.primary}>
          Search
        </button>
        {q && (
          <Link href={href({ q: undefined, page: undefined })} className={btn.ghost}>
            Clear
          </Link>
        )}
      </form>

      <Tabs
        active={status ?? "ALL"}
        items={[
          { key: "ALL", label: "All", href: href({ status: undefined, page: undefined }), count: allCount },
          ...ORDER_STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s], href: href({ status: s, page: undefined }), count: counts.get(s) ?? 0 })),
        ]}
      />

      {orders.length === 0 ? (
        <EmptyState title={q ? `Nothing matches “${q}”` : status ? `No ${STATUS_LABEL[status].toLowerCase()} orders` : "No orders yet"}>
          {q || status ? "Try another search or tab." : "Orders placed at checkout show up here the moment they come in."}
        </EmptyState>
      ) : (
        <Card>
          {/* Desktop: a table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  <th className="px-5 py-3">Order</th>
                  <th className="px-3 py-3">Placed</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">Payment</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {orders.map((o) => (
                  <tr key={o.id} className="transition hover:bg-zinc-50">
                    <td className="px-5 py-3 align-top">
                      <Link href={`/admin/orders/${o.id}`} className="font-semibold text-ink hover:text-brand">
                        {orderNumber(o.number)}
                      </Link>
                      <div className="text-xs text-zinc-500">
                        {hoodies(o.items)} {hoodies(o.items) === 1 ? "hoodie" : "hoodies"}
                        {o.items.some((i) => i.kind === "addon") ? " + extras" : ""}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-top text-zinc-600">{shortDate(o.createdAt)}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-medium text-ink">{o.name}</div>
                      <div className="text-xs text-zinc-500">
                        {o.email} · {o.country}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top text-zinc-600">{o.paymentMethod}</td>
                    <td className="px-3 py-3 align-top">
                      <StatusPill status={o.status} />
                    </td>
                    <td className="px-5 py-3 text-right align-top font-semibold tabular-nums">{usd(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: cards */}
          <ul className="divide-y divide-zinc-100 md:hidden">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.id}`} className="block px-4 py-3.5 transition active:bg-zinc-50">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-ink">{orderNumber(o.number)}</span>
                    <span className="font-semibold tabular-nums">{usd(o.total)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-ink">{o.name}</p>
                  <p className="truncate text-xs text-zinc-500">{o.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <StatusPill status={o.status} />
                    <span>{shortDate(o.createdAt)}</span>
                    <span>· {o.paymentMethod}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between gap-3 text-sm text-zinc-500" aria-label="Pages">
          <span>
            Page {page} of {pages} · {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredCount)} of {filteredCount}
          </span>
          <span className="flex gap-2">
            {page > 1 && (
              <Link href={href({ page: page - 1 > 1 ? String(page - 1) : undefined })} className={btn.secondary}>
                ← Newer
              </Link>
            )}
            {page < pages && (
              <Link href={href({ page: String(page + 1) })} className={btn.secondary}>
                Older →
              </Link>
            )}
          </span>
        </nav>
      )}
    </>
  );
}
