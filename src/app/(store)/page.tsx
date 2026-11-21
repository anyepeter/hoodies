import { Perks } from "@/components/product/Perks";
import { Hero, StylesSpotlight } from "@/components/sections/Hero";
import { KineticBands } from "@/components/sections/KineticBands";
import { CtaBand, FaqSection, FeatureRows, ReviewsTicker, ReviewWall, SaleTicker } from "@/components/sections/ProductSections";

export default function Home() {
  return (
    <>
      <Hero />
      <div className="mx-auto max-w-[1400px] px-4 pt-6 md:px-12">
        <Perks />
      </div>
      <StylesSpotlight />
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
