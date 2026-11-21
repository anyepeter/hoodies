// The order lifecycle in one place. The server actions enforce this map; the admin buttons are derived from
// it, so the two can't drift. Client-safe.

import type { OrderStatus } from "@prisma/client";

export const ORDER_STATUSES: OrderStatus[] = ["PENDING", "PAID", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"];

export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PAID", "CANCELLED"],
  PAID: ["SHIPPED", "REFUNDED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "REFUNDED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus) => TRANSITIONS[from].includes(to);

/** Cancelling or refunding an order that hasn't shipped puts its hoodies back on the shelf. */
export const restoresStock = (from: OrderStatus, to: OrderStatus) => (to === "CANCELLED" || to === "REFUNDED") && (from === "PENDING" || from === "PAID");

export const isOrderStatus = (v: unknown): v is OrderStatus => typeof v === "string" && (ORDER_STATUSES as string[]).includes(v);

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

/** What the customer reads on their order page. */
export const CUSTOMER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Waiting for payment",
  PAID: "Paid · getting it ready",
  SHIPPED: "On its way",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export const ACTION: Record<OrderStatus, { label: string; tone: "primary" | "secondary" | "danger" }> = {
  PENDING: { label: "Reopen", tone: "secondary" },
  PAID: { label: "Mark paid", tone: "primary" },
  SHIPPED: { label: "Mark shipped", tone: "primary" },
  DELIVERED: { label: "Mark delivered", tone: "primary" },
  REFUNDED: { label: "Refund", tone: "secondary" },
  CANCELLED: { label: "Cancel order", tone: "danger" },
};

/** Shown to people as #1001 (the database counts from 1). */
export const orderNumber = (n: number) => `#${1000 + n}`;

/** "#1001", "1001" or "1" typed into the admin search → the stored number, or null. */
export function parseOrderNumber(q: string): number | null {
  const m = /^#?(\d{1,9})$/.exec(q.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n > 1000 ? n - 1000 : null;
}
