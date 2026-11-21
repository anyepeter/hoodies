import "server-only";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { countryName } from "@/lib/orders/countries";
import { NEEDS_ATTENTION, fieldErrorsOf, orderEditSchema, orderLimitProblem, type OrderEditResult } from "@/lib/orders/edit-schema";
import { discountCents, fillPaymentTemplate, ratePercent } from "@/lib/orders/payment-rails";
import { decimal, describeUnits, itemKey, moneyCents, parseLineKey, parseStockTaken, priceCart, summarizeLines, type PricedLine } from "@/lib/orders/pricing";
import { STATUS_LABEL, orderNumber } from "@/lib/orders/status";
import { STYLES, type Style } from "@/lib/store";

/*
 * The admin fixes an order after the shopper said "Something's wrong" (the vape store's flow): address, contact,
 * the hoodies in each pack, quantities, packs and add-ons, the payment method. Like POST /api/orders, the input
 * is cart keys and quantities only: every amount is worked out again here from src/lib/store.ts and the method's
 * discount from its database row. Nothing the browser sends sets a total.
 *
 * Stock follows the change exactly: the order row is locked first (so a cancel or a second edit waits), then each
 * style's difference against the order's `stockTaken` is taken with the same conditional UPDATE as checkout
 * (`stock >= n`) or put back, and the items are rewritten, all in one transaction. Only PENDING orders.
 * Callers check that the admin is asking (assertAdmin).
 */

class Refused extends Error {}

class OutOfStock extends Error {
  constructor(
    readonly style: Style,
    readonly left: number,
    readonly needed: number,
  ) {
    super("out of stock");
  }
}

const notPending = (status: OrderStatus) =>
  `This order is ${STATUS_LABEL[status].toLowerCase()} now, so it can't be edited. Only orders waiting for payment can be changed.`;

