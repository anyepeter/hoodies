import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageHeader, StatusPill, shortDate } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/admin-session";
import { ago } from "@/lib/analytics/format";
import { prisma } from "@/lib/db";
import { notifyAdmins } from "@/lib/notify";
import { STORE_NAME } from "@/lib/store";
import { MessageActions } from "./MessageActions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Message" };

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const message = await prisma.contactMessage.findUnique({ where: { id } });
  if (!message) notFound();

  // Opening a message reads it. The list links don't prefetch, so only a real visit gets here.
  if (message.status === "UNREAD") {
    const { count } = await prisma.contactMessage.updateMany({ where: { id, status: "UNREAD" }, data: { status: "READ" } });
    if (count > 0) {
      message.status = "READ";
      notifyAdmins("badges", null);
    }
  }

  const who = message.name ?? message.email;
  const quoted = message.body.slice(0, 1500).replace(/^/gm, "> ");
  const replyHref =
    `mailto:${encodeURIComponent(message.email).replace("%40", "@")}` +
    `?subject=${encodeURIComponent(`Re: your message to ${STORE_NAME}`)}` +
    `&body=${encodeURIComponent(`Hi${message.name ? ` ${message.name}` : ""},\n\n\n\nOn ${shortDate(message.createdAt)} you wrote:\n${quoted}`)}`;

  return (
    <>
      <PageHeader back={{ href: "/admin/messages", label: "Messages" }} title={who} subtitle={`Received ${ago(message.createdAt)} · ${shortDate(message.createdAt)}`} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Message" actions={<StatusPill status={message.status} />}>
          {/* Plain text: React escapes it, and line breaks are kept. Never rendered as HTML. */}
          <p className="whitespace-pre-wrap break-words px-5 py-5 text-[15px] leading-relaxed text-ink">{message.body}</p>
          <div className="border-t border-zinc-100 px-5 py-4">
            <MessageActions id={message.id} status={message.status} replyHref={replyHref} />
          </div>
        </Card>
        <Card title="From">
          <dl className="divide-y divide-zinc-100 text-sm">
            <div className="px-5 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Name</dt>
              <dd className="mt-0.5 break-words text-ink">{message.name ?? <span className="text-zinc-400">Not given</span>}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Email</dt>
              <dd className="mt-0.5 break-all">
                <a href={replyHref} className="font-medium text-ink underline decoration-zinc-300 underline-offset-2 hover:decoration-ink">
                  {message.email}
                </a>
              </dd>
            </div>
            <div className="px-5 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Phone</dt>
              <dd className="mt-0.5 text-ink">
                {message.phone ? (
                  <a href={`tel:${message.phone.replace(/[^0-9+]/g, "")}`} className="underline decoration-zinc-300 underline-offset-2 hover:decoration-ink">
                    {message.phone}
                  </a>
                ) : (
                  <span className="text-zinc-400">Not given</span>
                )}
              </dd>
            </div>
            <div className="px-5 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Received</dt>
              <dd className="mt-0.5 text-ink">{shortDate(message.createdAt)}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}
