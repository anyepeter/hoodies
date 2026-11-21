import Image from "next/image";
import Link from "next/link";
import { HOODIE, money, type Style } from "@/lib/store";

/**
 * One style in "Two styles. One mask.": photo, pieces left, price, and Add to cart. Add to cart opens the
 * hoodie page with this style already picked, so sizes and packs are chosen in one place. `left` is the live
 * stock (read by the page from the database); at 0 the card says Sold out and its button is disabled.
 */
export function StyleCard({ style, text, front, back, left, priority = false }: { style: Style; text: string; front: string; back: string; left: number; priority?: boolean }) {
  const href = `/products/${HOODIE.handle}`;
  const soldOut = left <= 0;

  return (
    <article className="group">
      <Link href={href} className="relative block aspect-square overflow-hidden rounded-3xl bg-soft" aria-label={`${style} Mask Hoodie, view details`}>
        <Image src={front} alt={`${style} Mask Hoodie`} fill sizes="(min-width: 768px) 50vw, 100vw" priority={priority} className="object-cover transition duration-700 group-hover:scale-105 group-hover:opacity-0" />
        <Image src={back} alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="scale-105 object-cover opacity-0 transition duration-700 group-hover:scale-100 group-hover:opacity-100" />
        <span className="absolute left-4 top-4 rounded-full bg-brand px-3 py-1 text-[12px] font-bold text-white">Save 28%</span>
        {soldOut ? (
          <span className="absolute right-4 top-4 rounded-full bg-ink px-3 py-1 text-[12px] font-bold text-white shadow-sm">Sold out</span>
        ) : (
          <span className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[12px] font-bold text-ink shadow-sm backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand/60" />
              <span className="relative h-2 w-2 rounded-full bg-brand" />
            </span>
            Only {left} left
          </span>
        )}
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[20px] font-bold tracking-tight">{style}</h3>
          <p className="text-[14px] text-ink/60">{text}</p>
        </div>
        <p className="text-right text-[15px]">
          <b className="text-brand">{money(HOODIE.price)}</b>
          <s className="block text-[12px] text-ink/40">{money(HOODIE.compareAt)}</s>
        </p>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        {soldOut ? (
          <button type="button" disabled className="btn-brand h-12 rounded-2xl text-[15px] disabled:cursor-not-allowed disabled:bg-ink/30 disabled:active:scale-100">
            Sold out
          </button>
        ) : (
          <Link href={`${href}?style=${encodeURIComponent(style)}`} className="btn-brand group/btn relative h-12 overflow-hidden rounded-2xl text-[15px]">
            Add to cart · {money(HOODIE.price)}
            <span className="shine" aria-hidden />
          </Link>
        )}
        <Link href={href} className="inline-flex h-12 items-center rounded-2xl border border-black/15 px-4 text-[14px] font-semibold transition hover:border-ink">
          Details
        </Link>
      </div>
    </article>
  );
}
