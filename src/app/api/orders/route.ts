import { randomBytes } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { ensureOrderConversation, paymentMessage, pingAfterInvoice, postInvoice } from "@/lib/chat/order-chat";
import { CHAT_COOKIE, chatCookieOptions } from "@/lib/chat/server";
import { prisma } from "@/lib/db";
import { clientIp, fail, ok, rateLimit, readJson, sameOrigin, serverError } from "@/lib/http";
import { notifyAdmins } from "@/lib/notify";
import { orderSchema } from "@/lib/orders/checkout-schema";
import { countryName } from "@/lib/orders/countries";
import { expireUnpaidOrders } from "@/lib/orders/expire";
import { discountCents, ratePercent } from "@/lib/orders/payment-rails";
import { MAX_HOODIES_PER_ORDER, MAX_QTY, decimal, describeUnits, moneyCents, priceCart, summarizeLines } from "@/lib/orders/pricing";
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
 * amounts, and the payment method's discount is read from its database row. Stock is taken with one
 * conditional UPDATE per style inside the same transaction that writes the order, so two shoppers can never
 * buy the same last hoodie. The same transaction posts the invoice into the shopper's chat (made for them if
 * they never chatted: the response then sets the chat cookie), so an order never exists without its invoice.
 */
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
    const option = await prisma.paymentOption.findFirst({
      where: { id: body.paymentOptionId, active: true },
      select: { id: true, name: true, key: true, instructions: true, details: true, discountRate: true },
    });
    if (!option) return fail("That payment method isn't available any more. Choose another one.", 400);

    const rawVisitor = req.cookies.get(VISITOR_COOKIE)?.value;
    const visitorId = rawVisitor && UUID_RE.test(rawVisitor) ? rawVisitor.toLowerCase() : null;
    const token = randomBytes(24).toString("base64url");
    // The method's discount (crypto: 10% off the items), from its row. Nothing the browser sends changes it.
    const discount = discountCents(cart.subtotalCents, option.discountRate);
    const totalCents = cart.subtotalCents - discount + cart.shippingCents;
    const total = moneyCents(totalCents);
    const pays = discount > 0 ? `${option.name} (${ratePercent(option.discountRate)} off, −${moneyCents(discount)})` : option.name;
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

        // The number is needed inside the payment message ("write #1001 in the note"), so take it from the
        // sequence first instead of creating the order and rewriting it.
        const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval(pg_get_serial_sequence('"Order"', 'number')) AS n`;
        const number = Number(n);

        const created = await tx.order.create({
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
            paymentKey: option.key,
            paymentDiscount: decimal(discount),
            // The admin's reference copy of the payment message, as it read when the order was placed. The
            // shopper never sees it here: the admin sends the details in the chat after they confirm.
            paymentInstructions: paymentMessage(option.instructions, { order: orderNumber(number), total, details: option.details ?? "" }),
            compareAtTotal: decimal(cart.compareAtCents),
            subtotal: decimal(cart.subtotalCents),
            shipping: decimal(cart.shippingCents),
            total: decimal(totalCents),
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
              create: {
                type: "created",
                toStatus: "PENDING",
                message: `Pays by ${pays} · took ${describeUnits(cart.units) || "no hoodies"} from stock · invoice sent in the chat`,
              },
            },
          },
          select: { id: true, number: true },
        });

        // The invoice goes into the shopper's own chat, with "is everything correct?" under it.
        const conversation = await ensureOrderConversation(tx, { name: body.name, email: body.email, visitorId, userAgent: req.headers.get("user-agent") });
        await postInvoice(tx, { id: created.id, number: created.number, total }, conversation.id);
        return { ...created, conversation };
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
    pingAfterInvoice(order.conversation.id);
    if (visitorId) {
      after(() => prisma.visitor.updateMany({ where: { id: visitorId }, data: { email: body.email } }).catch(() => {}));
    }
    const res = ok({ token, number, conversationId: order.conversation.id }, 201);
    // First chat for this browser: hand it the key to the conversation the invoice is in.
    if (order.conversation.token) res.cookies.set(CHAT_COOKIE, order.conversation.token, chatCookieOptions);
    return res;
  } catch (err) {
    if (err instanceof OutOfStock) {
      const message =
        err.left === 0 ? `${err.style} is sold out. Remove it from your cart to continue.` : `Only ${err.left} ${err.style} left. Lower the quantity in your cart to continue.`;
      return fail(message, 409, { style: err.style, left: err.left });
    }
    return serverError("orders", err);
  }
}
