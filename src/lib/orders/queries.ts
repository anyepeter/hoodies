import "server-only";
import { prisma } from "@/lib/db";
import { clampRate } from "@/lib/orders/payment-rails";

/** Tokens are 24 random bytes in base64url (32 characters). Anything else is not worth a query. */
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

/**
 * The customer's view of an order: everything but the admin's notes and audit trail. The payment message
 * (`paymentInstructions`) is left out on purpose: it's the admin's reference copy, and the shopper gets the
 * payment details in the chat, from the admin, once they've confirmed the invoice.
 */
export async function getOrderByToken(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  return prisma.order.findUnique({
    where: { token },
    omit: { paymentInstructions: true },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
}

export type CustomerOrder = NonNullable<Awaited<ReturnType<typeof getOrderByToken>>>;

/** What the checkout shows for each method: never the account details (those come in the chat). */
export interface CheckoutPaymentOption {
  id: string;
  name: string;
  key: string | null;
  detail: string | null;
  /** 0.1 = 10% off, applied (again) on the server. */
  discountRate: number;
}

/** Payment methods offered at checkout, in the admin's order. Empty if the database can't be reached. */
export async function activePaymentOptions(): Promise<CheckoutPaymentOption[]> {
  try {
    const rows = await prisma.paymentOption.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, key: true, detail: true, discountRate: true },
    });
    return rows.map((o) => ({ ...o, discountRate: clampRate(o.discountRate) }));
  } catch (err) {
    console.error("[checkout] could not load payment methods", err);
    return [];
  }
}
