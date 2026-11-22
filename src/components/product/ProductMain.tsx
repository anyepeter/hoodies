"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { Stars } from "@/components/icons";
import { PaymentIcons } from "@/components/PaymentIcons";
import { DeliveryTimeline } from "@/components/product/DeliveryTimeline";
import { Gallery } from "@/components/product/Gallery";
import { Perks } from "@/components/product/Perks";
import { SizeChart } from "@/components/product/SizeChart";
import { flyToCart } from "@/lib/fly-to-cart";
import { scriptFont } from "@/lib/fonts";
import {
  ADD_ONS,
  BUNDLES,
  HOODIE,
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

/** `stock` is the live count per style, read by the page from the database. A sold-out style can't be picked. */
export function ProductMain({ stock }: { stock: Record<Style, number> }) {
  const { add } = useCart();
  const [photo, setPhoto] = useState(0);
  const [bundleId, setBundleId] = useState<BundleId>("duo");
  const firstInStock = STYLES.find((s) => stock[s] > 0) ?? STYLES[0];
  const soldOut = STYLES.every((s) => stock[s] <= 0);
  // Style and size are dropdowns that start on the first style in stock and S, as on the original.
  const [choices, setChoices] = useState<Choice[]>(Array.from({ length: 3 }, () => ({ style: firstInStock, size: "S" })));
  const [stockError, setStockError] = useState<string | null>(null);
  // Every extra starts ticked, as on the original: it goes into the order unless the shopper unticks it.
  const [addOns, setAddOns] = useState<Set<AddOnId>>(() => new Set(ADD_ONS.map((a) => a.id)));
  const [added, setAdded] = useState(false);
  const [showSticky, setShowSticky] = useState(false);
  const buyButton = useRef<HTMLButtonElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const fromCard = useRef(false);

  const bundle = BUNDLES.find((b) => b.id === bundleId)!;
  const chosen = choices.slice(0, bundle.qty);
  const extras = ADD_ONS.filter((a) => addOns.has(a.id));
  const total = bundle.price + extras.reduce((n, a) => n + a.price, 0);

  // Arriving from a home-page style card (?style=Shinobi): that style for every hoodie, and the packs in view.
  // Read after mount because the page itself is static. A sold-out style is ignored (the default stays).
  useEffect(() => {
    if (fromCard.current) return;
    fromCard.current = true;
    const wanted = new URLSearchParams(window.location.search).get("style");
    const style = STYLES.find((s) => s === wanted);
    if (!style || stock[style] <= 0) return;
    // Next frame, then scroll once it has rendered. Not cancelled on cleanup: the ref above already makes this
    // run once, even when React mounts twice in development.
    requestAnimationFrame(() => {
      setChoices((prev) => prev.map((c) => ({ ...c, style })));
      setPhoto(Math.max(0, HOODIE.images.findIndex((img) => img.style === style)));
      requestAnimationFrame(() => picker.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    });
  }, [stock]);

  // The bottom bar takes over once the real button has scrolled up out of sight.
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

  const choose = (i: number, change: Partial<Choice>) => {
    setChoices((prev) => prev.map((c, j) => (j === i ? { ...c, ...change } : c)));
    setStockError(null);
    if (change.style) setPhoto(HOODIE.images.findIndex((img) => img.style === change.style));
  };

  const toggleAddOn = (id: AddOnId) =>
    setAddOns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addToCart = (from: HTMLElement | null) => {
    if (soldOut) return;
    // A pack can't hold more of a style than there are left (the server checks again when the order is placed).
    const short = STYLES.find((s) => chosen.filter((c) => c.style === s).length > stock[s]);
    if (short) {
      setStockError(stock[short] <= 0 ? `${short} is sold out. Pick the other style.` : `Only ${stock[short]} ${short} left. Pick the other style for the rest.`);
      picker.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const detail = chosen.map((c) => `${c.style} / ${c.size}`).join(", ");
    const image = STYLE_IMAGE[chosen[0].style];
    const flight = from ? flyToCart(from, image) : 0;
    add(
      [
        {
          key: `bundle:${bundle.id}:${detail}`,
          title: bundle.qty === 1 ? HOODIE.title : `${HOODIE.title} · ${bundle.title}`,
          detail,
          image,
          price: bundle.price,
          compareAt: HOODIE.compareAt * bundle.qty,
        },
        ...extras.map((a) => ({ key: `addon:${a.id}`, title: a.title, image: a.image, price: a.price })),
      ],
      { openAfterMs: flight + 250 },
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  return (
    <>
      <section className="mx-auto grid max-w-[1400px] gap-6 px-4 pt-3 md:grid-cols-[1.1fr_1fr] md:gap-14 md:px-12 md:pt-8">
        <div className="md:sticky md:top-24 md:self-start">
          <Gallery images={HOODIE.images} active={photo} onChange={setPhoto} />
        </div>

        <div className="min-w-0 md:pt-2">
          <a href="#reviews" className="inline-flex items-center gap-2 text-[12px] font-medium text-ink/70 transition hover:text-ink">
            <Stars className="h-3.5 w-3.5" />
            <span>
              <b className="font-semibold text-ink">4.9/5</b> · over 300 satisfied customers
            </span>
          </a>
          <h1 className="mt-2 text-balance text-[32px] font-bold leading-[1.05] tracking-tight md:text-[44px]">{HOODIE.title}</h1>

          <p className="mt-3 flex items-baseline gap-3">
            <span className="text-[26px] font-bold text-brand">{money(HOODIE.price)}</span>
            <s className="text-[16px] text-ink/45">{money(HOODIE.compareAt)}</s>
            <span className="rounded-md bg-brand/10 px-2 py-0.5 text-[12px] font-bold text-brand">Save 28%</span>
          </p>

          <ul className="mt-4 grid gap-1.5 text-[14px] text-ink/80">
            {HOODIE.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>

          <div className="mt-5 flex items-center">
            <div className="relative z-10 flex -space-x-2.5">
              {RECENT_BUYERS.map((src) => (
                <span key={src} className="relative">
                  <Image src={src} alt="" width={40} height={40} className="h-10 w-10 rounded-full border-2 border-white object-cover" />
                  <span className="absolute -left-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-brand text-[9px] font-bold text-white ring-2 ring-white" aria-hidden>
                    ✓
                  </span>
                </span>
              ))}
            </div>
            <p className="-ml-3 rounded-full bg-brand py-1 pl-6 pr-5 leading-tight tracking-wide text-white">
              <b className="block text-[14px] font-bold">87+ orders</b>
              <span className="block text-[11px]">in the last 24h</span>
            </p>
          </div>

          <div className="mt-5">
            <SizeChart />
          </div>

          {/* Bundles, laid out like the original: the open pack holds its style/size pickers and the extras. */}
          <div className="mt-5 flex items-center gap-3 text-[13px] font-bold tracking-wide text-ink">
            <span className="h-px flex-1 bg-ink/25" />
            BUNDLE &amp; SAVE
            <span className="h-px flex-1 bg-ink/25" />
          </div>

          <div ref={picker} className="mt-4 space-y-3" role="radiogroup" aria-label="Bundle">
            {BUNDLES.map((b) => {
              const on = b.id === bundleId;
              return (
                <div
                  key={b.id}
                  className={`relative rounded-lg border bg-white transition-[border-color,box-shadow] duration-200 ${
                    on ? "border-brand ring-1 ring-brand" : "border-black/20 hover:border-black/40"
                  }`}
                >
                  {b.ribbon && (
                    <span className="ribbon-fold absolute -top-3 right-3 z-10 bg-brand px-2.5 py-1 text-[11px] font-bold leading-none tracking-wide text-white">
                      {b.ribbon}
                    </span>
                  )}
                  {b.sticker && (
                    <span className="pointer-events-none absolute -right-2 -top-6 z-10 select-none" aria-hidden>
                      <span
                        className={`${scriptFont.className} block -rotate-[9deg] rounded-[50%] bg-brand px-4 pb-2 pt-1.5 text-center text-[16px] leading-[0.95] text-white shadow-[0_6px_14px_-6px_rgba(167,3,23,0.7)]`}
                      >
                        Most
                        <br />
                        Popular
                      </span>
                      <span className="absolute -right-1 -top-1 text-[9px] text-brand">✦</span>
                      <span className="absolute -right-1 top-6 text-[7px] text-brand">✦</span>
                    </span>
                  )}
                  <button type="button" role="radio" aria-checked={on} onClick={() => setBundleId(b.id)} className="flex w-full items-center gap-3.5 px-4 py-4 text-left">
                    <span className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 transition-colors ${on ? "border-brand" : "border-ink/30"}`}>
                      <span className={`h-3 w-3 rounded-full bg-brand transition-transform duration-200 ${on ? "scale-100" : "scale-0"}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[18px] font-bold leading-tight text-ink">{b.title}</span>
                        <span className="rounded-md bg-brand px-2 py-[5px] text-[10px] font-bold uppercase leading-none tracking-wide text-white">Free shipping</span>
                      </span>
                      <span className="mt-1 block text-[13px] italic text-ink/70">{b.saving}</span>
                    </span>
                    <span className="shrink-0 text-[18px] font-bold text-ink">{money(b.price)}</span>
                  </button>

                  <div inert={!on} className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="overflow-hidden">
                      <div className="px-4 pb-3">
                        <p className="text-[12px] text-ink/70">Style, Size</p>
                        <div className="mt-1.5 space-y-2">
                          {choices.slice(0, b.qty).map((c, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <Image src={STYLE_IMAGE[c.style]} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-md border border-black/10 object-cover" />
                              <select
                                aria-label={`Style for hoodie ${i + 1}`}
                                value={c.style}
                                onChange={(e) => choose(i, { style: e.target.value as Style })}
                                className="select h-9 cursor-pointer rounded-md border border-black/25 bg-white pl-2.5 pr-7 text-[14px] text-ink"
                              >
                                {STYLES.map((s) => (
                                  <option key={s} value={s} disabled={stock[s] <= 0}>
                                    {stock[s] <= 0 ? `${s} (sold out)` : s}
                                  </option>
                                ))}
                              </select>
                              <select
                                aria-label={`Size for hoodie ${i + 1}`}
                                value={c.size}
                                onChange={(e) => choose(i, { size: e.target.value as Size })}
                                className="select h-9 cursor-pointer rounded-md border border-black/25 bg-white pl-2.5 pr-7 text-[14px] text-ink"
                              >
                                {SIZES.map((s) => (
                                  <option key={s}>{s}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                        {stockError && on && (
                          <p className="mt-2 text-[13px] font-semibold text-brand" role="alert">
                            {stockError}
                          </p>
                        )}
                      </div>
                      <ul className="divide-y divide-white/60 rounded-b-[7px] bg-brand/20">
                        {ADD_ONS.map((a) => (
                          <li key={a.id}>
                            <label className="flex cursor-pointer items-center gap-3 px-2.5 py-2">
                              <input type="checkbox" checked={addOns.has(a.id)} onChange={() => toggleAddOn(a.id)} className="check" />
                              <Image src={a.image} alt="" width={30} height={30} className="h-[30px] w-[30px] rounded bg-white object-contain p-0.5" />
                              <span className="flex-1 text-[13px] font-bold text-ink">{a.label}</span>
                              <span className="text-[13px] font-bold text-ink">{money(a.price)}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            ref={buyButton}
            type="button"
            disabled={soldOut}
            onClick={(e) => addToCart(e.currentTarget)}
            className="btn-brand group relative mt-5 h-[54px] w-full overflow-hidden rounded-md text-[18px] uppercase tracking-wide disabled:cursor-not-allowed disabled:bg-ink/30 disabled:active:scale-100"
          >
            <span className={`transition-all duration-300 ${added ? "-translate-y-8 opacity-0" : ""}`}>{soldOut ? "Sold out" : "Add to cart"}</span>
            <span className={`absolute inset-0 grid place-items-center transition-all duration-300 ${added ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`} aria-hidden={!added}>
              Added to your cart ✓
            </span>
            <span className="shine" aria-hidden />
          </button>

          <Perks className="mt-5" />
          <PaymentIcons className="mt-5" />

          <div className="mt-7 rounded-2xl bg-soft px-4 py-5">
            <DeliveryTimeline />
          </div>
        </div>
      </section>

      {/* Sticky add-to-cart bar */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-black/5 bg-white/90 shadow-[0_-8px_30px_-12px_rgba(18,18,18,0.25)] backdrop-blur-xl transition-[translate,visibility] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${
          showSticky ? "visible translate-y-0" : "invisible translate-y-full"
        }`}
      >
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-12">
          <Image src={STYLE_IMAGE[chosen[0].style]} alt="" width={44} height={44} className="h-11 w-11 rounded-xl object-cover" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[14px] font-semibold">{bundle.title}</p>
            <p className="text-[13px]">
              <span className="font-bold text-brand">{money(total)}</span> <s className="text-ink/40">{money(HOODIE.compareAt * bundle.qty + extras.reduce((n, a) => n + a.price, 0))}</s>
            </p>
          </div>
          <button
            type="button"
            disabled={soldOut}
            onClick={(e) => addToCart(e.currentTarget)}
            tabIndex={showSticky ? 0 : -1}
            className="btn-brand h-11 rounded-xl px-5 text-[14px] disabled:cursor-not-allowed disabled:bg-ink/30"
          >
            {soldOut ? "Sold out" : "Add to cart"}
          </button>
        </div>
      </div>
    </>
  );
}

