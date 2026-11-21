import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, btn } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/admin-session";
import { prisma } from "@/lib/db";
import { PaymentMethodsClient, type PaymentRow } from "./PaymentMethodsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment methods" };

async function load(): Promise<PaymentRow[]> {
  const [options, counts] = await Promise.all([
    prisma.paymentOption.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.order.groupBy({ by: ["paymentOptionId"], where: { paymentOptionId: { not: null } }, _count: { _all: true } }),
  ]);
  const used = new Map(counts.map((c) => [c.paymentOptionId, c._count._all]));
  return options.map((o) => ({
    id: o.id,
    name: o.name,
    key: o.key ?? "",
    detail: o.detail ?? "",
    discountPercent: Math.round(Number(o.discountRate) * 100),
    details: o.details ?? "",
    instructions: o.instructions,
    active: o.active,
    orders: used.get(o.id) ?? 0,
  }));
}

export default async function PaymentMethodsPage() {
  await requireAdminPage();
  const rows = await load().catch((err) => {
    console.error("[admin/payment-methods] load failed", err);
    return null;
  });

  return (
    <>
      <PageHeader title="Payment methods" subtitle="The ways to pay shown at checkout. The shopper picks one; once they confirm their invoice in the chat, you send that method's message from the order page." />
      {rows ? (
        <PaymentMethodsClient rows={rows} />
      ) : (
        <EmptyState
          title="Payment methods couldn't be loaded"
          action={
            <Link prefetch={false} href="/admin/payment-methods" className={btn.secondary}>
              Try again
            </Link>
          }
        >
          The database didn&apos;t answer. Wait a moment and try again.
        </EmptyState>
      )}
    </>
  );
}
