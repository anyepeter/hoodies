import { Perks } from "@/components/product/Perks";
import { Hero, StylesSpotlight } from "@/components/sections/Hero";
import { CtaBand, FaqSection, FeatureRows, ReviewsTicker, ReviewWall } from "@/components/sections/ProductSections";

export default function Home() {
  return (
    <>
      <Hero />
      <div className="mx-auto max-w-[1400px] px-4 pt-6 md:px-12">
        <Perks />
      </div>
      <StylesSpotlight />
      <FeatureRows />
      <ReviewsTicker />
      <ReviewWall />
      <FaqSection />
      <CtaBand />
    </>
  );
}
