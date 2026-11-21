import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Card, EmptyState, PageHeader, StatusPill, btn, usd } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/admin-session";
import { prisma } from "@/lib/db";
import { ADD_ONS, BUNDLES, HOODIE, LOW_STOCK, STYLE_IMAGE, STYLES, type Style } from "@/lib/store";
import { StockEditor } from "./StockEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Products & stock" };

const zero = () => Object.fromEntries(STYLES.map((s) => [s, 0])) as Record<Style, number>;

async function load() {
  const [rows, taken] = await Promise.all([
    prisma.styleStock.findMany({ select: { style: true, stock: true, updatedAt: true } }),
    // Units per style in orders that still hold their stock: paid ones are sold, pending ones are reserved.
    prisma.$queryRaw<{ style: string; status: string; units: number }[]>`
      SELECT t.key AS style, o."status"::text AS status, SUM((t.value)::int)::int AS units
      FROM "Order" o, jsonb_each_text(o."stockTaken") t
      WHERE o."stockRestored" = false AND o."status" IN ('PENDING', 'PAID', 'SHIPPED', 'DELIVERED')
      GROUP BY t.key, o."status"`,
  ]);
  const stock = zero();
  const updated: Partial<Record<Style, Date>> = {};
  for (const r of rows) {
    if (!(STYLES as string[]).includes(r.style)) continue;
    stock[r.style as Style] = r.stock;
    updated[r.style as Style] = r.updatedAt;
  }
  const sold = zero();
  const reserved = zero();
  for (const t of taken) {
    if (!(STYLES as string[]).includes(t.style)) continue;
    if (t.status === "PENDING") reserved[t.style as Style] += t.units;
    else sold[t.style as Style] += t.units;
  }
  return { stock, updated, sold, reserved };
}

export default async function ProductsPage() {
  await requireAdminPage();
  const data = await load().catch((err) => {
    console.error("[admin/products] load failed", err);
    return null;
  });

  if (!data) {
    return (
      <>
        <PageHeader title="Products & stock" />
        <EmptyState
          title="Stock couldn't be loaded"
          action={
            <Link prefetch={false} href="/admin/products" className={btn.secondary}>
              Try again
            </Link>
          }
        >
          The database didn&apos;t answer. Wait a moment and try again.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Products & stock" subtitle="One hoodie in two styles. Stock you change here shows on the store straight away." />

      <Card
        title={
          <span className="flex flex-wrap items-baseline gap-x-2">
            {HOODIE.title}
            <span className="font-normal text-zinc-500">
              {usd(HOODIE.price)} <s className="text-zinc-400">{usd(HOODIE.compareAt)}</s>
            </span>
          </span>
        }
        actions={
          <a href={`/products/${HOODIE.handle}`} target="_blank" rel="noopener" className={btn.ghost}>
            View ↗
          </a>
        }
      >
        <ul className="divide-y divide-zinc-100">
          {STYLES.map((style) => {
            const left = data.stock[style];
            const state = left <= 0 ? { pill: "CANCELLED", text: "Sold out" } : left <= LOW_STOCK ? { pill: "PENDING", text: "Low stock" } : { pill: "ACTIVE", text: "In stock" };
            return (
              <li key={style} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <Image src={STYLE_IMAGE[style]} alt="" width={88} height={88} className="h-20 w-20 shrink-0 rounded-xl bg-zinc-100 object-cover sm:h-[88px] sm:w-[88px]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-ink">{style}</h2>
                    <StatusPill status={state.pill}>{state.text}</StatusPill>
                  </div>
                  <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-ink" data-stock={style}>
                    {left} <span className="text-sm font-medium text-zinc-500">left</span>
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Sold {data.sold[style]} (paid orders) · {data.reserved[style]} held by pending orders
                  </p>
                  {left > 0 && left <= LOW_STOCK && <p className="mt-1 text-xs font-medium text-amber-800">{LOW_STOCK} or fewer left. Time to restock.</p>}
                </div>
                <div className="sm:w-auto">
                  <StockEditor style={style} stock={left} />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500">
          Orders take stock the moment they&apos;re placed. Cancelling or refunding an order that hasn&apos;t shipped puts it back.
        </p>
      </Card>

      <Card title="Prices" className="mt-6" actions={<span className="text-xs text-zinc-500">Read-only</span>}>
        <div className="grid gap-6 p-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Packs</h3>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-100">
                {BUNDLES.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2 pr-3 font-medium text-ink">{b.title}</td>
                    <td className="py-2 pr-3 text-zinc-500">
                      {b.qty} {b.qty === 1 ? "hoodie" : "hoodies"}
                      {b.qty > 1 && ` · ${usd(Math.round((b.price / b.qty) * 100) / 100)} each`}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      <b>{usd(b.price)}</b> <s className="text-xs text-zinc-400">{usd(HOODIE.compareAt * b.qty)}</s>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Add-ons</h3>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-100">
                {ADD_ONS.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 pr-3 font-medium text-ink">{a.title}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{usd(a.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500">
          Prices are set in code (src/lib/store.ts), so changing one is a small code change and a deploy. Checkout always charges these numbers.
        </p>
      </Card>
    </>
  );
}
