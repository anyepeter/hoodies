"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { STICKY_BAR_PATH, useChatOpen } from "@/components/chat/chat-open";
import { HOODIE, money } from "@/lib/store";

/**
 * "Shop the hoodie", floating at the bottom of every page as you scroll, so the way to the product is always
 * one tap away. On the hoodie page itself the sticky "Add to cart" bar does this job instead.
 *
 * It shares the bottom of the screen with the chat bubble (bottom right) and Back to top (above the bubble):
 * on phones it sits on the left and stops short of the bubble's lane; from 640 px up it's centred. It steps
 * aside while the chat panel is open.
 */
export function FloatingShop() {
  const pathname = usePathname();
  const chatOpen = useChatOpen();
  // Hidden where it would cover what matters: the hoodie page (sticky bar), checkout and the order page.
  if (pathname === STICKY_BAR_PATH || chatOpen || pathname === "/checkout" || pathname.startsWith("/order/")) return null;

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-[5.5rem] z-30 flex justify-start pb-[max(1rem,env(safe-area-inset-bottom))] pl-4 sm:right-0 sm:justify-center sm:px-4">
      <Link
        href={`/products/${HOODIE.handle}`}
        className="floating-shop group pointer-events-auto relative flex min-w-0 max-w-full items-center gap-3 rounded-full bg-brand py-2 pl-2 pr-4 text-white shadow-[0_18px_40px_-12px_rgba(167,3,23,0.75)] transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.97] sm:pr-5"
      >
        <span className="pulse-ring absolute inset-0 rounded-full" aria-hidden />
        <Image src={HOODIE.images[0].src} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full bg-white object-cover ring-2 ring-white/40" />
        <span className="min-w-0 text-[15px] font-bold leading-tight">
          Shop the hoodie
          <span className="block truncate text-[11px] font-semibold text-white/75">
            {money(HOODIE.price)} <s className="text-white/50">{money(HOODIE.compareAt)}</s> · free shipping
          </span>
        </span>
        <span className="ml-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/15 transition-transform duration-300 group-hover:translate-x-1" aria-hidden>
          →
        </span>
      </Link>
    </div>
  );
}
