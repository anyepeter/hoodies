// What the admin's order editor sends, and the order-wide limits, shared by the editor (inline errors, live
// preview) and the server (src/lib/orders/edit.ts, which checks everything again). Same field rules as checkout.
// Like the checkout body, it carries cart keys and quantities, never amounts. Client-safe.

import { z, type ZodError } from "zod";
import { customerSchema, lineSchema } from "@/lib/orders/checkout-schema";
import { MAX_HOODIES_PER_ORDER, MAX_LINES, MAX_QTY, hoodieCount, type PricedCart } from "@/lib/orders/pricing";

export const orderEditSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "That order doesn't exist."),
  customer: customerSchema,
  lines: z.array(lineSchema).min(1, "An order needs at least one item.").max(MAX_LINES, `At most ${MAX_LINES} different items per order.`),
});

export type OrderEditInput = z.input<typeof orderEditSchema>;

export type OrderEditResult =
  | { ok: true; changed: boolean; stockMoved: boolean }
  | {
      ok: false;
      error: string;
      /** Keyed by customer field ("email", "paymentOptionId"…), "lines" (the items as a whole) or "lines.<i>". */
      fieldErrors?: Record<string, string>;
    };

export const NEEDS_ATTENTION = "Some fields need attention.";

/** Zod issues → one message per field, keyed like OrderEditResult.fieldErrors. */
export function fieldErrorsOf(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const [root, a] = issue.path;
    const key = root === "customer" && typeof a === "string" ? a : root === "lines" && typeof a === "number" ? `lines.${a}` : root === "lines" ? "lines" : "form";
    out[key] ??= issue.message;
  }
  return out;
}

/** The order-wide limits (the same as checkout's). Null when the priced items are fine. */
export function orderLimitProblem(cart: PricedCart): string | null {
  if (cart.invalid.length > 0) return "Something in this order isn't sold any more. Remove it to save.";
  if (cart.lines.length === 0) return "An order needs at least one item.";
  if (cart.lines.length > MAX_LINES) return `At most ${MAX_LINES} different items per order.`;
  const tooMany = cart.lines.find((l) => l.quantity > MAX_QTY);
  if (tooMany) return `At most ${MAX_QTY} of one item per order (${tooMany.shortTitle} has ${tooMany.quantity}).`;
  const hoodies = hoodieCount(cart.units);
  if (hoodies > MAX_HOODIES_PER_ORDER) return `An order can have up to ${MAX_HOODIES_PER_ORDER} hoodies. This one would have ${hoodies}: remove some to save.`;
  return null;
}
