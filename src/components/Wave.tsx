// The wavy red edge the original puts above and below its red bands: a solid wave with a paler one behind it.
export function Wave({ flip = false, className = "" }: { flip?: boolean; className?: string }) {
  return (
    <div className={`pointer-events-none relative -mb-px h-[30px] w-full overflow-hidden leading-none md:h-[46px] ${flip ? "-mt-px rotate-180" : ""} ${className}`} aria-hidden>
      <svg viewBox="0 0 1440 60" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <path d="M0 22 C 240 2, 480 2, 720 20 S 1200 40, 1440 14 V60 H0z" fill="var(--color-brand)" opacity="0.25" />
        <path d="M0 34 C 300 12, 560 16, 800 30 S 1240 46, 1440 26 V60 H0z" fill="var(--color-brand)" />
      </svg>
    </div>
  );
}
