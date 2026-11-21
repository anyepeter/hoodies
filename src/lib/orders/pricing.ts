// Turns cart keys into priced order lines, from src/lib/store.ts only. The browser's prices are never used:
// the checkout shows these numbers and POST /api/orders recomputes them the same way, so they always agree.
// Client-safe (no server imports): the checkout page prices the cart with it too.
//
// Cart keys (set by ProductMain and AddOnBuyButton):
//   bundle:<solo|duo|squad>:<Style> / <Size>[, <Style> / <Size>...]   one pair per hoodie in the pack
//   addon:<mystery-box|shipping-protection|priority-shipping>

import { ADD_ONS, BUNDLES, HOODIE, SIZES, STYLE_IMAGE, STYLES, money, type AddOnId, type BundleId, type Size, type Style } from "@/lib/store";

export const MAX_LINES = 20;
export const MAX_QTY = 10;

export interface PricedLine {
  key: string;
  kind: "bundle" | "addon";
  sku: BundleId | AddOnId;
  title: string;
  /** Short name for summaries: "Duo Pack", "Mystery Box". */
  shortTitle: string;
  detail: string | null;
  image: string;
  quantity: number;
  unitCents: number;
  /** Full price of one unit (bundles only), for "You saved". */
  unitCompareAtCents: number | null;
  lineCents: number;
  /** The style of each hoodie in one unit of this line ([] for add-ons). */
  styles: Style[];
}

export interface PricedCart {
  lines: PricedLine[];
  /** Keys that don't match anything sold any more. */
  invalid: string[];
  subtotalCents: number;
  compareAtCents: number;
  savingCents: number;
  shippingCents: number;
  totalCents: number;
  /** Hoodies per style this cart takes from stock. */
  units: Record<Style, number>;
}

const cents = (n: number) => Math.round(n * 100);
export const fromCents = (c: number) => c / 100;
export const moneyCents = (c: number) => money(c / 100);
/** "129.97" for a Prisma Decimal column. */
export const decimal = (c: number) => (c / 100).toFixed(2);

const isStyle = (v: string): v is Style => (STYLES as string[]).includes(v);
const isSize = (v: string): v is Size => (SIZES as readonly string[]).includes(v);

/** One cart key → what it is, or null if it isn't something the store sells. */
export function parseLineKey(key: string): Omit<PricedLine, "quantity" | "lineCents"> | null {
  if (typeof key !== "string" || key.length > 300) return null;

  if (key.startsWith("addon:")) {
    const addOn = ADD_ONS.find((a) => a.id === key.slice(6));
    if (!addOn) return null;
    return {
      key,
      kind: "addon",
      sku: addOn.id,
      title: addOn.title,
      shortTitle: addOn.title,
      detail: null,
      image: addOn.image,
      unitCents: cents(addOn.price),
      unitCompareAtCents: null,
      styles: [],
    };
  }

  if (key.startsWith("bundle:")) {
    const rest = key.slice(7);
    const colon = rest.indexOf(":");
    if (colon < 0) return null;
    const bundle = BUNDLES.find((b) => b.id === rest.slice(0, colon));
    if (!bundle) return null;
    const pairs = rest
      .slice(colon + 1)
      .split(", ")
      .map((p) => p.split(" / "));
    if (pairs.length !== bundle.qty) return null;
    const picks: { style: Style; size: Size }[] = [];
    for (const pair of pairs) {
      if (pair.length !== 2) return null;
      const [style, size] = pair as [string, string];
      if (!isStyle(style) || !isSize(size)) return null;
      picks.push({ style, size });
    }
    const detail = picks.map((p) => `${p.style} / ${p.size}`).join(", ");
    return {
      key,
      kind: "bundle",
      sku: bundle.id,
      title: bundle.qty === 1 ? HOODIE.title : `${HOODIE.title} · ${bundle.title}`,
      shortTitle: bundle.title,
      detail,
      image: STYLE_IMAGE[picks[0]!.style],
      unitCents: cents(bundle.price),
      unitCompareAtCents: cents(HOODIE.compareAt) * bundle.qty,
      styles: picks.map((p) => p.style),
    };
  }

  return null;
}

/** Prices a cart. Repeated keys are merged. Quantities are taken as given (validate 1–MAX_QTY before). */
export function priceCart(input: { key: string; qty: number }[]): PricedCart {
  const merged = new Map<string, number>();
  for (const { key, qty } of input) merged.set(key, (merged.get(key) ?? 0) + qty);

  const lines: PricedLine[] = [];
  const invalid: string[] = [];
  const units = Object.fromEntries(STYLES.map((s) => [s, 0])) as Record<Style, number>;

  for (const [key, quantity] of merged) {
    const parsed = parseLineKey(key);
    if (!parsed || !Number.isInteger(quantity) || quantity < 1) {
      invalid.push(key);
      continue;
    }
    lines.push({ ...parsed, quantity, lineCents: parsed.unitCents * quantity });
    for (const style of parsed.styles) units[style] += quantity;
  }

  const subtotalCents = lines.reduce((n, l) => n + l.lineCents, 0);
  const compareAtCents = lines.reduce((n, l) => n + (l.unitCompareAtCents ?? l.unitCents) * l.quantity, 0);
  const shippingCents = 0; // free worldwide shipping
  return { lines, invalid, subtotalCents, compareAtCents, savingCents: compareAtCents - subtotalCents, shippingCents, totalCents: subtotalCents + shippingCents, units };
}

/** "Duo Pack (Akatsuki / M, Shinobi / L), Mystery Box" for notifications and lists. */
export function summarizeLines(lines: { shortTitle?: string; title: string; detail: string | null; quantity: number }[], max = 180): string {
  const text = lines.map((l) => `${l.quantity > 1 ? `${l.quantity}× ` : ""}${l.shortTitle ?? l.title}${l.detail ? ` (${l.detail})` : ""}`).join(", ");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** "1 Akatsuki, 2 Shinobi" */
export function describeUnits(units: Partial<Record<Style, number>>): string {
  return STYLES.filter((s) => (units[s] ?? 0) > 0)
    .map((s) => `${units[s]} ${s}`)
    .join(", ");
}

/** Reads an order's stockTaken JSON back into whole, non-negative numbers per style. */
export function parseStockTaken(value: unknown): Record<Style, number> {
  const out = Object.fromEntries(STYLES.map((s) => [s, 0])) as Record<Style, number>;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const s of STYLES) {
      const n = (value as Record<string, unknown>)[s];
      if (typeof n === "number" && Number.isInteger(n) && n > 0) out[s] = n;
    }
  }
  return out;
}
