"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "@/components/icons";

/** One question that opens to its answer. The height animates via grid rows, so no measuring is needed. */
export function AccordionItem({
  question,
  children,
  icon,
  variant = "plain",
}: {
  question: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
  variant?: "plain" | "pill";
}) {
  const [open, setOpen] = useState(false);
  const pill = variant === "pill";
  return (
    <div className={pill ? "overflow-hidden rounded-2xl bg-brand text-white" : "border-b border-black/10"}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-3 text-left font-bold ${pill ? "px-5 py-3.5 text-[14px]" : "py-3 text-[15px]"}`}
      >
        {icon}
        <span className="flex-1">{question}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className={`text-[14px] leading-relaxed ${pill ? "px-5 pb-4 text-white/90" : "pb-4 text-ink/80"}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}
