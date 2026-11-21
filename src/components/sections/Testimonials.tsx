"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, QuoteIcon, Stars } from "@/components/icons";
import { TESTIMONIALS } from "@/lib/store";

/** One card at a time on phones, three side by side on desktop. Swipe, arrows or dots. */
export function Testimonials() {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const go = (i: number) => {
    const el = track.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: "smooth" });
  };
  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const w = (el.children[0] as HTMLElement).offsetWidth + 16;
    setIndex(Math.round(el.scrollLeft / w));
  };

  return (
    <div>
      <div ref={track} onScroll={onScroll} className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto">
        {TESTIMONIALS.map((t) => (
          <article key={t.name} className="flex w-full shrink-0 snap-start flex-col overflow-hidden rounded-xl bg-soft md:w-[calc((100%-2rem)/3)]">
            <div className="relative aspect-square">
              <Image src={t.image} alt={`${t.name} wearing the hoodie`} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
              <span className="absolute -bottom-6 right-5 grid h-12 w-12 place-items-center rounded-full bg-ink text-white">
                <QuoteIcon className="h-6 w-6" />
              </span>
            </div>
            <div className="flex flex-1 flex-col items-center px-5 pb-5 pt-6 text-center">
              <Stars className="h-4 w-4" />
              <h3 className="mt-1 text-[19px] font-bold">{t.title}</h3>
              <p className="mt-2 flex-1 text-[15px] leading-relaxed text-ink/80">{t.text}</p>
              <div className="mt-4 flex w-full items-center justify-center gap-2 border-t border-black/10 pt-3">
                <Image src={t.avatar} alt="" width={30} height={30} className="h-[30px] w-[30px] rounded-full object-cover" />
                <span className="text-[14px] font-bold italic">-{t.name}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-center gap-4 md:hidden">
        <button type="button" aria-label="Previous review" onClick={() => go(Math.max(0, index - 1))} className="p-1 text-ink/60 disabled:opacity-30" disabled={index === 0}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        {TESTIMONIALS.map((t, i) => (
          <button key={t.name} type="button" aria-label={`Review ${i + 1}`} onClick={() => go(i)} className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-ink" : "bg-ink/25"}`} />
        ))}
        <button
          type="button"
          aria-label="Next review"
          onClick={() => go(Math.min(TESTIMONIALS.length - 1, index + 1))}
          className="p-1 text-ink disabled:opacity-30"
          disabled={index === TESTIMONIALS.length - 1}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
