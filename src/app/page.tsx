import { ProductCard } from "@/components/ProductCard";
import { Reveal } from "@/components/Reveal";
import { HOODIE } from "@/lib/store";

// The original home page is a single "Our Hoodies" collection with the one hoodie in it.
export default function Home() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-10 md:px-12 md:py-14">
      <Reveal>
        <h2 className="text-[24px] font-bold md:text-[30px]">Our Hoodies</h2>
      </Reveal>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
        <Reveal>
          <ProductCard
            priority
            p={{ href: `/products/${HOODIE.handle}`, title: HOODIE.title, image: HOODIE.images[0].src, hoverImage: HOODIE.images[1].src, price: HOODIE.price, compareAt: HOODIE.compareAt }}
          />
        </Reveal>
      </div>
    </section>
  );
}
