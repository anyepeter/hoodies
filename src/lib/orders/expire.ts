import "server-only";
import { prisma } from "@/lib/db";
import { parseStockTaken, describeUnits } from "@/lib/orders/pricing";
import { revalidateStorefront } from "@/lib/stock";
import { STYLES } from "@/lib/store";

/** Unpaid orders give their stock back after this long, so fake orders can't keep the store "sold out". */
export const PENDING_EXPIRY_HOURS = 48;

/**
 * Cancels PENDING orders older than PENDING_EXPIRY_HOURS and puts their stock back (exactly once, same claim as
 * the admin's cancel). Called lazily — when an order is placed and when the admin opens Orders — so there's no
 * cron. Normally finds nothing: one indexed query. Never throws.
 */
export async function expireUnpaidOrders(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - PENDING_EXPIRY_HOURS * 3_600_000);
    const stale = await prisma.order.findMany({
      where: { status: "PENDING", createdAt: { lt: cutoff } },
      select: { id: true, stockTaken: true },
      orderBy: { createdAt: "asc" },
      take: 25,
    });
    let restoredAny = false;
    for (const order of stale) {
      const restored = await prisma.$transaction(async (tx) => {
        const changed = await tx.order.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
        if (changed.count === 0) return false; // paid or cancelled meanwhile
        await tx.orderEvent.create({
          data: { orderId: order.id, type: "status", fromStatus: "PENDING", toStatus: "CANCELLED", message: `Cancelled automatically: not paid within ${PENDING_EXPIRY_HOURS} hours` },
        });
        const claim = await tx.order.updateMany({ where: { id: order.id, stockRestored: false }, data: { stockRestored: true } });
        if (claim.count === 0) return false;
        const taken = parseStockTaken(order.stockTaken);
        for (const style of STYLES) {
          const n = taken[style];
          if (n > 0) await tx.$executeRaw`UPDATE "StyleStock" SET "stock" = "stock" + ${n}, "updatedAt" = NOW() WHERE "style" = ${style}`;
        }
        const units = describeUnits(taken);
        await tx.orderEvent.create({ data: { orderId: order.id, type: "stock", message: units ? `Put back: ${units}` : "Nothing to put back" } });
        return Boolean(units);
      });
      restoredAny ||= restored;
    }
    if (restoredAny) revalidateStorefront();
    return stale.length;
  } catch (err) {
    console.error("[orders] expiring unpaid orders failed", err);
    return 0;
  }
}
