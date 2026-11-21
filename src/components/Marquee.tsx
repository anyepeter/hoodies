// An endless strip: the items twice in a row, slid left by half, so the loop has no seam. Hover pauses it.
import type { ReactNode } from "react";

export function Marquee({
  children,
  className = "",
  speed = 30,
  gap = "gap-10",
  reverse = false,
}: {
  children: ReactNode;
  className?: string;
  /** Seconds for one full loop. */
  speed?: number;
  gap?: string;
  /** Run left to right instead. */
  reverse?: boolean;
}) {
  return (
    <div className={`marquee overflow-hidden ${className}`}>
      <div className={`marquee-track flex w-max ${reverse ? "marquee-reverse" : ""}`} style={{ animationDuration: `${speed}s` }}>
        <div className={`flex shrink-0 items-center pr-10 ${gap}`}>{children}</div>
        <div className={`flex shrink-0 items-center pr-10 ${gap}`} aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
