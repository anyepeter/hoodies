"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { CloseIcon, MinusIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { ADD_ONS, HOODIE, money } from "@/lib/store";

export function CartDrawer() {
  const { lines, count, total, open, setOpen, setQty, remove, add } = useCart();
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const savings = lines.reduce((n, l) => n + (l.compareAt ? (l.compareAt - l.price) * l.qty : 0), 0);
  // Extras not in the cart yet, offered once and never pre-ticked.
  const suggestions = ADD_ONS.filter((a) => !lines.some((l) => l.key === `addon:${a.id}`));
  const hasHoodie = lines.some((l) => l.key.startsWith("bundle:"));

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open} inert={!open}>
      <div className={`absolute inset-0 bg-ink/50 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} onClick={() => setOpen(false)} />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col bg-white shadow-2xl transition-[translate,visibility] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${open ? "visible translate-x-0" : "invisible translate-x-full"}`}
        role="dialog"
        aria-modal="true"
        aria-label="Your cart"
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <h2 className="text-[20px] font-bold tracking-tight">
            Your cart {count > 0 && <span className="text-ink/40">({count})</span>}
          </h2>
          <button ref={closeButton} type="button" className="-mr-2 grid h-10 w-10 place-items-center rounded-full transition hover:bg-black/5" aria-label="Close cart" onClick={() => setOpen(false)}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {count === 0 ? (
          <div className="flex flex-1 flex-col px-5 pb-6">
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <p className="text-[22px] font-bold tracking-tight">Your cart is empty</p>
              <p className="mt-2 max-w-[260px] text-[14px] text-ink/60">The red clouds are waiting. Free worldwide shipping on every order.</p>
            </div>
            <Link href={`/products/${HOODIE.handle}`} onClick={() => setOpen(false)} className="group flex items-center gap-4 rounded-2xl bg-soft p-3">
              <Image src={HOODIE.images[0].src} alt="" width={80} height={80} className="h-20 w-20 rounded-xl object-cover" />
              <span className="flex-1">
                <span className="block text-[15px] font-semibold">{HOODIE.title}</span>
                <span className="text-[13px]">
                  <b className="text-brand">{money(HOODIE.price)}</b> <s className="text-ink/40">{money(HOODIE.compareAt)}</s>
                </span>
              </span>
              <span className="pr-2 text-ink/40 transition group-hover:translate-x-1 group-hover:text-ink">→</span>
            </Link>
          </div>
        ) : (
          <>
            <div className="mx-5 rounded-xl bg-brand/[0.06] px-4 py-2.5 text-[13px]">
              <p className="font-semibold text-brand">Free worldwide shipping unlocked ✓</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand/15">
                <div className="h-full w-full origin-left animate-[grow_0.8s_ease-out] rounded-full bg-brand" />
              </div>
            </div>

            <ul className="mt-2 flex-1 divide-y divide-black/5 overflow-y-auto px-5">
              {lines.map((line) => (
                <li key={line.key} className="flex gap-4 py-4">
                  <Image src={line.image} alt="" width={84} height={84} className="h-[84px] w-[84px] shrink-0 rounded-xl bg-soft object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[14px] font-semibold leading-snug">{line.title}</p>
                      <button type="button" className="-mr-1 -mt-1 rounded-full p-1.5 text-ink/40 transition hover:bg-black/5 hover:text-ink" aria-label={`Remove ${line.title}`} onClick={() => remove(line.key)}>
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                    {line.detail && <p className="mt-0.5 text-[12px] text-ink/55">{line.detail}</p>}
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center rounded-full bg-soft">
                        <button type="button" className="grid h-8 w-8 place-items-center rounded-full transition hover:bg-black/5" aria-label="One fewer" onClick={() => setQty(line.key, line.qty - 1)}>
                          <MinusIcon className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-6 text-center text-[13px] font-semibold tabular-nums" aria-label={`Quantity ${line.qty}`}>
                          {line.qty}
                        </span>
                        <button type="button" className="grid h-8 w-8 place-items-center rounded-full transition hover:bg-black/5" aria-label="One more" onClick={() => setQty(line.key, line.qty + 1)}>
                          <PlusIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="text-right text-[14px]">
                        <b>{money(line.price * line.qty)}</b>
                        {line.compareAt && <s className="block text-[11px] text-ink/40">{money(line.compareAt * line.qty)}</s>}
                      </p>
                    </div>
                  </div>
                </li>
              ))}

              {hasHoodie && suggestions.length > 0 && (
                <li className="py-4">
                  <p className="text-[12px] font-bold uppercase tracking-[0.15em] text-ink/50">Add to your order</p>
                  <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
                    {suggestions.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => add([{ key: `addon:${a.id}`, title: a.title, image: a.image, price: a.price }])}
                        className="flex shrink-0 items-center gap-2 rounded-xl border border-black/10 py-2 pl-2 pr-3 text-left transition hover:border-black/30 active:scale-[0.98]"
                      >
                        <Image src={a.image} alt="" width={32} height={32} className="h-8 w-8 rounded-lg bg-soft object-contain p-0.5" />
                        <span className="text-[12px] leading-tight">
                          <span className="block font-semibold">{a.title}</span>
                          <span className="text-ink/55">+{money(a.price)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </li>
              )}
            </ul>

            <div className="border-t border-black/5 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
              {savings > 0 && (
                <p className="flex justify-between text-[13px] font-semibold text-brand">
                  <span>You&apos;re saving</span>
                  <span>{money(savings)}</span>
                </p>
              )}
              <p className="mt-1 flex items-baseline justify-between">
                <span className="text-[15px] font-semibold">Total</span>
                <span className="text-[22px] font-bold tracking-tight">{money(total)}</span>
              </p>
              <p className="mt-0.5 text-[12px] text-ink/50">Taxes included. Shipping is free.</p>
              <Link href="/checkout" onClick={() => setOpen(false)} className="btn-brand mt-4 h-14 w-full rounded-2xl text-[16px]">
                Check out · {money(total)}
              </Link>
              <button type="button" onClick={() => setOpen(false)} className="mt-2 w-full py-2 text-[13px] font-semibold text-ink/60 transition hover:text-ink">
                Continue shopping
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
