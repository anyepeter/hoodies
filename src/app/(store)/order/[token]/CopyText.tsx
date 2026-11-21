"use client";

import { useState } from "react";

/** A small "Copy" button. `value` "location" copies the current page address. */
export function CopyText({ value, label, className = "" }: { value: string; label: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value === "location" ? window.location.href : value);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1800);
  };
  return (
    <button type="button" onClick={copy} className={`inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold transition ${className}`} aria-live="polite">
      {state === "copied" ? "Copied ✓" : state === "failed" ? "Couldn't copy" : label}
    </button>
  );
}
