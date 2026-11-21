import type { Metadata } from "next";
import { ProductCard, type CardProduct } from "@/components/ProductCard";
import { Reveal } from "@/components/Reveal";
import { ADD_ONS, HOODIE } from "@/lib/store";

export const metadata: Metadata = { title: "Products" };

const PRODUCTS: CardProduct[] = [
  { href: `/products/${HOODIE.handle}`, title: HOODIE.title, image: HOODIE.images[0].src, hoverImage: HOODIE.images[1].src, price: HOODIE.price, compareAt: HOODIE.compareAt },
  ...ADD_ONS.map((a) => ({ href: `/products/${a.id}`, title: a.title, image: a.image, price: a.price, contain: true })),
];

export default function Catalog() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-10 md:px-12 md:py-14">
      <h1 className="text-[30px] font-bold md:text-[40px]">Products</h1>
      <p className="mt-6 border-b border-black/10 pb-3 text-right text-[13px] text-ink/70">{PRODUCTS.length} products</p>
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 md:gap-6">
        {PRODUCTS.map((p, i) => (
          <Reveal key={p.href} delay={i * 60}>
            <ProductCard p={p} priority={i < 2} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
