"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { Stars } from "@/components/icons";
import { PaymentIcons } from "@/components/PaymentIcons";
import { DeliveryTimeline } from "@/components/product/DeliveryTimeline";
import { Gallery } from "@/components/product/Gallery";
import { SizeChart } from "@/components/product/SizeChart";
import {
  ADD_ONS,
  BUNDLES,
  HOODIE,
  PRODUCT_REVIEW,
  RECENT_BUYERS,
  SIZES,
  STYLE_IMAGE,
  STYLES,
  money,
  type AddOnId,
  type BundleId,
  type Size,
  type Style,
} from "@/lib/store";

type Choice = { style: Style; size: Size };

export function ProductMain() {
  const { add } = useCart();
  const [photo, setPhoto] = useState(0);
  const [bundleId, setBundleId] = useState<BundleId>("duo");
  const [picks, setPicks] = useState<Choice[]>(Array.from({ length: 3 }, () => ({ style: "Akatsuki", size: "S" })));
  // The original ticks every add-on in advance.
  const [addOns, setAddOns] = useState<Set<AddOnId>>(new Set(ADD_ONS.map((a) => a.id)));
  const [showSticky, setShowSticky] = useState(false);
  const buyButton = useRef<HTMLButtonElement>(null);

  const bundle = BUNDLES.find((b) => b.id === bundleId)!;

  // The bottom bar takes over once the real button has scrolled up out of sight. A scroll listener rather
  // than an IntersectionObserver: jumping straight past the button (back-to-top) never "intersects" it.
  useEffect(() => {
    const el = buyButton.current;
    if (!el) return;
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setShowSticky(el.getBoundingClientRect().bottom < 0));
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  const setPick = (i: number, change: Partial<Choice>) => {
    setPicks((prev) => prev.map((p, j) => (j === i ? { ...p, ...change } : p)));
    if (change.style) setPhoto(HOODIE.images.findIndex((img) => img.style === change.style));
  };

  const toggleAddOn = (id: AddOnId) =>
    setAddOns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addToCart = () => {
    const chosen = picks.slice(0, bundle.qty);
    const detail = chosen.map((p) => `${p.style} / ${p.size}`).join(", ");
    add([
      {
        key: `bundle:${bundle.id}:${detail}`,
        title: bundle.qty === 1 ? HOODIE.title : `${HOODIE.title} - ${bundle.title}`,
        detail,
        image: STYLE_IMAGE[chosen[0].style],
        price: bundle.price,
        compareAt: HOODIE.compareAt * bundle.qty,
      },
      ...ADD_ONS.filter((a) => addOns.has(a.id)).map((a) => ({ key: `addon:${a.id}`, title: a.title, image: a.image, price: a.price })),
    ]);
  };

  return (
    <>
      <section className="mx-auto grid max-w-[1400px] gap-6 px-4 pt-4 md:grid-cols-2 md:gap-12 md:px-12 md:pt-10">
        <div className="md:sticky md:top-28 md:self-start">
          <Gallery images={HOODIE.images} active={photo} onChange={setPhoto} />
        </div>

        <div className="min-w-0">
          <h1 className="text-[29px] font-bold leading-tight md:text-[36px]">{HOODIE.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
            <Stars className="h-3 w-3" />
            <span>Rated 4.9/5 | by over 300 satisfied customers</span>
          </p>

          <ul className="mt-4 space-y-2.5 text-[14px]">
            {HOODIE.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>

          <div className="mt-4 flex items-center">
            <div className="flex -space-x-2.5">
              {RECENT_BUYERS.map((src) => (
                <span key={src} className="relative">
                  <Image src={src} alt="" width={36} height={36} className="h-9 w-9 rounded-full border-2 border-white object-cover" />
                  <span className="absolute -left-0.5 -top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-brand text-[8px] text-white">✓</span>
                </span>
              ))}
            </div>
            <span className="-ml-1 rounded-r-full rounded-l-md bg-brand py-1 pl-4 pr-4 leading-tight text-white">
              <span className="block text-[13px] font-bold">87+ orders</span>
              <span className="block text-[10px]">in the last 24h</span>
            </span>
          </div>

          <div className="mt-4">
            <SizeChart />
          </div>

          <div className="mt-4 flex items-center gap-3 text-[12px] font-bold">
            <span className="h-px flex-1 bg-ink/40" />
            BUNDLE &amp; SAVE
            <span className="h-px flex-1 bg-ink/40" />
          </div>

          <div className="mt-3 space-y-3" role="radiogroup" aria-label="Bundle">
            {BUNDLES.map((b) => {
              const on = b.id === bundleId;
              return (
                <div
                  key={b.id}
                  className={`relative rounded-lg border transition-colors ${on ? "border-2 border-brand" : "border-black/15 hover:border-black/30"}`}
                >
                  {b.ribbon && (
                    <span className="ribbon absolute -top-2.5 right-3 bg-brand px-3 py-0.5 text-[10px] font-bold text-white">{b.ribbon}</span>
                  )}
                  {b.sticker && (
                    <span className="sticker absolute -right-2 -top-4 z-10 rotate-[8deg] rounded-full bg-brand px-3 py-1 text-center font-script text-[15px] leading-[0.9] text-white shadow">
                      Most
                      <br />
                      Popular
                    </span>
                  )}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setBundleId(b.id)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left"
                  >
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${on ? "border-brand" : "border-ink/40"}`}>
                      {on && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[17px] font-bold">{b.title}</span>
                        <span className="rounded bg-brand px-1.5 py-0.5 text-[9px] font-bold text-white">FREE SHIPPING</span>
                      </span>
                      <span className="block text-[12px] italic text-ink/75">{b.saving}</span>
                    </span>
                    <span className="text-[17px] font-bold">{money(b.price)}</span>
                  </button>

                  {on && (
                    <div className="pb-1">
                      <p className="px-3 text-[10px] font-semibold text-ink/75">Style, Size</p>
                      <div className="space-y-2 px-3 pb-3 pt-1">
                        {picks.slice(0, b.qty).map((p, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Image src={STYLE_IMAGE[p.style]} alt="" width={36} height={36} className="h-9 w-9 rounded object-cover" />
                            <select
                              aria-label={`Style for hoodie ${i + 1}`}
                              value={p.style}
                              onChange={(e) => setPick(i, { style: e.target.value as Style })}
                              className="select h-8 rounded border border-black/20 bg-white pl-2 pr-6 text-[13px]"
                            >
                              {STYLES.map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                            <select
                              aria-label={`Size for hoodie ${i + 1}`}
                              value={p.size}
                              onChange={(e) => setPick(i, { size: e.target.value as Size })}
                              className="select h-8 rounded border border-black/20 bg-white pl-2 pr-6 text-[13px]"
                            >
                              {SIZES.map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                      <ul className="divide-y divide-brand/15 overflow-hidden rounded-b-md bg-brand/15">
                        {ADD_ONS.map((a) => (
                          <li key={a.id}>
                            <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                              <input type="checkbox" checked={addOns.has(a.id)} onChange={() => toggleAddOn(a.id)} className="check" />
                              <Image src={a.image} alt="" width={28} height={28} className="h-7 w-7 rounded bg-white object-contain" />
                              <span className="flex-1 text-[12px] font-bold">{a.label}</span>
                              <span className="text-[12px] font-bold">{money(a.price)}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button ref={buyButton} type="button" onClick={addToCart} className="btn-brand mt-5 h-[50px] w-full text-[18px] uppercase tracking-wide">
            Add to cart
          </button>

          <PaymentIcons className="mt-5" />

          <div className="mt-7">
            <DeliveryTimeline />
          </div>

          <figure className="mt-7 flex gap-3">
            <Image src={PRODUCT_REVIEW.avatar} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-full object-cover" />
            <div className="flex-1 border-b border-black/10 pb-3">
              <blockquote className="text-[14px] leading-snug">{PRODUCT_REVIEW.text}</blockquote>
              <figcaption className="mt-1 flex items-center gap-2 text-[12px] italic text-ink/60">
                {PRODUCT_REVIEW.name} <Stars className="h-3 w-3" />
              </figcaption>
            </div>
          </figure>
        </div>
      </section>

      {/* Sticky add-to-cart bar */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-black/10 bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.08)] transition-[translate,visibility] duration-300 ${showSticky ? "visible translate-y-0" : "invisible translate-y-full"}`}
        aria-hidden={!showSticky}
      >
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 md:px-12">
          <Image src={STYLE_IMAGE.Akatsuki} alt="" width={48} height={48} className="hidden h-12 w-12 rounded-md object-cover md:block" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold">{HOODIE.title}</p>
            <p className="text-[14px]">
              <span className="font-bold text-brand">{money(HOODIE.price)}</span> <s className="font-semibold text-ink/60">{money(HOODIE.compareAt)}</s>
            </p>
          </div>
          <button type="button" onClick={addToCart} tabIndex={showSticky ? 0 : -1} className="btn-brand h-11 px-6 text-[16px]">
            Add to cart
          </button>
        </div>
      </div>
    </>
  );
}
