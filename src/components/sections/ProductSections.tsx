// Everything under the product on the original page, top to bottom.
import Image from "next/image";
import { CheckBoxIcon, QuestionIcon, Stars } from "@/components/icons";
import { Marquee } from "@/components/Marquee";
import { Reveal } from "@/components/Reveal";
import { AccordionItem } from "@/components/sections/Accordion";
import { AutoplayVideo } from "@/components/sections/AutoplayVideo";
import { Testimonials } from "@/components/sections/Testimonials";
import { Wave } from "@/components/Wave";
import { FAQS, JOIN, PRODUCT_QUESTIONS, SALE_TICKER, TICKER_REVIEWS } from "@/lib/store";

export function ProductQuestions() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 md:px-12">
      <div className="md:ml-auto md:w-1/2 md:pl-6">
        {PRODUCT_QUESTIONS.map((item) => (
          <AccordionItem key={item.q} question={item.q} icon={<CheckBoxIcon className="h-5 w-5 shrink-0" />}>
            {item.a}
          </AccordionItem>
        ))}
      </div>
    </section>
  );
}

export function ReviewsTicker() {
  return (
    <section className="mt-8" aria-label="Customer reviews">
      <Wave />
      <div className="bg-brand py-8 text-white">
        <Marquee speed={45} gap="gap-12">
          {TICKER_REVIEWS.map((r) => (
            <figure key={r.name} className="flex w-[300px] shrink-0 gap-4 md:w-[380px]">
              <Image src={r.avatar} alt="" width={52} height={52} className="h-[52px] w-[52px] shrink-0 rounded-full object-cover" />
              <div>
                <blockquote className="border-b border-white/30 pb-2 text-[14px] font-medium leading-snug">{r.text}</blockquote>
                <figcaption className="mt-2 flex items-center gap-2 text-[12px] italic text-white/80">
                  {r.name} <Stars className="h-3 w-3" />
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
    <section className="mx-auto mt-10 grid max-w-[1400px] items-center gap-6 px-4 md:grid-cols-2 md:gap-14 md:px-12">
      <Reveal>
        <AutoplayVideo src={JOIN.video} poster={JOIN.poster} className="aspect-[4/5] w-full rounded-xl object-cover md:aspect-[4/5]" />
      </Reveal>
      <Reveal delay={100}>
        <h2 className="text-[24px] font-bold md:text-[36px]">{JOIN.heading}</h2>
        <p className="mt-5 text-[14px] leading-[1.8] text-ink/85 md:text-[16px]">{JOIN.text}</p>
      </Reveal>
    </section>
  );
}

export function SaleTicker() {
  return (
    <div className="mt-10 bg-brand py-2.5 text-white">
      <Marquee speed={25} gap="gap-16">
        {SALE_TICKER.map((t) => (
          <span key={t} className="whitespace-nowrap text-[15px] font-bold">
            {t}
          </span>
        ))}
      </Marquee>
    </div>
  );
}

export function FaqSection() {
  return (
    <section className="mx-auto mt-8 max-w-[800px] px-4">
      <Reveal>
        <h2 className="text-center text-[28px] font-bold md:text-[36px]">FAQ&apos;s</h2>
      </Reveal>
      <div className="mt-5 space-y-3">
        {FAQS.map((f, i) => (
          <Reveal key={f.q} delay={i * 80}>
            <AccordionItem variant="pill" question={f.q} icon={<QuestionIcon className="h-4 w-4 shrink-0" />}>
              {f.a}
            </AccordionItem>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function TestimonialsSection() {
  return (
    <section className="mx-auto mt-16 max-w-[1400px] px-4 md:px-12">
      <Reveal>
        <h2 className="text-center text-[30px] font-bold leading-tight md:text-[40px]">What Customers Are Saying...</h2>
      </Reveal>
      <div className="mt-6">
        <Testimonials />
      </div>
    </section>
  );
}
