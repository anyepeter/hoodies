import { GiftIcon, TruckIcon } from "@/components/icons";
import { PERKS } from "@/lib/store";

const ReturnIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 010 11H11" />
  </svg>
);
const ICONS = [TruckIcon, ReturnIcon, GiftIcon];

/** Free shipping, returns, dispatch time: the reassurance the original only states once, in an FAQ. */
export function Perks({ className = "", tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  return (
    <ul className={`grid grid-cols-3 gap-2 ${className}`}>
      {PERKS.map((p, i) => {
        const Icon = ICONS[i];
        return (
          <li key={p.title} className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center ${tone === "dark" ? "bg-white/5 text-white" : "bg-soft"}`}>
            <Icon className={`h-5 w-5 ${tone === "dark" ? "text-white" : "text-brand"}`} />
            <span className="text-[11px] font-semibold leading-tight md:text-[12px]">{p.title}</span>
            <span className={`hidden text-[11px] leading-tight md:block ${tone === "dark" ? "text-white/60" : "text-ink/55"}`}>{p.text}</span>
          </li>
        );
      })}
    </ul>
  );
}
