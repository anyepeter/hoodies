import type { Metadata } from "next";
import Link from "next/link";
import { Delta } from "@/components/admin/dashboard/Delta";
import { RefreshOn } from "@/components/admin/dashboard/RefreshOn";
import { Card, Kpi, PageHeader, StatusPill, orderNo, shortDate, usd } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/admin-session";
import { loadDashboard } from "@/lib/analytics/dashboard";
import { ago, preview } from "@/lib/analytics/format";
import { delta } from "@/lib/analytics/period";
import { LOW_STOCK } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export default async function AdminHome() {
  await requireAdminPage();
  const d = await loadDashboard();
  const conversion = d.visitors30 > 0 ? (d.orders30 / d.visitors30) * 100 : null;
  const needsReply = d.unreadChats + d.unreadMessages;

  const today = [
    { label: "Orders", value: d.ordersToday.toLocaleString("en-US"), href: "/admin/orders" },
    { label: "Paid revenue", value: usd(d.revenueToday), href: "/admin/orders" },
    { label: "Visitors", value: d.visitorsToday.toLocaleString("en-US"), href: "/admin/analytics?p=today" },
    { label: "Page views", value: d.viewsToday.toLocaleString("en-US"), href: "/admin/analytics?p=today" },
    { label: "New subscribers", value: d.subscribersToday.toLocaleString("en-US"), href: "/admin/subscribers" },
    { label: "Messages", value: d.messagesToday.toLocaleString("en-US"), href: "/admin/messages?status=all" },
  ];

  return (
    <>
      <RefreshOn events={["admin:order.created", "admin:chat.message", "admin:contact.created"]} />
      <PageHeader title="Dashboard" subtitle="Your store at a glance. Days are in UTC." />

      {/* Today strip */}
      <section aria-labelledby="today-heading" className="mb-6 overflow-hidden rounded-xl bg-ink text-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <h2 id="today-heading" className="text-sm font-semibold">
            Today
          </h2>
          <Link prefetch={false} href="/admin/analytics?p=today" className="flex items-center gap-2 text-xs text-white/70 hover:text-white">
            <span className={`h-2 w-2 rounded-full ${d.liveNow > 0 ? "bg-emerald-400" : "bg-white/30"}`} aria-hidden />
            {d.liveNow > 0 ? `${plural(d.liveNow, "visitor")} on the store now` : "Nobody on the store right now"}
          </Link>
        </div>
        <ul className="grid grid-cols-2 divide-white/10 sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
          {today.map((t) => (
            <li key={t.label}>
              <Link prefetch={false} href={t.href} className="block h-full px-5 py-3.5 transition hover:bg-white/5">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-white/55">{t.label}</span>
                <span className="mt-1 block text-xl font-bold tabular-nums tracking-tight">{t.value}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Revenue, 30 days"
          value={usd(d.revenue30)}
          href="/admin/orders"
          hint={d.revenue30 === 0 && d.revenuePrev30 === 0 ? "paid, shipped and delivered orders" : <Delta value={delta(d.revenue30, d.revenuePrev30)} label="vs previous 30 days" empty="first paid orders this month" />}
        />
        <Kpi label="Orders today" value={d.ordersToday.toLocaleString("en-US")} href="/admin/orders" hint={`${plural(d.orders7, "order")} in the last 7 days`} />
        <Kpi
          label="Awaiting payment"
          value={d.pending.toLocaleString("en-US")}
          tone={d.pending > 0 ? "alert" : "default"}
          href="/admin/orders"
          hint={d.pending > 0 ? `${usd(d.pendingValue)} to confirm` : "nothing to confirm"}
        />
        <Kpi
          label="Conversion, 30 days"
          value={conversion === null ? "—" : `${conversion < 10 ? conversion.toFixed(1) : Math.round(conversion)}%`}
          hint={conversion === null ? "no visitors yet" : `${plural(d.orders30, "order")} ÷ ${plural(d.visitors30, "visitor")}`}
        />
        <Kpi label="Visitors today" value={d.visitorsToday.toLocaleString("en-US")} href="/admin/analytics" hint={`${plural(d.visitors7, "visitor")} in the last 7 days`} />
        <Kpi
          label="Needs a reply"
          value={needsReply.toLocaleString("en-US")}
          tone={needsReply > 0 ? "alert" : "default"}
          hint={
            <span className="flex flex-wrap gap-x-2">
              <Link prefetch={false} href="/admin/chat" className="underline decoration-zinc-300 underline-offset-2 hover:text-ink">
                {plural(d.unreadChats, "unread chat")}
              </Link>
              <Link prefetch={false} href="/admin/messages" className="underline decoration-zinc-300 underline-offset-2 hover:text-ink">
                {plural(d.unreadMessages, "unread message")}
              </Link>
            </span>
          }
        />
        {d.stock.map((s) => (
          <Kpi
            key={s.style}
            label={`${s.style} stock`}
            value={`${s.stock.toLocaleString("en-US")} left`}
            tone={s.stock <= LOW_STOCK ? "alert" : "default"}
            href="/admin/products"
            hint={s.stock === 0 ? "sold out" : s.stock <= LOW_STOCK ? `low: ${LOW_STOCK} or fewer` : "pieces in stock"}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card
          className="lg:col-span-3"
          title="Recent orders"
          actions={
            <Link prefetch={false} href="/admin/orders" className="text-xs font-semibold text-zinc-500 hover:text-ink">
              All orders →
            </Link>
          }
        >
          {d.recentOrders.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-semibold text-ink">No orders yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">When a shopper checks out, the order shows up here, waiting for you to confirm the payment.</p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {d.recentOrders.map((o) => (
                <li key={o.id}>
                  <Link prefetch={false} href={`/admin/orders/${o.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-zinc-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        <span className="tabular-nums">{orderNo(o.number)}</span> · {o.name}
                      </p>
                      <p className="text-xs text-zinc-500" title={shortDate(o.createdAt)}>
                        {ago(o.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-bold tabular-nums text-ink">{usd(o.total)}</span>
                      <StatusPill status={o.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          className="lg:col-span-2"
          title="Recent messages"
          actions={
            <Link prefetch={false} href="/admin/messages?status=all" className="text-xs font-semibold text-zinc-500 hover:text-ink">
              Inbox →
            </Link>
          }
        >
          {d.recentMessages.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-semibold text-ink">No messages yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">Questions from the contact page land here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {d.recentMessages.map((m) => (
                <li key={m.id}>
                  <Link href={`/admin/messages/${m.id}`} prefetch={false} className="flex items-start gap-3 px-5 py-3 transition hover:bg-zinc-50">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.status === "UNREAD" ? "bg-brand" : "bg-zinc-200"}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`truncate text-sm ${m.status === "UNREAD" ? "font-bold text-ink" : "font-medium text-zinc-700"}`}>{m.name ?? m.email}</p>
                        <span className="shrink-0 text-xs text-zinc-500">{ago(m.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">{preview(m.body, 90)}</p>
                    </div>
                    {m.status === "UNREAD" && <span className="sr-only">Unread</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
