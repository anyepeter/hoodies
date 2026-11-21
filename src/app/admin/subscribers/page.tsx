import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Card, EmptyState, Kpi, PageHeader, StatusPill, Tabs, btn, field, shortDate } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/admin-session";
import { utcMidnight } from "@/lib/analytics/period";
import { parseSearch, parseSubscriberFilter, subscriberWhere, type SubscriberFilter } from "@/lib/analytics/subscribers";
import { prisma } from "@/lib/db";
import { SubscriberActions } from "./SubscriberActions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Subscribers" };

const PAGE = 200;
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function SubscribersPage({ searchParams }: { searchParams: SP }) {
  await requireAdminPage();
  const sp = await searchParams;
  const filter = parseSubscriberFilter(sp.status);
  const q = parseSearch(sp.q);
  const where = subscriberWhere(filter, q);
  const weekAgo = utcMidnight(new Date(), 6);

  const [rows, matching, groups, newThisWeek] = await Promise.all([
    prisma.subscriber.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE, select: { id: true, email: true, status: true, source: true, createdAt: true } }),
    prisma.subscriber.count({ where }),
    prisma.subscriber.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.subscriber.count({ where: { status: "SUBSCRIBED", createdAt: { gte: weekAgo } } }),
  ]);
  const subscribed = groups.find((g) => g.status === "SUBSCRIBED")?._count._all ?? 0;
  const unsubscribed = groups.find((g) => g.status === "UNSUBSCRIBED")?._count._all ?? 0;
  const total = subscribed + unsubscribed;

  const link = (status: SubscriberFilter, search = q) => {
    const p = new URLSearchParams();
    if (status !== "subscribed") p.set("status", status);
    if (search) p.set("q", search);
    const s = p.toString();
    return s ? `/admin/subscribers?${s}` : "/admin/subscribers";
  };
  const exportHref = `/api/admin/subscribers/export?${new URLSearchParams({ status: filter, ...(q ? { q } : {}) }).toString()}`;

  return (
    <>
      <PageHeader
        title="Subscribers"
        subtitle="People who signed up for emails in the store footer."
        actions={
          total > 0 ? (
            <a href={exportHref} className={btn.secondary} download>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
              </svg>
              Export CSV
            </a>
          ) : undefined
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Subscribed" value={subscribed.toLocaleString("en-US")} tone={subscribed > 0 ? "good" : "default"} />
        <Kpi label="New this week" value={newThisWeek.toLocaleString("en-US")} hint="last 7 days" />
        <Kpi label="Unsubscribed" value={unsubscribed.toLocaleString("en-US")} />
        <Kpi label="All addresses" value={total.toLocaleString("en-US")} />
      </div>

      {total === 0 ? (
        <EmptyState title="No subscribers yet">
          When someone signs up with the form at the bottom of every store page, they appear here. You can export the list as a CSV for your email tool.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <Tabs
              active={filter}
              items={[
                { key: "subscribed", label: "Subscribed", href: link("subscribed"), count: subscribed },
                { key: "unsubscribed", label: "Unsubscribed", href: link("unsubscribed"), count: unsubscribed },
                { key: "all", label: "All", href: link("all"), count: total },
              ]}
            />
            <Form action="/admin/subscribers" className="mb-4 flex w-full gap-2 lg:w-80" role="search">
              {filter !== "subscribed" && <input type="hidden" name="status" value={filter} />}
              <label htmlFor="sub-search" className="sr-only">
                Search by email
              </label>
              <input id="sub-search" name="q" type="search" defaultValue={q} placeholder="Search by email" maxLength={100} className={`${field} h-10`} />
              <button type="submit" className={btn.secondary}>
                Search
              </button>
            </Form>
          </div>

          <Card>
            {rows.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-zinc-500">
                {q ? (
                  <>
                    No {filter === "all" ? "" : `${filter} `}addresses match &ldquo;{q}&rdquo;.{" "}
                    <Link href={link(filter, "")} className="font-semibold text-ink underline">
                      Clear the search
                    </Link>
                  </>
                ) : filter === "unsubscribed" ? (
                  "Nobody has unsubscribed."
                ) : (
                  "No active subscribers right now."
                )}
              </div>
            ) : (
              <>
                {/* Phones: cards */}
                <ul className="divide-y divide-zinc-100 md:hidden">
                  {rows.map((s) => (
                    <li key={s.id} className="space-y-2 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <a href={`mailto:${s.email}`} className="min-w-0 break-all text-sm font-semibold text-ink hover:underline">
                          {s.email}
                        </a>
                        <StatusPill status={s.status} />
                      </div>
                      <p className="text-xs text-zinc-500">
                        {s.source ?? "footer"} · {shortDate(s.createdAt)}
                      </p>
                      <SubscriberActions id={s.id} email={s.email} subscribed={s.status === "SUBSCRIBED"} />
                    </li>
                  ))}
                </ul>
                {/* Tablets and up: table */}
                <div className="hidden md:block">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
                        <th className="px-5 py-2.5 font-semibold">Email</th>
                        <th className="px-3 py-2.5 font-semibold">Status</th>
                        <th className="px-3 py-2.5 font-semibold">Source</th>
                        <th className="px-3 py-2.5 font-semibold">Signed up</th>
                        <th className="px-5 py-2.5 text-right font-semibold">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {rows.map((s) => (
                        <tr key={s.id} className="align-middle hover:bg-zinc-50">
                          <td className="max-w-[320px] px-5 py-3">
                            <a href={`mailto:${s.email}`} className="block truncate font-medium text-ink hover:underline" title={s.email}>
                              {s.email}
                            </a>
                          </td>
                          <td className="px-3 py-3">
                            <StatusPill status={s.status} />
                          </td>
                          <td className="px-3 py-3 text-zinc-600">{s.source ?? "footer"}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-500">{shortDate(s.createdAt)}</td>
                          <td className="px-5 py-3">
                            <SubscriberActions id={s.id} email={s.email} subscribed={s.status === "SUBSCRIBED"} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {matching > rows.length && (
                  <p className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500">
                    Showing the newest {rows.length.toLocaleString("en-US")} of {matching.toLocaleString("en-US")}. Search to narrow it down; the CSV export has all of them.
                  </p>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </>
  );
}
