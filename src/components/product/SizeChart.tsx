"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { CloseIcon, RulerIcon } from "@/components/icons";

export function SizeChart() {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    const close = (e: MouseEvent) => e.target === d && d?.close();
    d?.addEventListener("click", close);
    return () => d?.removeEventListener("click", close);
  }, []);
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="flex items-center gap-2 text-[15px] font-semibold">
        <RulerIcon className="h-5 w-5" />
        <span className="underline underline-offset-4">Sizing chart</span>
      </button>
      <dialog ref={dialog} className="modal m-auto w-[min(92vw,640px)] rounded-xl p-0 backdrop:bg-black/50">
        <div className="relative">
          <button type="button" onClick={() => dialog.current?.close()} className="absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90" aria-label="Close">
            <CloseIcon className="h-5 w-5" />
          </button>
          <Image src="/store/size-guide.png" alt="Size guide: chest, shoulder, sleeve and body length for S to 2XL, in inches" width={1254} height={1254} className="h-auto w-full" />
        </div>
      </dialog>
    </>
  );
}
