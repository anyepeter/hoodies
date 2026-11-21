"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

export interface CartLine {
  /** Same key = same thing, so adding it again only bumps the quantity. */
  key: string;
  title: string;
  detail?: string;
  image: string;
  price: number;
  compareAt?: number;
  qty: number;
}

interface CartState {
  lines: CartLine[];
  count: number;
  total: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Adds and opens the drawer, after `openAfterMs` if given (so a fly-to-cart animation can land first). */
  add: (lines: Omit<CartLine, "qty">[], opts?: { openAfterMs?: number }) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
}

const CartContext = createContext<CartState | null>(null);
const STORAGE_KEY = "akz-cart";

/* The cart lives in this browser only, as a tiny store React subscribes to. The server always renders an
   empty cart; the browser fills it in right after. Storage can be blocked (private windows), so every
   access is guarded, and a change in another tab shows up here too. */
const EMPTY: CartLine[] = [];
const listeners = new Set<() => void>();
let cache: CartLine[] | null = null;

function readCart(): CartLine[] {
  if (cache) return cache;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    cache = Array.isArray(saved) ? saved : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}
function writeCart(next: CartLine[]) {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
const setLines = (fn: (prev: CartLine[]) => CartLine[]) => writeCart(fn(readCart()));

export function CartProvider({ children }: { children: ReactNode }) {
  const lines = useSyncExternalStore(subscribe, readCart, () => EMPTY);
  const [open, setOpen] = useState(false);

  // Lock the page behind an open drawer so the background doesn't scroll on phones.
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
  }, [open]);

  const add = useCallback((incoming: Omit<CartLine, "qty">[], opts?: { openAfterMs?: number }) => {
    setLines((prev) =>
      incoming.reduce<CartLine[]>(
        (next, line) =>
          next.some((l) => l.key === line.key) ? next.map((l) => (l.key === line.key ? { ...l, qty: l.qty + 1 } : l)) : [...next, { ...line, qty: 1 }],
        prev,
      ),
    );
    if (opts?.openAfterMs) setTimeout(() => setOpen(true), opts.openAfterMs);
    else setOpen(true);
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setLines((prev) => (qty <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, qty } : l))));
  }, []);
  const remove = useCallback((key: string) => setLines((prev) => prev.filter((l) => l.key !== key)), []);

  const value = useMemo<CartState>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.qty, 0),
      total: lines.reduce((n, l) => n + l.qty * l.price, 0),
      open,
      setOpen,
      add,
      setQty,
      remove,
    }),
    [lines, open, add, setQty, remove],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
