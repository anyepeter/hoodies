"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CloseIcon } from "@/components/icons";
import { TOP_TICKER } from "@/lib/store";

/** Seconds left until local midnight, ticking once a second. The server renders "--:--:--". */
const secondsToMidnight = () => {
  const now = new Date();
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  return Math.floor((end.getTime() - now.getTime()) / 1000);
};
// React may read the snapshot several times per render, so it's cached and only the interval moves it.
let snapshot: number | null = null;
const readClock = () => snapshot ?? (snapshot = secondsToMidnight());
function subscribeClock(cb: () => void) {
  const id = setInterval(() => {
    snapshot = secondsToMidnight();
    cb();
  }, 1000);
  return () => clearInterval(id);
}
const hms = (s: number) => [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");

/**
 * The original stacks a 78px countdown bar and a 40px ticker above the header, and pins the countdown to the
 * top of the screen while you scroll: about a fifth of a phone screen gone. This is the same message in one
 * 36px line that scrolls away: the rotating offers on the left, the countdown on the right.
 */
export function PromoBar() {
  const left = useSyncExternalStore(subscribeClock, readClock, () => null);
  const [i, setI] = useState(0);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % TOP_TICKER.length), 3500);
    return () => clearInterval(id);
  }, []);

  if (closed) return null;
  return (
    <div className="relative bg-ink text-white">
      <div className="mx-auto flex h-9 max-w-[1400px] items-center gap-3 px-4 text-[12px] md:px-12">
        <div className="relative h-full flex-1 overflow-hidden">
          {TOP_TICKER.map((t, n) => (
            <p
              key={t}
              aria-hidden={n !== i}
              className={`absolute inset-0 flex items-center font-semibold tracking-wide transition-[opacity,translate] ${
                n === i
                  ? "translate-y-0 opacity-100 delay-200 duration-400"
                  : n === (i + TOP_TICKER.length - 1) % TOP_TICKER.length
                    ? "-translate-y-3 opacity-0 duration-200"
                    : "translate-y-3 opacity-0 duration-0"
              }`}
            >
              {t}
            </p>
          ))}
        </div>
        <p className="flex items-center gap-2 whitespace-nowrap">
          <span className="hidden text-white/70 sm:inline">Flash sale ends in</span>
          <span className="sm:hidden text-white/70">Ends in</span>
          <span className="rounded bg-brand px-1.5 py-0.5 font-bold tabular-nums" role="timer">
            {left === null ? "--:--:--" : hms(left)}
          </span>
        </p>
        <button type="button" onClick={() => setClosed(true)} className="-mr-2 p-2 text-white/70 transition hover:text-white" aria-label="Hide sale bar">
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
