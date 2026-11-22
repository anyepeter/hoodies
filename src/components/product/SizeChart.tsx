"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { CloseIcon, RulerIcon } from "@/components/icons";
import { SIZE_GUIDE } from "@/lib/store";

/** The "Sizing chart" link and the store's own size-guide picture it opens, as on the original. */
export function SizeChart() {
  const dialog = useRef<HTMLDialogElement>(null);

  // A tap on the dimmed backdrop closes it (the dialog itself is only the target there).
  useEffect(() => {
    const d = dialog.current;
    const close = (e: MouseEvent) => e.target === d && d?.close();
    d?.addEventListener("click", close);
    return () => d?.removeEventListener("click", close);
  }, []);

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="inline-flex items-center gap-2 text-[15px] font-semibold text-ink transition hover:text-brand">
        <RulerIcon className="h-5 w-5" />
        <span className="underline underline-offset-4">Sizing chart</span>
      </button>
      <dialog
        ref={dialog}
        aria-label="Size guide"
        className="sheet m-auto max-h-[92dvh] w-[min(94vw,640px)] overflow-auto rounded-2xl bg-white p-2.5 shadow-2xl backdrop:bg-ink/60 backdrop:backdrop-blur-sm md:p-4"
      >
        <div className="relative">
          <Image src={SIZE_GUIDE.src} alt={SIZE_GUIDE.alt} width={1254} height={1254} sizes="(min-width: 700px) 610px, 90vw" className="h-auto w-full rounded-lg" />
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full bg-white text-ink shadow-md transition hover:bg-soft"
            aria-label="Close size guide"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
      </dialog>
    </>
  );
}
