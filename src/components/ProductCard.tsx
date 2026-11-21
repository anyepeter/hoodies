import Image from "next/image";
import Link from "next/link";
import { money } from "@/lib/store";

export interface CardProduct {
  href: string;
  title: string;
  image: string;
  hoverImage?: string;
  price: number;
  compareAt?: number;
  contain?: boolean;
}

/** Product tile: photo (second photo on hover), name, price, "SAVE n%" badge when it's discounted. */
export function ProductCard({ p, priority = false }: { p: CardProduct; priority?: boolean }) {
  const save = p.compareAt ? Math.round((1 - p.price / p.compareAt) * 100) : 0;
  return (
    <Link href={p.href} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-soft">
        <Image
          src={p.image}
          alt={p.title}
          fill
          priority={priority}
          sizes="(min-width: 768px) 25vw, 50vw"
          className={`transition duration-500 group-hover:scale-[1.04] ${p.contain ? "object-contain p-6" : "object-cover"} ${p.hoverImage ? "group-hover:opacity-0" : ""}`}
        />
        {p.hoverImage && (
          <Image src={p.hoverImage} alt="" fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover opacity-0 transition duration-500 group-hover:scale-[1.04] group-hover:opacity-100" />
        )}
        {save > 0 && <span className="absolute bottom-3 left-3 rounded-full bg-brand px-3 py-1 text-[12px] font-semibold text-white">SAVE {save}%</span>}
      </div>
      <h3 className="mt-3 text-[15px] underline-offset-4 group-hover:underline">{p.title}</h3>
      <p className="mt-1 text-[15px]">
        <span className={p.compareAt ? "font-semibold text-brand" : ""}>{money(p.price)}</span>
        {p.compareAt && <s className="ml-2 text-[13px] text-ink/55">{money(p.compareAt)}</s>}
      </p>
    </Link>
  );
}
