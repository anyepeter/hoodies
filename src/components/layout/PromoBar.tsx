"use client";

import { useState, useSyncExternalStore } from "react";
import { CloseIcon } from "@/components/icons";
import { Marquee } from "@/components/Marquee";
import { TOP_TICKER } from "@/lib/store";

/* The sale countdown runs in 14-hour rounds. A visitor's first visit starts a round at 14:00:00; coming back
   (or reloading) carries on from where it was; when a round reaches zero, the next one starts at 14:00:00.
   The end time is kept in the browser, so every visitor has their own round. The server renders "--:--:--". */
const ROUND_MS = 14 * 60 * 60 * 1000;
const KEY = "akz.sale-ends-at";
let endsAt = 0; // in memory too, for browsers that block storage

function roundEnd(now: number): number {
  if (!endsAt) {
    try {
      endsAt = Number(localStorage.getItem(KEY)) || 0;
    } catch {}
  }
  // Ended (or a clock that moved back past the round's start): a fresh 14 hours from now.
  if (endsAt <= now || endsAt > now + ROUND_MS) {
    endsAt = now + ROUND_MS;
    try {
      localStorage.setItem(KEY, String(endsAt));
    } catch {}
  }
  return endsAt;
}
const secondsLeft = () => {
  const now = Date.now();
  return Math.ceil((roundEnd(now) - now) / 1000);
};
// React may read the snapshot several times per render, so it's cached and only the interval moves it.
let snapshot: number | null = null;
const readClock = () => snapshot ?? (snapshot = secondsLeft());
function subscribeClock(cb: () => void) {
  const id = setInterval(() => {
    snapshot = secondsLeft();
    cb();
  }, 1000);
  return () => clearInterval(id);
}
const hms = (s: number) => [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");

/**
 * The original's moving red banner (free shipping · last units · flash sale) and its countdown, in one 38px
 * line that scrolls away with the page instead of two stacked bars pinned to the top. Hover pauses the strip.
 */
export function PromoBar() {
  const left = useSyncExternalStore(subscribeClock, readClock, () => null);
  const [closed, setClosed] = useState(false);
  if (closed) return null;

  return (
    <div className="relative z-40 flex h-[38px] items-stretch overflow-hidden bg-brand text-white">
      <Marquee speed={22} gap="gap-8" className="min-w-0 flex-1 self-center">
        {TOP_TICKER.map((t) => (
          <span key={t} className="flex items-center gap-8 whitespace-nowrap text-[12px] font-bold tracking-[0.08em]">
            {t}
            <span className="text-white/50" aria-hidden>
              ✦
            </span>
          </span>
        ))}
      </Marquee>
      <div className="relative flex shrink-0 items-center gap-2 bg-brand-dark pl-4 pr-1 text-[12px] before:absolute before:inset-y-0 before:-left-6 before:w-6 before:bg-gradient-to-r before:from-transparent before:to-brand-dark">
        <span className="hidden font-semibold text-white/80 sm:inline">Sale ends in</span>
        <span className="rounded-md bg-white px-1.5 py-0.5 font-bold tabular-nums text-brand" role="timer" aria-label="Time left in the sale">
          {left === null ? "--:--:--" : hms(left)}
        </span>
        <button type="button" onClick={() => setClosed(true)} className="grid h-8 w-8 place-items-center text-white/70 transition hover:text-white" aria-label="Hide sale bar">
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
