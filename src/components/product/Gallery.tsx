"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CloseIcon } from "@/components/icons";

export interface GalleryImage {
  src: string;
  alt: string;
}

/**
 * Swipeable product photos with thumbnails at every size, a counter, and tap-to-zoom into a fullscreen
 * viewer. `active` lets the style swatches jump to a photo.
 */
export function Gallery({ images, active, onChange }: { images: GalleryImage[]; active: number; onChange: (i: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const viewer = useRef<HTMLDialogElement>(null);
  const viewerTrack = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const scrollTo = useCallback((i: number, el = track.current) => {
    const slide = el?.children[i] as HTMLElement | undefined;
    if (el && slide) el.scrollTo({ left: slide.offsetLeft - el.offsetLeft, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (active !== index) scrollTo(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only outside changes should move the carousel
  }, [active]);

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const step = (el.children[0] as HTMLElement).offsetWidth + 8;
    const i = Math.min(images.length - 1, Math.max(0, Math.round(el.scrollLeft / step)));
    if (i !== index) {
      setIndex(i);
      onChange(i);
    }
  };

  const openViewer = (i: number) => {
    viewer.current?.showModal();
    const el = viewerTrack.current;
    const slide = el?.children[i] as HTMLElement | undefined;
    if (el && slide) el.scrollLeft = slide.offsetLeft;
  };

  return (
    <div>
      <div className="relative">
        <div ref={track} onScroll={onScroll} className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto" aria-roledescription="carousel" aria-label="Product photos">
          {images.map((img, i) => (
            <button
              key={img.src}
              type="button"
              onClick={() => openViewer(i)}
              aria-label={`Zoom photo ${i + 1}: ${img.alt}`}
              className="group relative aspect-square w-[90%] shrink-0 cursor-zoom-in snap-center overflow-hidden rounded-2xl bg-soft md:w-full"
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                priority={i === 0}
                sizes="(min-width: 768px) 50vw, 90vw"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
              />
            </button>
          ))}
        </div>
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-ink/70 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white backdrop-blur">
          {index + 1} / {images.length}
        </span>
        <div className="pointer-events-none absolute bottom-3 right-3 hidden gap-2 md:flex">
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => scrollTo(Math.max(0, index - 1))}
            disabled={index === 0}
            className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink shadow-md backdrop-blur transition hover:scale-105 disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => scrollTo(Math.min(images.length - 1, index + 1))}
            disabled={index === images.length - 1}
            className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink shadow-md backdrop-blur transition hover:scale-105 disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto p-1">
        {images.map((img, i) => (
          <button
            key={img.src}
            type="button"
            onClick={() => scrollTo(i)}
            aria-label={`Show photo ${i + 1}`}
            aria-current={i === index}
            className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl ring-2 ring-offset-2 transition md:h-20 md:w-20 ${i === index ? "ring-ink" : "opacity-60 ring-transparent hover:opacity-100"}`}
          >
            <Image src={img.src} alt="" fill sizes="80px" className="object-cover" />
          </button>
        ))}
      </div>

      {/* Fullscreen viewer: swipe between photos, pinch to zoom on phones */}
      <dialog ref={viewer} className="viewer m-0 h-dvh max-h-none w-screen max-w-none bg-ink p-0 backdrop:bg-ink" aria-label="Photo viewer">
        <button
          type="button"
          onClick={() => viewer.current?.close()}
          className="fixed right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
          aria-label="Close photo viewer"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
        <div ref={viewerTrack} className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto">
          {images.map((img) => (
            <div key={img.src} className="relative h-full w-full shrink-0 snap-center">
              <Image src={img.src} alt={img.alt} fill sizes="100vw" className="object-contain" />
            </div>
          ))}
        </div>
      </dialog>
    </div>
  );
}
