import type { Prisma } from "@prisma/client";

/* The subscriber filter shared by Admin → Subscribers and its CSV export, so the export is exactly the list. */

export type SubscriberFilter = "subscribed" | "unsubscribed" | "all";
export const parseSubscriberFilter = (v: unknown): SubscriberFilter => (v === "unsubscribed" || v === "all" ? v : "subscribed");

export function parseSearch(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 100) : "";
}

export function subscriberWhere(filter: SubscriberFilter, q: string): Prisma.SubscriberWhereInput {
  return {
    ...(filter === "subscribed" ? { status: "SUBSCRIBED" } : filter === "unsubscribed" ? { status: "UNSUBSCRIBED" } : {}),
    ...(q ? { email: { contains: q, mode: "insensitive" } } : {}),
  };
}

/**
 * One CSV cell: quoted, inner quotes doubled, and a leading = + - @ (or tab / carriage return) defused with a
 * leading apostrophe so a spreadsheet never runs it as a formula (CSV injection).
 */
export function csvCell(value: string | null | undefined): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}
