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
  type Bundle,
  type BundleId,
  type Size,
  type Style,
} from "@/lib/store";

type Choice = { style: Style; size: Size | null };

const saving = (b: Bundle) => HOODIE.compareAt * b.qty - b.price;

/** `stock` is the live count per style, read by the page from the database. A sold-out style can't be picked. */
export function ProductMain({ stock }: { stock: Record<Style, number> }) {
  const { add } = useCart();
  const [photo, setPhoto] = useState(0);
  const [bundleId, setBundleId] = useState<BundleId>("duo");
  const firstInStock = STYLES.find((s) => stock[s] > 0) ?? STYLES[0];
  const soldOut = STYLES.every((s) => stock[s] <= 0);
  // No size is pre-chosen: the original defaults everyone to S, which is how wrong sizes get ordered.
  const [choices, setChoices] = useState<Choice[]>(Array.from({ length: 3 }, () => ({ style: firstInStock, size: null })));
  const [stockError, setStockError] = useState<string | null>(null);
  // Paid extras start unticked (the original pre-ticks all three; EU consumer law doesn't allow that).
  const [addOns, setAddOns] = useState<Set<AddOnId>>(new Set());
  const [missingSize, setMissingSize] = useState(false);
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
    if (change.size) setMissingSize(false);
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
    if (chosen.some((c) => !c.size)) {
      setMissingSize(true);
      picker.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
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

          <div className="mt-4 flex items-center gap-3">
            <div className="flex -space-x-2">
              {RECENT_BUYERS.map((src) => (
                <Image key={src} src={src} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover ring-2 ring-white" />
              ))}
            </div>
            <p className="text-[13px] text-ink/70">
              <span className="relative mr-1.5 inline-flex h-2 w-2 align-middle">
                <span className="absolute inset-0 animate-ping rounded-full bg-brand/60" />
                <span className="relative h-2 w-2 rounded-full bg-brand" />
              </span>
              <b className="font-semibold text-ink">87+ orders</b> in the last 24h
            </p>
          </div>

          {/* Bundles */}
          <div className="mt-7 flex items-end justify-between">
            <h2 className="text-[15px] font-bold">Bundle &amp; save</h2>
            <SizeChart />
          </div>

          <div ref={picker} className="mt-3 space-y-2.5" role="radiogroup" aria-label="Bundle">
            {BUNDLES.map((b) => {
              const on = b.id === bundleId;
              return (
                <div
                  key={b.id}
                  className={`relative rounded-2xl border-2 transition-[border-color,background-color,box-shadow] duration-300 ${
                    on ? "border-brand bg-brand/[0.03] shadow-[0_10px_30px_-18px_rgba(167,3,23,0.6)]" : "border-black/10 hover:border-black/25"
                  }`}
                >
                  {(b.sticker || b.ribbon) && (
                    <span className={`absolute -top-2.5 right-4 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${b.sticker ? "bg-brand text-white" : "bg-ink text-white"}`}>
                      {b.sticker ?? "Best value"}
                    </span>
                  )}
                  <button type="button" role="radio" aria-checked={on} onClick={() => setBundleId(b.id)} className="flex w-full items-center gap-3 p-4 text-left">
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors ${on ? "border-brand" : "border-ink/30"}`}>
                      <span className={`h-2.5 w-2.5 rounded-full bg-brand transition-transform duration-300 ${on ? "scale-100" : "scale-0"}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-bold leading-tight">{b.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink/60">
                        <span className="rounded-md bg-brand/10 px-1.5 py-px font-semibold text-brand">Save {money(saving(b))}</span>
                        {b.qty > 1 && <span className="whitespace-nowrap">{money(b.price / b.qty)} each</span>}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[17px] font-bold leading-tight">{money(b.price)}</span>
                      <s className="block text-[12px] text-ink/40">{money(HOODIE.compareAt * b.qty)}</s>
                    </span>
                  </button>

                  <div inert={!on} className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="overflow-hidden">
                      <div className="space-y-4 border-t border-brand/10 px-4 pb-4 pt-3">
                        {choices.slice(0, b.qty).map((c, i) => (
                            <fieldset key={i} className="min-w-0 space-y-2">
                              <legend className="mb-2 text-[12px] font-semibold text-ink/60">
                                {b.qty > 1 ? `Hoodie ${i + 1}` : "Your hoodie"} · <span className="text-ink">{c.style}</span>
                                {c.size && <span className="text-ink">, {c.size}</span>}
                                <span className="ml-1.5 font-bold text-brand">· {stock[c.style] > 0 ? `Only ${stock[c.style]} left` : "Sold out"}</span>
                              </legend>
                              <div className="flex gap-2">
                                {STYLES.map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    aria-pressed={c.style === s}
                                    disabled={stock[s] <= 0}
                                    onClick={() => choose(i, { style: s })}
                                    className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${
                                      c.style === s ? "border-ink bg-ink text-white" : "border-black/15 hover:border-black/40 disabled:hover:border-black/15"
                                    }`}
                                  >
                                    <Image src={STYLE_IMAGE[s]} alt="" width={28} height={28} className={`h-7 w-7 rounded-full object-cover ${stock[s] <= 0 ? "grayscale" : ""}`} />
                                    {s}
                                    <span className={`text-[11px] font-semibold ${c.style === s ? "text-white/70" : stock[s] <= 0 ? "text-ink/60" : "text-brand"}`}>
                                      {stock[s] > 0 ? `${stock[s]} left` : "Sold out"}
                                    </span>
                                  </button>
                                ))}
                              </div>
                              <div className="grid grid-cols-5 gap-1.5">
                                {SIZES.map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    aria-pressed={c.size === s}
                                    aria-label={`Size ${s} for hoodie ${i + 1}`}
                                    onClick={() => choose(i, { size: s })}
                                    className={`h-10 rounded-xl border text-[13px] font-semibold transition active:scale-95 ${
                                      c.size === s
                                        ? "border-brand bg-brand text-white"
                                        : missingSize && !c.size
                                          ? "border-brand/50 bg-white text-ink"
                                          : "border-black/15 bg-white hover:border-black/40"
                                    }`}
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </fieldset>
                          ))}
                        {missingSize && on && (
                          <p className="text-[13px] font-semibold text-brand" role="alert">
                            Pick a size for {bundle.qty > 1 ? "each hoodie" : "your hoodie"} first.
                          </p>
                        )}
                        {stockError && on && (
                          <p className="text-[13px] font-semibold text-brand" role="alert">
                            {stockError}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Opt-in extras */}
          <fieldset className="mt-5 min-w-0">
            <legend className="text-[13px] font-bold">Add to your order</legend>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {ADD_ONS.map((a) => {
                const on = addOns.has(a.id);
                return (
                  <label
                    key={a.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 pr-3 transition ${on ? "border-brand bg-brand/[0.04]" : "border-black/10 hover:border-black/25"}`}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggleAddOn(a.id)} className="check" />
                    <Image src={a.image} alt="" width={36} height={36} className="h-9 w-9 rounded-lg bg-soft object-contain p-1" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold">{a.title}</span>
                      <span className="block truncate text-[11px] text-ink/55">{a.description}</span>
                    </span>
                    <span className="text-[13px] font-semibold">+{money(a.price)}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <button
            ref={buyButton}
            type="button"
            disabled={soldOut}
            onClick={(e) => addToCart(e.currentTarget)}
            className="btn-brand group relative mt-5 h-14 w-full overflow-hidden rounded-2xl text-[16px] shadow-[0_14px_30px_-14px_rgba(167,3,23,0.8)] disabled:cursor-not-allowed disabled:bg-ink/30 disabled:shadow-none disabled:active:scale-100"
          >
            <span className={`flex items-center gap-2 transition-all duration-300 ${added ? "-translate-y-8 opacity-0" : ""}`}>
              {soldOut ? (
                "Sold out"
              ) : (
                <>
                  Add to cart <span className="opacity-60">·</span> {money(total)}
                </>
              )}
            </span>
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

