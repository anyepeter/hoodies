"use client";

import { useEffect, useState } from "react";
import { ChevronUp } from "@/components/icons";

export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed bottom-[92px] right-4 z-30 grid h-10 w-10 place-items-center rounded-full bg-brand text-white shadow-lg transition-all duration-300 md:bottom-8 ${show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
    >
      <ChevronUp className="h-5 w-5" />
    </button>
  );
}
