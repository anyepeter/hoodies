// An endless strip: the items twice in a row, slid left by half, so the loop has no seam.
import type { ReactNode } from "react";

export function Marquee({
  children,
  className = "",
  speed = 30,
  gap = "gap-10",
}: {
  children: ReactNode;
  className?: string;
  /** Seconds for one full loop. */
  speed?: number;
  gap?: string;
}) {
  return (
    <div className={`group overflow-hidden ${className}`}>
      <div className="marquee-track flex w-max" style={{ animationDuration: `${speed}s` }}>
        <div className={`flex shrink-0 items-center pr-10 ${gap}`}>{children}</div>
        <div className={`flex shrink-0 items-center pr-10 ${gap}`} aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
