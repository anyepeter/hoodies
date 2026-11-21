import { randomBytes } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, fail, ok, rateLimit, readJson, sameOrigin, serverError } from "@/lib/http";
import { notifyAdmins } from "@/lib/notify";
import { orderSchema } from "@/lib/orders/checkout-schema";
import { countryName } from "@/lib/orders/countries";
import { expireUnpaidOrders } from "@/lib/orders/expire";
import { MAX_QTY, decimal, describeUnits, moneyCents, priceCart, summarizeLines } from "@/lib/orders/pricing";
import { paymentSnapshot } from "@/lib/orders/queries";
import { orderNumber } from "@/lib/orders/status";
import { revalidateStorefront } from "@/lib/stock";
import { STYLES, type Style } from "@/lib/store";

export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "akz_vid"; // minted by the analytics tracker (insights)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class OutOfStock extends Error {
  constructor(
    readonly style: Style,
    readonly left: number,
  ) {
    super("out of stock");
  }
}

/**
 * Places an order. Prices come from src/lib/store.ts only: the body carries cart keys and quantities, never
 * amounts. Stock is taken with one conditional UPDATE per style inside the same transaction that writes the
 * order, so two shoppers can never buy the same last hoodie.
 */
/** Most hoodies one order may take. */
const MAX_HOODIES_PER_ORDER = 6;

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  if (!(await rateLimit(`orders:${clientIp(req)}`, 5, 60 * 60))) {
    return fail("Too many orders from your connection in the last hour. Please try again later.", 429);
  }
  const parsed = await readJson(req, orderSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;
  if (body.website) return ok(); // honeypot: a bot filled the hidden field

  const cart = priceCart(body.lines);
  if (cart.invalid.length > 0) return fail("Something in your cart isn't sold any more. Remove it and try again.", 400, { invalid: cart.invalid });
  if (cart.lines.length === 0) return fail("Your cart is empty.", 400);
  // One order can't take the whole stock: otherwise a script could "buy" everything unpaid and show the store
  // as sold out. Merged duplicate lines count too.
  const hoodies = STYLES.reduce((n, s) => n + cart.units[s], 0);
  if (hoodies > MAX_HOODIES_PER_ORDER) {
    return fail(`You can order up to ${MAX_HOODIES_PER_ORDER} hoodies at a time. For more, send us a message.`, 400);
  }
  if (cart.lines.some((l) => l.quantity > MAX_QTY)) return fail(`Up to ${MAX_QTY} of each item, please.`, 400);
  // Unpaid orders older than 48 h give their stock back (cheap: one indexed query, usually empty).
  after(expireUnpaidOrders);

  try {
    const option = await prisma.paymentOption.findFirst({ where: { id: body.paymentOptionId, active: true }, select: { id: true, name: true, instructions: true, details: true } });
    if (!option) return fail("That payment method isn't available any more. Choose another one.", 400);

    const rawVisitor = req.cookies.get(VISITOR_COOKIE)?.value;
    const visitorId = rawVisitor && UUID_RE.test(rawVisitor) ? rawVisitor.toLowerCase() : null;
    const token = randomBytes(24).toString("base64url");
    const total = moneyCents(cart.totalCents);
    const stockTaken = Object.fromEntries(STYLES.filter((s) => cart.units[s] > 0).map((s) => [s, cart.units[s]]));

    const order = await prisma.$transaction(
      async (tx) => {
        // Styles in a fixed order, so two concurrent orders lock the rows in the same order (no deadlock).
        for (const style of STYLES) {
          const n = cart.units[style];
          if (n <= 0) continue;
          const changed = await tx.$executeRaw`UPDATE "StyleStock" SET "stock" = "stock" - ${n}, "updatedAt" = NOW() WHERE "style" = ${style} AND "stock" >= ${n}`;
          if (changed === 0) {
            const row = await tx.styleStock.findUnique({ where: { style }, select: { stock: true } });
            throw new OutOfStock(style, Math.max(0, row?.stock ?? 0));
          }
        }

        // The number is needed inside the payment instructions ("put order #1001 as the reference"), so take
        // it from the sequence first instead of creating the order and rewriting it.
        const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval(pg_get_serial_sequence('"Order"', 'number')) AS n`;
        const number = Number(n);

        return tx.order.create({
          data: {
            number,
            token,
            name: body.name,
            email: body.email,
            phone: body.phone,
            country: countryName(body.country),
            address1: body.address1,
            address2: body.address2,
            city: body.city,
            region: body.region,
            postalCode: body.postalCode ?? "",
            notes: body.notes,
            paymentOptionId: option.id,
            paymentMethod: option.name,
            paymentInstructions: paymentSnapshot(option, orderNumber(number), total),
            compareAtTotal: decimal(cart.compareAtCents),
            subtotal: decimal(cart.subtotalCents),
            shipping: decimal(cart.shippingCents),
            total: decimal(cart.totalCents),
            stockTaken,
            visitorId,
            items: {
              create: cart.lines.map((l, i) => ({
                kind: l.kind,
                sku: l.sku,
                title: l.title,
                detail: l.detail,
                image: l.image,
                quantity: l.quantity,
                unitPrice: decimal(l.unitCents),
                unitCompareAt: l.unitCompareAtCents === null ? null : decimal(l.unitCompareAtCents),
                lineTotal: decimal(l.lineCents),
                sortOrder: i,
              })),
            },
            events: {
              create: { type: "created", toStatus: "PENDING", message: `Pays by ${option.name} · took ${describeUnits(cart.units) || "no hoodies"} from stock` },
            },
          },
          select: { id: true, number: true },
        });
      },
      { maxWait: 10_000, timeout: 20_000 },
    );

    if (cart.units.Akatsuki > 0 || cart.units.Shinobi > 0) revalidateStorefront();
    const number = orderNumber(order.number);
    notifyAdmins(
      "order.created",
      { title: `New order ${number} · ${total}`, body: `${body.name} · ${summarizeLines(cart.lines)}`, url: `/admin/orders/${order.id}`, tag: `order-${order.id}` },
      { id: order.id },
    );
    if (visitorId) {
      after(() => prisma.visitor.updateMany({ where: { id: visitorId }, data: { email: body.email } }).catch(() => {}));
    }
    return ok({ token, number }, 201);
  } catch (err) {
    if (err instanceof OutOfStock) {
      const message =
        err.left === 0 ? `${err.style} is sold out. Remove it from your cart to continue.` : `Only ${err.left} ${err.style} left. Lower the quantity in your cart to continue.`;
      return fail(message, 409, { style: err.style, left: err.left });
    }
    return serverError("orders", err);
  }
}
