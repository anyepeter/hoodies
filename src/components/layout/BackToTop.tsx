"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { STICKY_BAR_PATH, useChatOpen } from "@/components/chat/chat-open";
import { ChevronUp } from "@/components/icons";

/**
 * Back to top: stacked just above the chat bubble, centred on it (bubble 56 px, this 40 px, 12 px apart), so the
 * bottom-right corner never has two things on top of each other. On the hoodie page both sit above the sticky
 * "Add to cart" bar. Hidden while the chat panel is open (on bigger screens the panel takes this spot).
 */
export function BackToTop() {
  const pathname = usePathname();
  const chatOpen = useChatOpen();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const visible = show && !chatOpen;
  const pos =
    pathname === STICKY_BAR_PATH
      ? "bottom-[calc(9.5rem_+_env(safe-area-inset-bottom))]"
      : "bottom-[calc(max(1rem,env(safe-area-inset-bottom))_+_4.25rem)] sm:bottom-[5.75rem]";

  return (
    <button
      type="button"
      aria-label="Back to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
      className={`fixed right-6 z-30 grid h-10 w-10 place-items-center rounded-full bg-brand text-white shadow-lg transition-all duration-300 motion-reduce:transition-none sm:right-8 ${pos} ${visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
    >
      <ChevronUp className="h-5 w-5" />
    </button>
  );
}