/** The customer fields the timeline reports, with their labels. */
const FIELDS = [
  ["name", "Name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["country", "Country"],
  ["address1", "Address"],
  ["address2", "Address line 2"],
  ["city", "City"],
  ["region", "State / region"],
  ["postalCode", "Postal code"],
] as const;

const shown = (v: string | null | undefined) => (v ? v : "(empty)");

/** "2× Duo Pack (Akatsuki / M, Shinobi / L), Mystery Box" from stored items. */
function itemsSummary(items: { kind: string; sku: string; detail: string | null; title: string; quantity: number }[]): string {
  return summarizeLines(
    items.map((i) => {
      const parsed = parseLineKey(itemKey(i));
      return { shortTitle: parsed?.shortTitle, title: i.title, detail: i.detail, quantity: i.quantity };
    }),
    600,
  );
}

/** Same items, ignoring order: compares cart keys and quantities. */
function sameItems(a: { key: string; quantity: number }[], b: { key: string; quantity: number }[]): boolean {
  const norm = (l: { key: string; quantity: number }[]) =>
    l
      .map((x) => `${x.key}×${x.quantity}`)
      .sort()
      .join("|");
  return norm(a) === norm(b);
}

export async function updateOrder(raw: unknown): Promise<OrderEditResult> {
  const parsed = orderEditSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: NEEDS_ATTENTION, fieldErrors: fieldErrorsOf(parsed.error) };
  const { id, customer: c, lines } = parsed.data;

  const cart = priceCart(lines);
  const problem = orderLimitProblem(cart);
  if (problem) return { ok: false, error: problem, fieldErrors: { lines: problem } };

  try {
    const current = await prisma.order.findUnique({ where: { id }, select: { status: true, paymentOptionId: true } });
    if (!current) return { ok: false, error: "That order doesn't exist any more." };
    if (current.status !== "PENDING") return { ok: false, error: notPending(current.status) };

    // An active method, or the one the order already uses (even if it was turned off since: keeping it is fine).
    const option = await prisma.paymentOption.findFirst({
      where: { id: c.paymentOptionId, OR: [{ active: true }, ...(current.paymentOptionId ? [{ id: current.paymentOptionId }] : [])] },
      select: { id: true, name: true, key: true, instructions: true, details: true, discountRate: true },
    });
    if (!option) {
      return { ok: false, error: NEEDS_ATTENTION, fieldErrors: { paymentOptionId: "That payment method isn't offered any more. Choose another one." } };
    }

    const discount = discountCents(cart.subtotalCents, option.discountRate);
    const totalCents = cart.subtotalCents - discount + cart.shippingCents;
    const total = moneyCents(totalCents);
    const units = cart.units;

    const result = await prisma.$transaction(
      async (tx) => {
        // Lock the order: a cancel, the 48-hour expiry or another tab's edit waits until this one is done, so the
        // stock it holds (`stockTaken`) can't change under us.
        const locked = await tx.$queryRaw<{ status: OrderStatus; stockRestored: boolean }[]>`
          SELECT "status", "stockRestored" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
        const row = locked[0];
        if (!row) throw new Refused("That order doesn't exist any more.");
        if (row.status !== "PENDING" || row.stockRestored) throw new Refused(notPending(row.status));

        const order = await tx.order.findUniqueOrThrow({
          where: { id },
          select: {
            number: true,
            name: true,
            email: true,
            phone: true,
            country: true,
            address1: true,
            address2: true,
            city: true,
            region: true,
            postalCode: true,
            notes: true,
            paymentOptionId: true,
            paymentMethod: true,
            total: true,
            stockTaken: true,
            items: { orderBy: { sortOrder: "asc" }, select: { kind: true, sku: true, detail: true, title: true, quantity: true } },
          },
        });

        const next = {
          name: c.name,
          email: c.email,
          phone: c.phone,
          country: countryName(c.country),
          address1: c.address1,
          address2: c.address2,
          city: c.city,
          region: c.region,
          postalCode: c.postalCode ?? "",
        };

        // What changed, in words, for the timeline. Nothing changed → nothing is written.
        const changes: string[] = [];
        for (const [field, label] of FIELDS) {
          if ((order[field] || null) !== (next[field] || null)) changes.push(`${label}: ${shown(order[field])} → ${shown(next[field])}`);
        }
        if ((order.notes || null) !== (c.notes || null)) changes.push(c.notes ? "Customer's note changed" : "Customer's note removed");
        const oldLines = order.items.map((i) => ({ key: itemKey(i), quantity: i.quantity }));
        if (!sameItems(oldLines, cart.lines)) changes.push(`Items: ${itemsSummary(order.items)} → ${summarizeLines(cart.lines, 600)}`);
        if (order.paymentOptionId !== option.id) {
          changes.push(`Payment: ${order.paymentMethod} → ${option.name}${discount > 0 ? ` (${ratePercent(option.discountRate)} off)` : ""}`);
        }
        if (Number(order.total).toFixed(2) !== decimal(totalCents)) changes.push(`Total: ${moneyCents(Math.round(Number(order.total) * 100))} → ${total}`);
        if (changes.length === 0) return { changed: false, stockMoved: false };

        // Stock: take what the new items need beyond what the order holds, put back what it no longer needs.
        // Styles in a fixed order, like checkout, so concurrent writers lock the stock rows in the same order.
        const taken = parseStockTaken(order.stockTaken);
        const took: Partial<Record<Style, number>> = {};
        const putBack: Partial<Record<Style, number>> = {};
        for (const style of STYLES) {
          const delta = units[style] - taken[style];
          if (delta > 0) {
            const changed = await tx.$executeRaw`UPDATE "StyleStock" SET "stock" = "stock" - ${delta}, "updatedAt" = NOW() WHERE "style" = ${style} AND "stock" >= ${delta}`;
            if (changed === 0) {
              const left = await tx.styleStock.findUnique({ where: { style }, select: { stock: true } });
              throw new OutOfStock(style, Math.max(0, left?.stock ?? 0), delta);
            }
            took[style] = delta;
          } else if (delta < 0) {
            await tx.$executeRaw`UPDATE "StyleStock" SET "stock" = "stock" + ${-delta}, "updatedAt" = NOW() WHERE "style" = ${style}`;
            putBack[style] = -delta;
          }
        }
        const stockText = [describeUnits(took) && `took ${describeUnits(took)}`, describeUnits(putBack) && `put back ${describeUnits(putBack)}`].filter(Boolean).join(", ");
        if (stockText) changes.push(`Stock: ${stockText}`);

        await tx.orderItem.deleteMany({ where: { orderId: id } });
        await tx.orderItem.createMany({ data: cart.lines.map((l: PricedLine, i) => ({ orderId: id, ...itemData(l), sortOrder: i })) });
        await tx.order.update({
          where: { id },
          data: {
            ...next,
            notes: c.notes,
            paymentOptionId: option.id,
            paymentMethod: option.name,
            paymentKey: option.key,
            paymentDiscount: decimal(discount),
            // The admin's reference copy of the payment message, for the new total and method.
            paymentInstructions: fillPaymentTemplate(option.instructions, { order: orderNumber(order.number), total, details: option.details ?? "" }),
            compareAtTotal: decimal(cart.compareAtCents),
            subtotal: decimal(cart.subtotalCents),
            shipping: decimal(cart.shippingCents),
            total: decimal(totalCents),
            stockTaken: Object.fromEntries(STYLES.filter((s) => units[s] > 0).map((s) => [s, units[s]])),
          },
        });
        await tx.orderEvent.create({ data: { orderId: id, type: "edited", message: changes.join("\n") } });
        return { changed: true, stockMoved: Boolean(stockText) };
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
    return { ok: true, ...result };
  } catch (err) {
    if (err instanceof Refused) return { ok: false, error: err.message };
    if (err instanceof OutOfStock) {
      const message =
        err.left === 0
          ? `No ${err.style} left in stock: this change needs ${err.needed} more. Lower the quantity or pick another style.`
          : `Only ${err.left} ${err.style} left in stock: this change needs ${err.needed} more. Lower the quantity or pick another style.`;
      return { ok: false, error: message, fieldErrors: { lines: message } };
    }
    console.error("[orders] edit failed", err);
    return { ok: false, error: "The order couldn't be saved. Try again." };
  }
}

/** An order item row from a priced line (same columns POST /api/orders writes). */
function itemData(l: PricedLine) {
  return {
    kind: l.kind,
    sku: l.sku,
    title: l.title,
    detail: l.detail,
    image: l.image,
    quantity: l.quantity,
    unitPrice: decimal(l.unitCents),
    unitCompareAt: l.unitCompareAtCents === null ? null : decimal(l.unitCompareAtCents),
    lineTotal: decimal(l.lineCents),
  };
}
