"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/db";

export type PaymentResult = { ok: true } | { ok: false; error: string; fieldErrors?: Partial<Record<"name" | "instructions" | "details", string>> };

async function guard(): Promise<string | null> {
  try {
    await assertAdmin();
    return null;
  } catch {
    return "You're signed out. Sign in again and retry.";
  }
}

function revalidate() {
  revalidatePath("/admin/payment-methods");
  revalidatePath("/checkout"); // checkout lists the active methods
}

const id = z.string().min(1).max(64);

const SaveInput = z.object({
  id: id.optional(),
  name: z.string().trim().min(1, "Give the method a name, like “Bank transfer”.").max(60, "Keep the name under 60 characters."),
  instructions: z.string().trim().min(1, "Tell the customer what to do to pay.").max(2000, "Keep the instructions under 2,000 characters."),
  details: z
    .string()
    .trim()
    .max(2000, "Keep the details under 2,000 characters.")
    .optional()
    .transform((v) => (v ? v : null)),
  active: z.boolean().optional(),
});

/** Creates a payment method, or edits one (orders already placed keep the text they were shown). */
export async function savePaymentOption(input: { id?: string; name: string; instructions: string; details?: string; active?: boolean }): Promise<PaymentResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: NonNullable<Extract<PaymentResult, { ok: false }>["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const f = issue.path[0];
      if ((f === "name" || f === "instructions" || f === "details") && !fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return { ok: false, error: "Fix the fields marked in red.", fieldErrors };
  }
  const { name, instructions, details, active } = parsed.data;
  try {
    if (parsed.data.id) {
      const updated = await prisma.paymentOption.updateMany({ where: { id: parsed.data.id }, data: { name, instructions, details } });
      if (updated.count === 0) return { ok: false, error: "That payment method doesn't exist any more." };
    } else {
      const last = await prisma.paymentOption.aggregate({ _max: { sortOrder: true } });
      await prisma.paymentOption.create({ data: { name, instructions, details, active: active ?? true, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    }
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("[admin/payment-methods] save failed", err);
    return { ok: false, error: "The payment method couldn't be saved. Try again." };
  }
}

/** Shows or hides a method at checkout. */
export async function setPaymentOptionActive(input: { id: string; active: boolean }): Promise<PaymentResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const parsed = z.object({ id, active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    const updated = await prisma.paymentOption.updateMany({ where: { id: parsed.data.id }, data: { active: parsed.data.active } });
    if (updated.count === 0) return { ok: false, error: "That payment method doesn't exist any more." };
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("[admin/payment-methods] toggle failed", err);
    return { ok: false, error: "That change couldn't be saved. Try again." };
  }
}

/** Moves a method one place up or down in the checkout list (renumbers them all, so gaps never matter). */
export async function movePaymentOption(input: { id: string; direction: "up" | "down" }): Promise<PaymentResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const parsed = z.object({ id, direction: z.enum(["up", "down"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    await prisma.$transaction(async (tx) => {
      const all = await tx.paymentOption.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, sortOrder: true } });
      const i = all.findIndex((o) => o.id === parsed.data.id);
      const j = parsed.data.direction === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= all.length) return;
      [all[i], all[j]] = [all[j]!, all[i]!];
      for (const [index, o] of all.entries()) {
        if (o.sortOrder !== index) await tx.paymentOption.update({ where: { id: o.id }, data: { sortOrder: index } });
      }
    });
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("[admin/payment-methods] move failed", err);
    return { ok: false, error: "The order couldn't be changed. Try again." };
  }
}

/** Deletes a method. Safe for old orders: each one keeps a copy of the method's name and instructions. */
export async function deletePaymentOption(input: { id: string }): Promise<PaymentResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const parsed = z.object({ id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    await prisma.paymentOption.deleteMany({ where: { id: parsed.data.id } });
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("[admin/payment-methods] delete failed", err);
    return { ok: false, error: "The payment method couldn't be deleted. Try again." };
  }
}
