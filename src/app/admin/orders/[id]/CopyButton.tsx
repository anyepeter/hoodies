"use client";

import { useState } from "react";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("copied");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 1600);
      }}
      className="inline-flex h-7 shrink-0 items-center rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-ink"
      aria-live="polite"
    >
      {state === "copied" ? "Copied ✓" : state === "failed" ? "Couldn't copy" : label}
    </button>
  );
}
