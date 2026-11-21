"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/db";
import { notifyAdmins } from "@/lib/notify";
import { revalidateStorefront } from "@/lib/stock";
import { STYLES, type Style } from "@/lib/store";

export type StockResult = { ok: true; stock: number } | { ok: false; error: string };

const MAX_STOCK = 100_000;
const style = z.enum(STYLES as [Style, ...Style[]]);

async function guard(): Promise<string | null> {
  try {
    await assertAdmin();
    return null;
  } catch {
    return "You're signed out. Sign in again and retry.";
  }
}

function afterChange() {
  revalidateStorefront();
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  notifyAdmins("badges", null); // the low-stock badge may have changed
}

const SetInput = z.object({
  style,
  stock: z
    .number({ invalid_type_error: "Enter a whole number." })
    .int("Enter a whole number.")
    .min(0, "Stock can't go below 0.")
    .max(MAX_STOCK, `At most ${MAX_STOCK.toLocaleString("en-US")}.`),
});

/** Sets a style's stock to an exact number (after a delivery, a count...). */
export async function setStock(input: { style: Style; stock: number }): Promise<StockResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const parsed = SetInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  try {
    const row = await prisma.styleStock.upsert({
      where: { style: parsed.data.style },
      update: { stock: parsed.data.stock },
      create: { style: parsed.data.style, stock: parsed.data.stock },
      select: { stock: true },
    });
    afterChange();
    return { ok: true, stock: row.stock };
  } catch (err) {
    console.error("[admin/products] set stock failed", err);
    return { ok: false, error: "Stock couldn't be saved. Try again." };
  }
}

const AdjustInput = z.object({
  style,
  delta: z
    .number()
    .int()
    .min(-MAX_STOCK)
    .max(MAX_STOCK)
    .refine((n) => n !== 0),
});

/** Adds or removes a few pieces in one atomic statement, never below 0 (safe while orders come in). */
export async function adjustStock(input: { style: Style; delta: number }): Promise<StockResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const parsed = AdjustInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { style: s, delta } = parsed.data;
  try {
    const [row] = await prisma.$queryRaw<{ stock: number }[]>`
      INSERT INTO "StyleStock" ("style", "stock", "updatedAt") VALUES (${s}, GREATEST(0, ${delta}::int), NOW())
      ON CONFLICT ("style") DO UPDATE SET "stock" = LEAST(${MAX_STOCK}::int, GREATEST(0, "StyleStock"."stock" + ${delta}::int)), "updatedAt" = NOW()
      RETURNING "stock"`;
    afterChange();
    return { ok: true, stock: row?.stock ?? 0 };
  } catch (err) {
    console.error("[admin/products] adjust stock failed", err);
    return { ok: false, error: "Stock couldn't be changed. Try again." };
  }
}
