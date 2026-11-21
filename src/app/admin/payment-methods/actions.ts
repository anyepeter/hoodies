"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/db";
import { MAX_DISCOUNT_RATE, PAYMENT_KEYS } from "@/lib/orders/payment-rails";

export type PaymentField = "name" | "key" | "detail" | "discountPercent" | "details" | "instructions";
export type PaymentResult = { ok: true } | { ok: false; error: string; fieldErrors?: Partial<Record<PaymentField, string>> };

const FIELDS: PaymentField[] = ["name", "key", "detail", "discountPercent", "details", "instructions"];

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
const KEYS = PAYMENT_KEYS.map((k) => k.key) as [string, ...string[]];
const MAX_PERCENT = Math.round(MAX_DISCOUNT_RATE * 100);

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((v) => (v ? v : null));

const SaveInput = z.object({
  id: id.optional(),
  name: z.string().trim().min(1, "Give the method a name, like “Cash App”.").max(60, "Keep the name under 60 characters."),
  /** Which logo it shows. "" = Other (a plain badge). */
  key: z
    .union([z.enum(KEYS), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  detail: optionalText(140, "Keep the short line under 140 characters."),
  discountPercent: z
    .number({ invalid_type_error: `Enter a whole number from 0 to ${MAX_PERCENT}.` })
    .int(`Enter a whole number from 0 to ${MAX_PERCENT}.`)
    .min(0, `Enter a whole number from 0 to ${MAX_PERCENT}.`)
    .max(MAX_PERCENT, `At most ${MAX_PERCENT}% off.`),
  details: optionalText(2000, "Keep the payment details under 2,000 characters."),
  instructions: z.string().trim().min(1, "Write the message the shopper gets in the chat.").max(2000, "Keep the message under 2,000 characters."),
  active: z.boolean(),
});

export type PaymentInput = z.input<typeof SaveInput>;

const keyLabel = (key: string) => PAYMENT_KEYS.find((k) => k.key === key)?.label ?? key;

/** Creates a payment method, or edits one (orders already placed keep their own copy of the message). */
export async function savePaymentOption(input: PaymentInput): Promise<PaymentResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<PaymentField, string>> = {};
    for (const issue of parsed.error.issues) {
      const f = issue.path[0] as PaymentField;
      if (FIELDS.includes(f) && !fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return { ok: false, error: "Fix the fields marked in red.", fieldErrors };
  }
  const { name, key, detail, discountPercent, details, instructions, active } = parsed.data;
  const optionId = parsed.data.id;

  // One method per logo: the key is what the checkout, invoice and chat know a rail by.
  const taken = (other: string) => ({
    ok: false as const,
    error: "Fix the fields marked in red.",
    fieldErrors: { key: `${other} already uses the ${keyLabel(key!)} logo. Pick another logo, or edit ${other} instead.` },
  });
  try {
    if (key) {
      const other = await prisma.paymentOption.findFirst({ where: { key, ...(optionId ? { NOT: { id: optionId } } : {}) }, select: { name: true } });
      if (other) return taken(other.name);
    }
    const data = { name, key, detail, discountRate: (discountPercent / 100).toFixed(3), details, instructions, active };
    if (optionId) {
      const updated = await prisma.paymentOption.updateMany({ where: { id: optionId }, data });
      if (updated.count === 0) return { ok: false, error: "That payment method doesn't exist any more." };
    } else {
      const last = await prisma.paymentOption.aggregate({ _max: { sortOrder: true } });
      await prisma.paymentOption.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    }
    revalidate();
    return { ok: true };
  } catch (err) {
    // Two tabs picking the same logo at once: the unique index has the last word.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return taken("Another method");
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

/** Deletes a method. Safe for old orders: each one keeps a copy of the method's name, logo and message. */
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
