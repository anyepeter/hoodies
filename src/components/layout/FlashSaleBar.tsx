"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "@/components/icons";

/** Time left until local midnight, when "the sale ends". */
function untilMidnight(now: Date) {
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const s = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
  return { days: 0, hours: Math.floor(s / 3600), mins: Math.floor((s % 3600) / 60), secs: s % 60 };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function FlashSaleBar() {
  const [left, setLeft] = useState<ReturnType<typeof untilMidnight> | null>(null);
  const [closed, setClosed] = useState(false);

  // The clock starts after hydration: the server can't know the visitor's time.
  useEffect(() => {
    const tick = () => setLeft(untilMidnight(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (closed) return null;
  const units: [string, number | null][] = [
    ["days", left?.days ?? null],
    ["hours", left?.hours ?? null],
    ["mins", left?.mins ?? null],
    ["secs", left?.secs ?? null],
  ];

  return (
    <div className="sticky top-0 z-40 bg-brand text-white">
      <div className="relative mx-auto flex max-w-[1400px] flex-col items-center px-10 py-1.5 text-center">
        <p className="text-[15px] font-bold leading-tight">FLASH SALE ENDING!</p>
        <p className="text-[10px] font-bold uppercase leading-tight">With free worldwide shipping</p>
        <div className="mt-1 flex items-center gap-1" role="timer" aria-label="Time left in the sale">
          {units.map(([label, value], i) => (
            <span key={label} className="flex items-center gap-1">
              {i > 0 && <span className="text-sm font-bold">:</span>}
              <span className="flex min-w-[27px] flex-col items-center rounded-[4px] bg-white/25 px-1 pt-0.5 leading-none">
                <span className="text-[14px] font-bold tabular-nums">{value === null ? "--" : pad(value)}</span>
                <span className="pb-0.5 text-[7px]">{label}</span>
              </span>
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setClosed(true)}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 transition-opacity hover:opacity-70"
          aria-label="Close"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
