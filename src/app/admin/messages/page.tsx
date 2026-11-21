import type { MessageStatus } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { RefreshOn } from "@/components/admin/dashboard/RefreshOn";
import { Card, EmptyState, PageHeader, StatusPill, Tabs, shortDate } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/admin-session";
import { ago, preview } from "@/lib/analytics/format";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Messages" };

const FILTERS = ["unread", "read", "archived", "all"] as const;
type Filter = (typeof FILTERS)[number];
const LABEL: Record<Filter, string> = { unread: "Unread", read: "Read", archived: "Archived", all: "All" };
const STATUS: Record<Exclude<Filter, "all">, MessageStatus> = { unread: "UNREAD", read: "READ", archived: "ARCHIVED" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function MessagesPage({ searchParams }: { searchParams: SP }) {
  await requireAdminPage();
  const sp = await searchParams;
  const filter: Filter = FILTERS.includes(sp.status as Filter) ? (sp.status as Filter) : "unread";

  const [rows, groups] = await Promise.all([
    prisma.contactMessage.findMany({
      where: filter === "all" ? {} : { status: STATUS[filter] },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, name: true, email: true, body: true, status: true, createdAt: true },
    }),
    prisma.contactMessage.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const count = (s: MessageStatus) => groups.find((g) => g.status === s)?._count._all ?? 0;
  const counts: Record<Filter, number> = { unread: count("UNREAD"), read: count("READ"), archived: count("ARCHIVED"), all: groups.reduce((n, g) => n + g._count._all, 0) };

  return (
    <>
      <RefreshOn events={["admin:contact.created"]} />
      <PageHeader
        title="Messages"
        subtitle={counts.all === 0 ? "What shoppers send with the contact form." : counts.unread === 0 ? "Inbox zero. Nicely done." : `${counts.unread} unread of ${counts.all}`}
      />
      <Tabs active={filter} items={FILTERS.map((f) => ({ key: f, label: LABEL[f], count: counts[f], href: f === "unread" ? "/admin/messages" : `/admin/messages?status=${f}` }))} />

      {counts.all === 0 ? (
        <EmptyState title="No messages yet">
          Messages from the <Link prefetch={false} href="/pages/contact" className="font-semibold text-ink underline">contact page</Link> land here, and your phone gets a notification when notifications are on.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title={filter === "unread" ? "All caught up" : `No ${LABEL[filter].toLowerCase()} messages`}>
          {filter === "unread" ? "Every message has been read." : "Nothing here right now."}
        </EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-zinc-100">
            {rows.map((m) => {
              const unread = m.status === "UNREAD";
              return (
                <li key={m.id}>
                  {/* prefetch off: opening a message marks it read, so it must only happen on a real click. */}
                  <Link href={`/admin/messages/${m.id}`} prefetch={false} className="flex items-start gap-3 px-4 py-3.5 transition hover:bg-zinc-50 sm:px-5">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${unread ? "bg-brand" : "bg-zinc-200"}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className={`min-w-0 truncate text-sm ${unread ? "font-bold text-ink" : "font-medium text-zinc-800"}`}>
                          {m.name ?? m.email}
                          {m.name && <span className="ml-2 hidden font-normal text-zinc-500 sm:inline">{m.email}</span>}
                        </p>
                        <time dateTime={m.createdAt.toISOString()} title={shortDate(m.createdAt)} className="shrink-0 text-xs text-zinc-500">
                          {ago(m.createdAt)}
                        </time>
                      </div>
                      <p className={`mt-0.5 line-clamp-2 break-words text-sm ${unread ? "text-zinc-800" : "text-zinc-500"}`}>{preview(m.body, 160)}</p>
                    </div>
                    {filter === "all" && m.status !== "UNREAD" && (
                      <span className="hidden shrink-0 sm:block">
                        <StatusPill status={m.status} />
                      </span>
                    )}
                    {unread && <span className="sr-only">Unread</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
