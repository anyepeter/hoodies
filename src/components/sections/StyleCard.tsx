"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { CloseIcon } from "@/components/icons";
import { flyToCart } from "@/lib/fly-to-cart";
import { HOODIE, SIZES, STOCK, STYLE_IMAGE, money, type Size, type Style } from "@/lib/store";

/**
 * One style in "Two styles. One mask.": photo, pieces left, price, and Add to cart. Add to cart opens the
 * sizes right on the card; tapping a size puts that hoodie in the cart (and the cart opens).
 */
export function StyleCard({ style, text, front, back, priority = false }: { style: Style; text: string; front: string; back: string; priority?: boolean }) {
  const { add } = useCart();
  const [picking, setPicking] = useState(false);
  const href = `/products/${HOODIE.handle}`;

  const addSize = (size: Size, from: HTMLElement) => {
    const detail = `${style} / ${size}`;
    const flight = flyToCart(from, STYLE_IMAGE[style]);
    // Same key as a Solo Hoodie from the product page, so the two merge in the cart.
    add([{ key: `bundle:solo:${detail}`, title: HOODIE.title, detail, image: STYLE_IMAGE[style], price: HOODIE.price, compareAt: HOODIE.compareAt }], { openAfterMs: flight + 250 });
    setPicking(false);
  };

  return (
    <article className="group">
      <Link href={href} className="relative block aspect-square overflow-hidden rounded-3xl bg-soft" aria-label={`${style} Mask Hoodie, view details`}>
        <Image src={front} alt={`${style} Mask Hoodie`} fill sizes="(min-width: 768px) 50vw, 100vw" priority={priority} className="object-cover transition duration-700 group-hover:scale-105 group-hover:opacity-0" />
        <Image src={back} alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="scale-105 object-cover opacity-0 transition duration-700 group-hover:scale-100 group-hover:opacity-100" />
        <span className="absolute left-4 top-4 rounded-full bg-brand px-3 py-1 text-[12px] font-bold text-white">Save 28%</span>
        <span className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[12px] font-bold text-ink shadow-sm backdrop-blur">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-brand/60" />
            <span className="relative h-2 w-2 rounded-full bg-brand" />
          </span>
          Only {STOCK[style]} left
        </span>
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[20px] font-bold tracking-tight">{style}</h3>
          <p className="text-[14px] text-ink/60">{text}</p>
        </div>
        <p className="text-right text-[15px]">
          <b className="text-brand">{money(HOODIE.price)}</b>
          <s className="block text-[12px] text-ink/40">{money(HOODIE.compareAt)}</s>
        </p>
      </div>

      {/* Add to cart → pick a size, right here */}
      <div className="mt-4">
        <div className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${picking ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="overflow-hidden" inert={!picking}>
            <div className="mb-3 rounded-2xl bg-soft p-3">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold">Pick your size · {style}</p>
                <button type="button" onClick={() => setPicking(false)} className="grid h-8 w-8 place-items-center rounded-full transition hover:bg-black/5" aria-label="Close sizes">
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-5 gap-1.5">
                {SIZES.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    onClick={(e) => addSize(s, e.currentTarget)}
                    aria-label={`Add ${style} size ${s} to cart`}
                    className={`h-11 rounded-xl border border-black/15 bg-white text-[14px] font-semibold transition hover:border-brand hover:bg-brand hover:text-white active:scale-95 ${picking ? "size-pop" : ""}`}
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button
            type="button"
            onClick={() => setPicking((p) => !p)}
            aria-expanded={picking}
            className="btn-brand group/btn relative h-12 overflow-hidden rounded-2xl text-[15px]"
          >
            {picking ? "Choose a size above" : `Add to cart · ${money(HOODIE.price)}`}
            <span className="shine" aria-hidden />
          </button>
          <Link href={href} className="inline-flex h-12 items-center rounded-2xl border border-black/15 px-4 text-[14px] font-semibold transition hover:border-ink">
            Details
          </Link>
        </div>
      </div>
    </article>
  );
}
