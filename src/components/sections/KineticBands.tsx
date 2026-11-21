import { Marquee } from "@/components/Marquee";

const WORDS = ["Join the Akatsuki", "Wear it. Become a rogue.", "Your new favorite Zip-Up", "Free worldwide shipping"];

/**
 * Two banners crossing at an angle and moving in opposite directions: the streetwear-drop look, in the brand's
 * red and black, using the store's own lines.
 */
export function KineticBands() {
  return (
    <section aria-hidden className="relative h-[190px] overflow-hidden md:h-[260px]">
      <div className="absolute inset-x-[-5%] top-[14%] -rotate-3 bg-ink py-3 text-white shadow-[0_20px_40px_-20px_rgba(18,18,18,0.6)] md:top-[16%] md:py-4">
        <Marquee speed={38} gap="gap-10">
          {WORDS.map((w) => (
            <span key={w} className="flex items-center gap-10 whitespace-nowrap text-[22px] font-extrabold uppercase tracking-tight md:text-[34px]">
              {w}
              <span className="text-brand">✦</span>
            </span>
          ))}
        </Marquee>
      </div>
      <div className="absolute inset-x-[-5%] top-[52%] rotate-2 bg-brand py-3 text-white shadow-[0_20px_40px_-20px_rgba(167,3,23,0.6)] md:top-[50%] md:py-4">
        <Marquee speed={32} gap="gap-10" reverse>
          {WORDS.map((w) => (
            <span key={w} className="outline-text flex items-center gap-10 whitespace-nowrap text-[22px] font-extrabold uppercase tracking-tight md:text-[34px]">
              {w}
              <span className="text-white [-webkit-text-stroke:0]">✦</span>
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
