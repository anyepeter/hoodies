import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { STOCK, STYLES, type Style } from "@/lib/store";

/*
 * Live stock per style (table StyleStock). The storefront pages are static: they read this when they're
 * (re)built, and every change to stock calls revalidateStorefront() so the next visitor sees the new count.
 * Always change stock with a conditional UPDATE (see POST /api/orders), never read-then-write.
 */

/** Pieces left per style. A style with no row has none left. Falls back to store.ts if the database is down. */
export async function getStock(): Promise<Record<Style, number>> {
  try {
    const rows = await prisma.styleStock.findMany({ select: { style: true, stock: true } });
    const out = Object.fromEntries(STYLES.map((s) => [s, 0])) as Record<Style, number>;
    for (const r of rows) if ((STYLES as string[]).includes(r.style)) out[r.style as Style] = Math.max(0, r.stock);
    return out;
  } catch (err) {
    console.error("[stock] database unreachable, showing the numbers from store.ts", err);
    return { ...STOCK };
  }
}

/** The pages that show stock. */
export const STOREFRONT_PATHS = ["/", "/products/akatsukizipup-mask-hoodie", "/collections/all"] as const;

/** Call after any change to stock so the static pages are rebuilt on their next visit. */
export function revalidateStorefront(): void {
  for (const path of STOREFRONT_PATHS) revalidatePath(path);
}
