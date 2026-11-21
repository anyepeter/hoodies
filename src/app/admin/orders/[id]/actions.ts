"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/admin-session";
import { UpdatedInvoiceError, postUpdatedInvoice } from "@/lib/chat/order-chat";
import { notifyAdmins } from "@/lib/notify";
import { updateOrder as applyOrderEdit } from "@/lib/orders/edit";
import type { OrderEditInput, OrderEditResult } from "@/lib/orders/edit-schema";
import { revalidateStorefront } from "@/lib/stock";

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

/**
 * Saves the admin's changes to a PENDING order: customer details, items, payment method. Everything is validated
 * and priced again on the server (src/lib/orders/edit.ts); stock follows the change in the same transaction.
 */
export async function updateOrder(input: OrderEditInput): Promise<OrderEditResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const result = await applyOrderEdit(input);
  if (result.ok && result.changed) {
    const id = input.id; // checked by the schema: the edit succeeded
    revalidateAdmin(id);
    if (result.stockMoved) revalidateStorefront();
    notifyAdmins("order.updated", null, { id });
  }
  return result;
}

const InvoiceInput = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "That order doesn't exist.") });

export type SendInvoiceResult = { ok: true; invoiceNumber: string } | { ok: false; error: string };

/**
 * Sends the shopper an updated invoice for a PENDING order (INV-1001-2…): the old card in the chat shows REPLACED,
 * the new one asks "is everything correct?" again.
 */
export async function sendUpdatedInvoice(input: { id: string }): Promise<SendInvoiceResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const parsed = InvoiceInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const { id } = parsed.data;
  try {
    const { invoiceNumber } = await postUpdatedInvoice(id);
    revalidateAdmin(id);
    notifyAdmins("order.updated", null, { id });
    return { ok: true, invoiceNumber };
  } catch (err) {
    if (err instanceof UpdatedInvoiceError) return { ok: false, error: err.message };
    console.error("[admin/orders] sending the updated invoice failed", err);
    return { ok: false, error: "The updated invoice couldn't be sent. Try again." };
  }
}
