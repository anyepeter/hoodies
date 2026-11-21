import { Perks } from "@/components/product/Perks";
import { Hero, StylesSpotlight } from "@/components/sections/Hero";
import { KineticBands } from "@/components/sections/KineticBands";
import { CtaBand, FaqSection, FeatureRows, ReviewsTicker, ReviewWall, SaleTicker } from "@/components/sections/ProductSections";
import { getStock } from "@/lib/stock";

// Static, rebuilt whenever stock changes (revalidateStorefront). The hour is only a safety net.
export const revalidate = 3600;

export default async function Home() {
  const stock = await getStock();
  return (
    <>
      <Hero />
      <div className="mx-auto max-w-[1400px] px-4 pt-6 md:px-12">
        <Perks />
      </div>
      <StylesSpotlight stock={stock} />
      <KineticBands />
      <FeatureRows />
      <ReviewsTicker />
      <ReviewWall />
      <SaleTicker />
      <FaqSection />
      <CtaBand />
    </>
  );
}
