import type { Metadata } from "next";
import { ProductMain } from "@/components/product/ProductMain";
import { KineticBands } from "@/components/sections/KineticBands";
import { CtaBand, FaqSection, FeatureRows, JoinSection, ReviewsTicker, ReviewWall, SaleTicker } from "@/components/sections/ProductSections";
import { getStock } from "@/lib/stock";
import { HOODIE, STYLES } from "@/lib/store";

// Static, rebuilt whenever stock changes (revalidateStorefront). The hour is only a safety net.
export const revalidate = 3600;

const description = "The zip-up hoodie with the Akatsuki red clouds and a built-in mask. Akatsuki or Shinobi, S to 2XL. Free worldwide shipping, 30-day returns.";

export const metadata: Metadata = {
  title: HOODIE.title,
  description,
  openGraph: { title: HOODIE.title, description, images: [{ url: HOODIE.images[0].src, width: 1600, height: 1600 }] },
};

// What Google reads to show the price and stock in search results.
const productJsonLd = (inStock: boolean) => ({
  "@context": "https://schema.org",
  "@type": "Product",
  name: HOODIE.title,
  description,
  image: HOODIE.images.slice(0, 4).map((i) => i.src),
  brand: { "@type": "Brand", name: "AkatsukiZipUp" },
  offers: {
    "@type": "Offer",
    priceCurrency: "USD",
    price: HOODIE.price.toFixed(2),
    availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    shippingDetails: { "@type": "OfferShippingDetails", shippingRate: { "@type": "MonetaryAmount", value: "0", currency: "USD" } },
  },
});

export default async function HoodiePage() {
  const stock = await getStock();
  const jsonLd = productJsonLd(STYLES.some((s) => stock[s] > 0));
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ProductMain stock={stock} />
      <div className="mt-14">
        <ReviewsTicker />
      </div>
      <FeatureRows />
      <KineticBands />
      <JoinSection />
      <SaleTicker />
      <ReviewWall />
      <FaqSection />
      <CtaBand />
    </>
  );
}
