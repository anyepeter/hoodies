import "server-only";
import { prisma } from "@/lib/db";

/** Tokens are 24 random bytes in base64url (32 characters). Anything else is not worth a query. */
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

/** The customer's view of an order: everything but the admin's notes and audit trail. */
export async function getOrderByToken(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  return prisma.order.findUnique({
    where: { token },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
}

export type CustomerOrder = NonNullable<Awaited<ReturnType<typeof getOrderByToken>>>;

/** Payment methods offered at checkout, in the admin's order. Empty if the database can't be reached. */
export async function activePaymentOptions(): Promise<{ id: string; name: string; instructions: string }[]> {
  try {
    return await prisma.paymentOption.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, instructions: true },
    });
  } catch (err) {
    console.error("[checkout] could not load payment methods", err);
    return [];
  }
}

/** The snapshot an order keeps: the method's instructions with {order} and {total} filled in, then its details. */
export function paymentSnapshot(option: { instructions: string; details: string | null }, order: string, total: string): string {
  const fill = (s: string) => s.replaceAll("{order}", order).replaceAll("{total}", total);
  const details = option.details?.trim();
  return details ? `${fill(option.instructions.trim())}\n\n${fill(details)}` : fill(option.instructions.trim());
}
