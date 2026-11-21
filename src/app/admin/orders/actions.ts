"use server";

import type { OrderStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/admin-session";
import { PaymentDetailsError, sendPaymentDetails } from "@/lib/chat/order-chat";
import { MESSAGE_MAX } from "@/lib/chat/shared";
import { prisma } from "@/lib/db";
import { notifyAdmins } from "@/lib/notify";
import { describeUnits, parseStockTaken } from "@/lib/orders/pricing";
import { ORDER_STATUSES, STATUS_LABEL, canTransition, restoresStock } from "@/lib/orders/status";
import { revalidateStorefront } from "@/lib/stock";
import { STYLES } from "@/lib/store";

export type ActionResult = { ok: true } | { ok: false; error: string };

const SIGNED_OUT = "You're signed out. Sign in again and retry.";

async function guard(): Promise<string | null> {
  try {
    await assertAdmin();
    return null;
  } catch {
    return SIGNED_OUT;
  }
}

function revalidateAdmin(id: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/products");
}

class Stale extends Error {}

const StatusInput = z.object({
  id: z.string().min(1).max(64),
  to: z.enum(ORDER_STATUSES as [OrderStatus, ...OrderStatus[]]),
  reference: z.string().trim().max(200, "Keep the reference under 200 characters.").optional(),
});

/**
 * Moves an order along its lifecycle. The transition map in src/lib/orders/status.ts is enforced here (the
 * buttons are only a convenience). The status change is conditional on the status we read, so two tabs can't
 * both apply a change; stock goes back at most once, guarded by the stockRestored flag.
 */
export async function changeOrderStatus(input: { id: string; to: OrderStatus; reference?: string }): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const parsed = StatusInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const { id, to } = parsed.data;
  const reference = parsed.data.reference || null;

  try {
    const order = await prisma.order.findUnique({ where: { id }, select: { status: true } });
    if (!order) return { ok: false, error: "That order doesn't exist any more." };
    const from = order.status;
    if (from === to) return { ok: true }; // a double click, already done
    if (!canTransition(from, to)) {
      return { ok: false, error: `A ${STATUS_LABEL[from].toLowerCase()} order can't be marked ${STATUS_LABEL[to].toLowerCase()}.` };
    }

    const now = new Date();
    const data: Prisma.OrderUpdateManyMutationInput = { status: to };
    if (to === "PAID") {
      data.paidAt = now;
      if (reference) data.paymentReference = reference;
    }
    if (to === "SHIPPED") data.shippedAt = now;
    if (to === "DELIVERED") data.deliveredAt = now;
    if (to === "CANCELLED") data.cancelledAt = now;

    const restored = await prisma.$transaction(
      async (tx) => {
        const changed = await tx.order.updateMany({ where: { id, status: from }, data });
        if (changed.count === 0) throw new Stale();
        await tx.orderEvent.create({
          data: {
            orderId: id,
            type: to === "PAID" ? "payment" : "status",
            fromStatus: from,
            toStatus: to,
            message: to === "PAID" ? (reference ? `Reference ${reference}` : "No payment reference recorded") : `${STATUS_LABEL[from]} → ${STATUS_LABEL[to]}`,
          },
        });

        if (!restoresStock(from, to)) return false;
        // Claim the restore first: only the call that flips the flag puts stock back.
        const claim = await tx.order.updateMany({ where: { id, stockRestored: false }, data: { stockRestored: true } });
        if (claim.count === 0) return false;
        // Read what it holds now, under the row lock the claim took: an edit may have changed it since the page loaded.
        const held = await tx.order.findUnique({ where: { id }, select: { stockTaken: true } });
        const taken = parseStockTaken(held?.stockTaken);
        for (const style of STYLES) {
          const n = taken[style];
          if (n > 0) await tx.$executeRaw`UPDATE "StyleStock" SET "stock" = "stock" + ${n}, "updatedAt" = NOW() WHERE "style" = ${style}`;
        }
        const units = describeUnits(taken);
        await tx.orderEvent.create({ data: { orderId: id, type: "stock", message: units ? `Put back: ${units}` : "Nothing to put back" } });
        return Boolean(units);
      },
      { maxWait: 10_000, timeout: 20_000 },
    );

    revalidateAdmin(id);
    if (restored) revalidateStorefront();
    notifyAdmins("order.updated", null, { id });
    return { ok: true };
  } catch (err) {
    if (err instanceof Stale) return { ok: false, error: "This order changed a moment ago (another tab?). The page now shows its current status." };
    console.error("[admin/orders] status change failed", err);
    return { ok: false, error: "The order couldn't be updated. Try again." };
  }
}

const NoteInput = z.object({
  id: z.string().min(1).max(64),
  message: z.string().trim().min(1, "Write a note first.").max(2000, "Keep notes under 2,000 characters."),
});

/** Adds an internal note to the order's timeline. Customers never see these. */
export async function addOrderNote(input: { id: string; message: string }): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const parsed = NoteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  try {
    const exists = await prisma.order.count({ where: { id: parsed.data.id } });
    if (!exists) return { ok: false, error: "That order doesn't exist any more." };
    await prisma.orderEvent.create({ data: { orderId: parsed.data.id, type: "note", message: parsed.data.message } });
    revalidatePath(`/admin/orders/${parsed.data.id}`);
    notifyAdmins("order.updated", null, { id: parsed.data.id });
    return { ok: true };
  } catch (err) {
    console.error("[admin/orders] note failed", err);
    return { ok: false, error: "The note couldn't be saved. Try again." };
  }
}

const PaymentDetailsInput = z.object({
  id: z.string().min(1).max(64),
  body: z
    .string()
    .trim()
    .min(1, "Write the message with the payment details first.")
    .max(MESSAGE_MAX, `Keep the message under ${MESSAGE_MAX.toLocaleString("en-US")} characters.`),
});

/**
 * Sends the payment details for an order into the shopper's chat (the message the admin checked on the order
 * page). Can be sent again, e.g. after changing an account. The timeline records each send.
 */
export async function sendOrderPaymentDetails(input: { id: string; body: string }): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const parsed = PaymentDetailsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const { id, body } = parsed.data;
  try {
    await sendPaymentDetails(id, body);
    await prisma.orderEvent.create({ data: { orderId: id, type: "chat", message: "Payment details sent in the chat" } });
    revalidatePath(`/admin/orders/${id}`);
    revalidatePath("/admin/orders");
    notifyAdmins("order.updated", null, { id });
    return { ok: true };
  } catch (err) {
    if (err instanceof PaymentDetailsError) return { ok: false, error: err.message };
    console.error("[admin/orders] sending payment details failed", err);
    return { ok: false, error: "The message couldn't be sent. Try again." };
  }
}
