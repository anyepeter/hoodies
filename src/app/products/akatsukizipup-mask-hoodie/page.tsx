import type { Metadata } from "next";
import { ProductMain } from "@/components/product/ProductMain";
import { FaqSection, JoinSection, ProductQuestions, ReviewsTicker, SaleTicker, TestimonialsSection } from "@/components/sections/ProductSections";
import { HOODIE } from "@/lib/store";

export const metadata: Metadata = { title: HOODIE.title };

// The hoodie page, section by section in the original's order. Its own route (not [handle]) so it is
// fully static and opens instantly.
export default function HoodiePage() {
  return (
    <>
      <ProductMain />
      <div className="mt-6">
        <ProductQuestions />
      </div>
      <ReviewsTicker />
      <JoinSection />
      <SaleTicker />
      <FaqSection />
      <TestimonialsSection />
      <div className="h-16" />
    </>
  );
}
