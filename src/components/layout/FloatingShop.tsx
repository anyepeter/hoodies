"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HOODIE, money } from "@/lib/store";

/**
 * "Shop the hoodie", floating at the bottom of every page as you scroll, so the way to the product is always
 * one tap away. On the hoodie page itself the sticky "Add to cart" bar does this job instead.
 */
export function FloatingShop() {
  const pathname = usePathname();
  if (pathname === `/products/${HOODIE.handle}`) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Link
        href={`/products/${HOODIE.handle}`}
        className="floating-shop group pointer-events-auto relative flex items-center gap-3 rounded-full bg-brand py-2 pl-2 pr-5 text-white shadow-[0_18px_40px_-12px_rgba(167,3,23,0.75)] transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.97]"
      >
        <span className="pulse-ring absolute inset-0 rounded-full" aria-hidden />
        <Image src={HOODIE.images[0].src} alt="" width={40} height={40} className="h-10 w-10 rounded-full bg-white object-cover ring-2 ring-white/40" />
        <span className="text-[15px] font-bold leading-tight">
          Shop the hoodie
          <span className="block text-[11px] font-semibold text-white/75">
            {money(HOODIE.price)} <s className="text-white/50">{money(HOODIE.compareAt)}</s> · free shipping
          </span>
        </span>
        <span className="ml-1 grid h-7 w-7 place-items-center rounded-full bg-white/15 transition-transform duration-300 group-hover:translate-x-1" aria-hidden>
          →
        </span>
      </Link>
    </div>
  );
}
