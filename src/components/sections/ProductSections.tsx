// The sections under the buy box, shared with the home page.
import Image from "next/image";
import Link from "next/link";
import { QuoteIcon, Stars } from "@/components/icons";
import { Marquee } from "@/components/Marquee";
import { Reveal } from "@/components/Reveal";
import { AccordionItem } from "@/components/sections/Accordion";
import { AutoplayVideo } from "@/components/sections/AutoplayVideo";
import { Wave } from "@/components/Wave";
import { ALL_REVIEWS, FAQS, FEATURES, HOODIE, JOIN, PRODUCT_QUESTIONS, SALE_TICKER, TICKER_REVIEWS, money } from "@/lib/store";

/** Zig-zag rows: photo on one side, the selling point on the other, alternating. */
export function FeatureRows() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-16 md:px-12 md:py-24" aria-labelledby="features-title">
      <Reveal>
        <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-brand">Why it&apos;s different</p>
        <h2 id="features-title" className="mt-2 max-w-xl text-balance text-[30px] font-bold leading-[1.05] tracking-tight md:text-[48px]">
          Your new favorite Zip-Up.
        </h2>
      </Reveal>
      <div className="mt-10 space-y-14 md:mt-16 md:space-y-24">
        {FEATURES.map((f, i) => (
          <div key={f.title} className="grid items-center gap-6 md:grid-cols-12 md:gap-12">
            <Reveal className={`md:col-span-7 ${i % 2 ? "md:order-2" : ""}`}>
              <div className="group relative aspect-[5/4] overflow-hidden rounded-3xl bg-soft">
                <Image src={f.image} alt={f.alt} fill sizes="(min-width: 768px) 58vw, 100vw" className="drift object-cover" />
                <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[12px] font-bold backdrop-blur">
                  0{i + 1}
                </span>
              </div>
            </Reveal>
            <Reveal delay={120} className={`md:col-span-5 ${i % 2 ? "md:order-1" : ""}`}>
              <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-brand">{f.kicker}</p>
              <h3 className="mt-2 text-balance text-[26px] font-bold leading-tight tracking-tight md:text-[36px]">{f.title}</h3>
              <p className="mt-4 max-w-md text-pretty text-[15px] leading-relaxed text-ink/70 md:text-[17px]">{f.text}</p>
            </Reveal>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ReviewsTicker() {
  return (
    <section aria-label="What customers say">
      <Wave />
      <div className="bg-brand py-8 text-white">
        <Marquee speed={50} gap="gap-12">
          {TICKER_REVIEWS.map((r) => (
            <figure key={r.name} className="flex w-[300px] shrink-0 gap-4 md:w-[400px]">
              <Image src={r.avatar} alt="" width={52} height={52} className="h-[52px] w-[52px] shrink-0 rounded-2xl object-cover" />
              <div>
                <blockquote className="text-[14px] font-medium leading-snug">&ldquo;{r.text}&rdquo;</blockquote>
                <figcaption className="mt-2 flex items-center gap-2 text-[12px] text-white/75">
                  <Stars className="h-3 w-3" /> {r.name}
                </figcaption>
              </div>
            </figure>
          ))}
        </Marquee>
      </div>
      <Wave flip />
    </section>
  );
}

export function JoinSection() {
  return (
    <section className="mx-auto grid max-w-[1400px] items-center gap-8 px-4 py-14 md:grid-cols-2 md:gap-16 md:px-12 md:py-24">
      <Reveal className="relative">
        <AutoplayVideo src={JOIN.video} poster={JOIN.poster} className="zoom-in aspect-[4/5] w-full rounded-3xl object-cover shadow-[0_30px_60px_-30px_rgba(18,18,18,0.5)]" />
        <span className="absolute -bottom-4 right-4 rounded-2xl bg-white px-4 py-3 shadow-xl md:-right-6">
          <Stars className="h-3.5 w-3.5" />
          <span className="mt-1 block text-[13px] font-semibold">Rated 4.9/5</span>
          <span className="block text-[11px] text-ink/55">by over 300 customers</span>
        </span>
      </Reveal>
      <Reveal delay={120}>
        <h2 className="text-balance text-[30px] font-bold leading-[1.05] tracking-tight md:text-[48px]">{JOIN.heading}</h2>
        <p className="mt-5 max-w-lg text-pretty text-[15px] leading-[1.8] text-ink/70 md:text-[17px]">{JOIN.text}</p>
        <Link href={`/products/${HOODIE.handle}`} className="btn-brand mt-8 h-13 rounded-2xl px-8">
          Wear it. Become a rogue. →
        </Link>
      </Reveal>
    </section>
  );
}

export function SaleTicker() {
  return (
    <div className="bg-brand py-3 text-white">
      <Marquee speed={28} gap="gap-16">
        {SALE_TICKER.map((t) => (
          <span key={t} className="flex items-center gap-16 whitespace-nowrap text-[14px] font-bold tracking-wide">
            {t} <span className="text-white/50">✦</span>
          </span>
        ))}
      </Marquee>
    </div>
  );
}

/**
 * Every review on one wall (masonry columns) instead of a 3-slide carousel where two of three are hidden.
 */
export function ReviewWall() {
  return (
    <section id="reviews" className="mx-auto max-w-[1400px] scroll-mt-24 px-4 py-16 md:px-12 md:py-24">
      <Reveal className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-brand">Reviews</p>
          <h2 className="mt-2 text-balance text-[30px] font-bold leading-[1.05] tracking-tight md:text-[48px]">What customers are saying</h2>
        </div>
        <p className="flex items-center gap-3 rounded-2xl bg-soft px-4 py-3">
          <span className="text-[32px] font-bold leading-none tracking-tight">4.9</span>
          <span className="text-[12px] leading-tight text-ink/60">
            <Stars className="h-3.5 w-3.5" />
            <span className="mt-1 block">over 300 satisfied customers</span>
          </span>
        </p>
      </Reveal>
      <div className="mt-10 columns-1 gap-4 sm:columns-2 lg:columns-3">
        {ALL_REVIEWS.map((r, i) => (
          <Reveal key={r.name} delay={(i % 3) * 90} className="mb-4 break-inside-avoid">
            <figure className="overflow-hidden rounded-3xl bg-soft">
              {r.image && (
                <div className="relative aspect-square">
                  <Image src={r.image} alt={`${r.name} wearing the hoodie`} fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
                </div>
              )}
              <div className="relative p-5">
                <QuoteIcon className="absolute right-5 top-5 h-6 w-6 text-ink/10" />
                <Stars className="h-3.5 w-3.5" />
                {r.title && <p className="mt-2 text-[17px] font-bold">{r.title}</p>}
                <blockquote className="mt-2 text-pretty text-[14px] leading-relaxed text-ink/75">{r.text}</blockquote>
                <figcaption className="mt-4 flex items-center gap-2.5">
                  <Image src={r.avatar} alt="" width={32} height={32} className="h-8 w-8 rounded-xl object-cover" />
                  <span className="text-[13px] font-semibold">{r.name}</span>
                  <span className="ml-auto rounded-md bg-white px-2 py-0.5 text-[10px] font-semibold text-ink/55">Customer</span>
                </figcaption>
              </div>
            </figure>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/** All the questions in one place, title on the left and answers on the right on desktop. */
export function FaqSection() {
  const all = [...FAQS, ...PRODUCT_QUESTIONS.map((p) => ({ q: p.q.replace(/^\S+\s/, ""), a: p.a }))];
  return (
    <section className="mx-auto grid max-w-[1400px] gap-8 px-4 py-16 md:grid-cols-12 md:px-12 md:py-24">
      <Reveal className="md:col-span-4">
        <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-brand">FAQ&apos;s</p>
        <h2 className="mt-2 text-balance text-[30px] font-bold leading-[1.05] tracking-tight md:text-[44px]">Questions, answered.</h2>
        <p className="mt-4 text-[14px] text-ink/60">
          Something else?{" "}
          <Link href="/pages/contact" className="font-semibold text-ink underline underline-offset-4">
            Get in touch
          </Link>
          .
        </p>
      </Reveal>
      <div className="md:col-span-8">
        {all.map((f, i) => (
          <Reveal key={f.q} delay={i * 50}>
            <AccordionItem question={f.q}>{f.a}</AccordionItem>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/** The last push: a dark band with the price and one button. */
export function CtaBand() {
  return (
    <section className="px-4 pb-16 md:px-12 md:pb-24">
      <Reveal>
        <div className="grain relative mx-auto grid max-w-[1400px] items-center gap-8 overflow-hidden rounded-[2rem] bg-ink p-8 text-white md:grid-cols-2 md:p-14">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/40 blur-3xl" aria-hidden />
          <div className="relative">
            <h2 className="text-balance text-[32px] font-bold leading-[1.05] tracking-tight md:text-[52px]">Join the Akatsuki.</h2>
            <p className="mt-4 max-w-md text-[15px] text-white/70">
              {money(HOODIE.price)} <s className="text-white/40">{money(HOODIE.compareAt)}</s> · free worldwide shipping · 30-day returns.
            </p>
            <Link href={`/products/${HOODIE.handle}`} className="mt-8 inline-flex h-13 items-center rounded-2xl bg-white px-8 font-bold text-ink transition hover:scale-[1.02] active:scale-[0.98]">
              Shop the hoodie →
            </Link>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-[380px]">
            <Image src="/store/akatsuki-front.webp" alt="Akatsuki Mask Hoodie" fill sizes="380px" className="rounded-3xl object-cover" />
          </div>
        </div>
      </Reveal>
    </section>
  );
}
