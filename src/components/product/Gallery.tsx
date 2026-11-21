"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "@/components/icons";

export interface GalleryImage {
  src: string;
  alt: string;
}

/**
 * Swipeable product photos. On phones the next photo peeks in from the right, like the original;
 * on desktop there is a thumbnail strip under it. `goTo` lets the variant picker jump to a photo.
 */
export function Gallery({ images, active, onChange }: { images: GalleryImage[]; active: number; onChange: (i: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const scrollTo = useCallback((i: number) => {
    const el = track.current;
    const slide = el?.children[i] as HTMLElement | undefined;
    if (!el || !slide) return;
    el.scrollTo({ left: slide.offsetLeft - el.offsetLeft, behavior: "smooth" });
  }, []);

  // Outside changes (picking a style) move the carousel.
  useEffect(() => {
    if (active !== index) scrollTo(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const first = el.children[0] as HTMLElement;
    const step = first.offsetWidth + 8;
    const i = Math.min(images.length - 1, Math.max(0, Math.round(el.scrollLeft / step)));
    if (i !== index) {
      setIndex(i);
      onChange(i);
    }
  };

  return (
    <div>
      <div className="relative">
        <div
          ref={track}
          onScroll={onScroll}
          className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth"
          aria-roledescription="carousel"
        >
          {images.map((img, i) => (
            <div key={img.src} className="relative aspect-square w-[92%] shrink-0 snap-start overflow-hidden rounded-xl bg-soft md:w-full">
              <Image
                src={img.src}
                alt={img.alt}
                fill
                priority={i === 0}
                sizes="(min-width: 768px) 50vw, 92vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          aria-label="Previous photo"
          onClick={() => scrollTo(Math.max(0, index - 1))}
          className="absolute left-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white transition hover:bg-black/55 disabled:opacity-40"
          disabled={index === 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Next photo"
          onClick={() => scrollTo(Math.min(images.length - 1, index + 1))}
          className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white transition hover:bg-black/55 disabled:opacity-40"
          disabled={index === images.length - 1}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex justify-center gap-2 md:hidden">
        {images.map((img, i) => (
          <button
            key={img.src}
            type="button"
            aria-label={`Photo ${i + 1}`}
            onClick={() => scrollTo(i)}
            className={`h-1.5 w-1.5 rounded-full transition-all ${i === index ? "w-1.5 bg-ink" : "bg-ink/25"}`}
          />
        ))}
      </div>

      <div className="mt-3 hidden grid-cols-5 gap-2 md:grid">
        {images.map((img, i) => (
          <button
            key={img.src}
            type="button"
            onClick={() => scrollTo(i)}
            aria-label={`Show photo ${i + 1}`}
            className={`relative aspect-square overflow-hidden rounded-lg border-2 transition ${i === index ? "border-ink" : "border-transparent opacity-70 hover:opacity-100"}`}
          >
            <Image src={img.src} alt="" fill sizes="120px" className="object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
