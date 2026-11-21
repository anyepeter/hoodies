"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { CloseIcon, MinusIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { money } from "@/lib/store";

const RESERVE_SECONDS = 10 * 60;

/** "Cart reserved for 09:59", as the original shows. Starts when something is first added. */
function useReservation(active: boolean) {
  const [left, setLeft] = useState(RESERVE_SECONDS);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setLeft((s) => (s <= 1 ? RESERVE_SECONDS : s - 1)), 1000);
    return () => clearInterval(id);
  }, [active]);
  return `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
}

export function CartDrawer() {
  const { lines, count, total, open, setOpen, setQty, remove } = useCart();
  const reserved = useReservation(count > 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} onClick={() => setOpen(false)} />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-[400px] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
        role="dialog"
        aria-label="Your cart"
      >
        {count === 0 ? (
          <div className="relative flex flex-1 flex-col items-center justify-center px-8 text-center">
            <button type="button" className="absolute right-4 top-4 p-2" aria-label="Close" onClick={() => setOpen(false)}>
              <CloseIcon className="h-5 w-5" />
            </button>
            <h2 className="text-[26px] font-bold">Your cart is empty</h2>
            <button type="button" onClick={() => setOpen(false)} className="btn-brand mt-6 w-full max-w-xs">
              Continue shopping
            </button>
            <p className="mt-10 text-[17px] font-semibold">Have an account?</p>
            <p className="mt-1 text-sm text-ink/75">
              <span className="underline">Log in</span> to check out faster.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
              <h2 className="text-lg font-bold">
                Cart • {count} {count === 1 ? "Item" : "Items"}
              </h2>
              <button type="button" className="p-2" aria-label="Close" onClick={() => setOpen(false)}>
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <p className="bg-brand/10 py-2 text-center text-sm font-semibold text-brand">
              Cart reserved for <span className="tabular-nums">{reserved}</span>
            </p>
            <ul className="flex-1 divide-y divide-black/5 overflow-y-auto px-5">
              {lines.map((line) => (
                <li key={line.key} className="flex gap-4 py-4">
                  <Image src={line.image} alt="" width={80} height={80} className="h-20 w-20 shrink-0 rounded-lg bg-soft object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug">{line.title}</p>
                    {line.detail && <p className="mt-0.5 text-xs text-ink/60">{line.detail}</p>}
                    <p className="mt-1 text-sm">
                      <span className="font-semibold text-brand">{money(line.price)}</span>
                      {line.compareAt && <s className="ml-2 text-xs text-ink/50">{money(line.compareAt)}</s>}
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex items-center rounded-md border border-black/15">
                        <button type="button" className="p-2" aria-label="Decrease quantity" onClick={() => setQty(line.key, line.qty - 1)}>
                          <MinusIcon className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm tabular-nums">{line.qty}</span>
                        <button type="button" className="p-2" aria-label="Increase quantity" onClick={() => setQty(line.key, line.qty + 1)}>
                          <PlusIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button type="button" className="p-1 text-ink/50 hover:text-ink" aria-label={`Remove ${line.title}`} onClick={() => remove(line.key)}>
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-black/10 px-5 pb-6 pt-4">
              <div className="flex items-center justify-between text-base">
                <span className="font-semibold">Total amount</span>
                <span className="font-bold">{money(total)}</span>
              </div>
              <p className="mt-1 text-xs text-ink/60">Taxes included. Discounts and shipping calculated at checkout.</p>
              <Link href="/checkout" onClick={() => setOpen(false)} className="btn-brand mt-4 w-full">
                Check out
              </Link>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
