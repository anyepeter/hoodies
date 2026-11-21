// The payment rails (the owner's Bourbon / Muh-med list) and the money rule for their discounts. Client-safe:
// the checkout shows the discount with the same function POST /api/orders charges it with, so they agree.

/** The built-in rails. A method's `key` picks its logo; a method without one ("Other") gets a plain badge. */
export const PAYMENT_KEYS = [
  { key: "chime", label: "Chime" },
  { key: "zelle", label: "Zelle" },
  { key: "cash-app", label: "Cash App" },
  { key: "apple-pay", label: "Apple Pay" },
  { key: "crypto", label: "Cryptocurrency (Bitcoin + Ethereum)" },
] as const;

export type PaymentKey = (typeof PAYMENT_KEYS)[number]["key"];

export const isPaymentKey = (v: unknown): v is PaymentKey => typeof v === "string" && PAYMENT_KEYS.some((k) => k.key === v);

/** Highest discount a method may give (the admin form refuses more). */
export const MAX_DISCOUNT_RATE = 0.5;

/** A stored rate (Decimal(4,3), e.g. 0.1) → a safe number between 0 and MAX_DISCOUNT_RATE. */
export function clampRate(rate: unknown): number {
  const n = Number(rate);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_DISCOUNT_RATE);
}

/**
 * What a method's discount takes off, in cents: round(subtotal × rate). The rate is worked in thousandths
 * (the column's precision), so the multiplication is exact and a half cent always rounds the same way.
 */
export function discountCents(subtotalCents: number, rate: unknown): number {
  const milli = Math.round(clampRate(rate) * 1000);
  if (milli === 0 || subtotalCents <= 0) return 0;
  return Math.round((subtotalCents * milli) / 1000);
}

/** 0.1 → "10%" */
export const ratePercent = (rate: unknown) => `${Math.round(clampRate(rate) * 1000) / 10}%`;

/** The payment-details message with {order}, {total} and {details} filled in (same rule as paymentMessage()). */
export function fillPaymentTemplate(template: string, vars: { order: string; total: string; details: string }): string {
  return template.replaceAll("{order}", vars.order).replaceAll("{total}", vars.total).replaceAll("{details}", vars.details).trim();
}

/** What a stored discount was as a share of the items, for "(10% off)" on old orders: "10%", "12.5%". */
export function discountPercentOf(discount: number, subtotal: number): string {
  if (!(discount > 0) || !(subtotal > 0)) return "0%";
  return `${Math.round((discount / subtotal) * 1000) / 10}%`;
}
