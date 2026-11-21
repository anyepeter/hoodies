import Image from "next/image";
import Link from "next/link";
import { Stars } from "@/components/icons";
import { AutoplayVideo } from "@/components/sections/AutoplayVideo";
import { HOODIE, JOIN, money } from "@/lib/store";

/**
 * The original home page is one product tile. This opens on the store's own video instead: full screen on a
 * phone, a split layout on desktop with the hoodie card overlapping the clip.
 */
export function Hero() {
  return (
    <section className="grain relative isolate overflow-hidden bg-ink text-white">
      {/* Phone: the clip fills the screen behind the words */}
      <div className="absolute inset-0 -z-10 md:hidden">
        <AutoplayVideo src={JOIN.video} poster={JOIN.poster} className="h-full w-full object-cover opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/10" />
      </div>
      <div className="absolute -left-40 top-1/3 -z-10 hidden h-[520px] w-[520px] rounded-full bg-brand/30 blur-[120px] md:block" aria-hidden />

      <div className="mx-auto grid min-h-[calc(100svh-104px)] max-w-[1400px] items-end gap-10 px-5 pb-10 pt-24 md:min-h-0 md:grid-cols-12 md:items-center md:px-12 md:py-20">
        <div className="md:col-span-6">
          <p className="hero-in inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-semibold backdrop-blur" style={{ animationDelay: "60ms" }}>
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Flash sale · 27% off · free worldwide shipping
          </p>
          <h1 className="hero-in mt-5 text-balance text-[52px] font-extrabold leading-[0.92] tracking-[-0.03em] md:text-[96px]" style={{ animationDelay: "140ms" }}>
            Join the <span className="text-brand">Akatsuki.</span>
          </h1>
          <p className="hero-in mt-5 max-w-md text-pretty text-[16px] leading-relaxed text-white/75 md:text-[18px]" style={{ animationDelay: "220ms" }}>
            The zip-up hoodie with the red clouds and a built-in mask. Your new favorite Zip-Up. Wear it. Become a rogue.
          </p>
          <div className="hero-in mt-8 flex flex-wrap items-center gap-4" style={{ animationDelay: "300ms" }}>
            <Link href={`/products/${HOODIE.handle}`} className="btn-brand h-14 rounded-2xl px-8 text-[16px] shadow-[0_18px_40px_-16px_rgba(167,3,23,0.9)]">
              Shop the hoodie · {money(HOODIE.price)}
            </Link>
            <a href="#styles" className="text-[14px] font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline">
              See both styles ↓
            </a>
          </div>
          <p className="hero-in mt-8 flex items-center gap-2 text-[13px] text-white/70" style={{ animationDelay: "380ms" }}>
            <Stars className="h-3.5 w-3.5" /> Rated 4.9/5 by over 300 satisfied customers
          </p>
        </div>

        {/* Desktop: the clip as a tall card, the hoodie overlapping it */}
        <div className="relative hidden md:col-span-6 md:block">
          <div className="hero-in relative ml-auto w-[78%]" style={{ animationDelay: "200ms" }}>
            <AutoplayVideo src={JOIN.video} poster={JOIN.poster} className="aspect-[4/5] w-full rounded-[2rem] object-cover" />
          </div>
          <Link
            href={`/products/${HOODIE.handle}`}
            className="hero-in float group absolute -left-2 bottom-10 flex w-[260px] items-center gap-4 rounded-3xl bg-white p-3 text-ink shadow-2xl"
            style={{ animationDelay: "420ms" }}
          >
            <Image src={HOODIE.images[0].src} alt="" width={88} height={88} className="h-[88px] w-[88px] rounded-2xl object-cover" />
            <span>
              <span className="block text-[14px] font-bold leading-tight">{HOODIE.title}</span>
              <span className="mt-1 block text-[13px]">
                <b className="text-brand">{money(HOODIE.price)}</b> <s className="text-ink/40">{money(HOODIE.compareAt)}</s>
              </span>
              <span className="mt-1 block text-[12px] font-semibold text-ink/60 transition group-hover:text-ink">Shop now →</span>
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Akatsuki and Shinobi side by side; hover (or tap) shows the second photo. */
export function StylesSpotlight() {
  const styles = [
    { name: "Akatsuki", text: "Black, with the red clouds.", front: "/store/akatsuki-front.webp", alt: "/store/akatsuki-2.webp" },
    { name: "Shinobi", text: "Green vest look with navy sleeves.", front: "/store/shinobi-front.webp", alt: "/store/shinobi-back.webp" },
  ];
  return (
    <section id="styles" className="mx-auto max-w-[1400px] scroll-mt-24 px-4 py-16 md:px-12 md:py-24">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-brand">Our hoodies</p>
          <h2 className="mt-2 text-balance text-[30px] font-bold leading-[1.05] tracking-tight md:text-[48px]">Two styles. One mask.</h2>
        </div>
        <Link href="/collections/all" className="hidden text-[14px] font-semibold underline-offset-4 hover:underline md:block">
          View catalog →
        </Link>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 md:gap-6">
        {styles.map((s, i) => (
          <Link key={s.name} href={`/products/${HOODIE.handle}`} className="group block">
            <div className="relative aspect-square overflow-hidden rounded-3xl bg-soft">
              <Image src={s.front} alt={`${s.name} Mask Hoodie`} fill sizes="(min-width: 768px) 50vw, 100vw" priority={i === 0} className="object-cover transition duration-700 group-hover:scale-105 group-hover:opacity-0" />
              <Image src={s.alt} alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="scale-105 object-cover opacity-0 transition duration-700 group-hover:scale-100 group-hover:opacity-100" />
              <span className="absolute left-4 top-4 rounded-full bg-brand px-3 py-1 text-[12px] font-bold text-white">Save 28%</span>
            </div>
            <div className="mt-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[20px] font-bold tracking-tight">{s.name}</h3>
                <p className="text-[14px] text-ink/60">{s.text}</p>
              </div>
              <p className="text-right text-[15px]">
                <b className="text-brand">{money(HOODIE.price)}</b>
                <s className="block text-[12px] text-ink/40">{money(HOODIE.compareAt)}</s>
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
