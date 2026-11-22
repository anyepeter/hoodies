import { Perks } from "@/components/product/Perks";
import { Hero, StylesSpotlight } from "@/components/sections/Hero";
import { FaqSection, ReviewWall, SizeGuide } from "@/components/sections/ProductSections";
import { getStock } from "@/lib/stock";

// Static, rebuilt whenever stock changes (revalidateStorefront). The hour is only a safety net.
export const revalidate = 3600;

/** Kept short on purpose: the hoodie, the two styles, the size guide, photo reviews, questions. */
export default async function Home() {
  const stock = await getStock();
  return (
    <>
      <Hero />
      <div className="mx-auto max-w-[1400px] px-4 pt-6 md:px-12">
        <Perks />
      </div>
      <StylesSpotlight stock={stock} />
      <SizeGuide />
      <ReviewWall photosOnly />
      <FaqSection />
    </>
  );
}
