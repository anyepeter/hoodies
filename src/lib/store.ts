// Everything the store shows, in one place: the hoodie, its bundles and add-ons, the reviews and FAQs.
// Copied from akatsukizipup.com (21 Nov 2026) so the clone reads exactly like the original.

export const STORE_NAME = "AkatsukiZipUp";

// The original prices in euros; shown here converted to US dollars at the ECB rate of 20 Nov 2026.
export const EUR_TO_USD = 1.099;
const usd = (eur: number) => Math.round(eur * EUR_TO_USD * 100) / 100;

export type Style = "Akatsuki" | "Shinobi";
export const STYLES: Style[] = ["Akatsuki", "Shinobi"];
export const SIZES = ["S", "M", "L", "XL", "2XL"] as const;
export type Size = (typeof SIZES)[number];

export const STYLE_IMAGE: Record<Style, string> = {
  Akatsuki: "/store/akatsuki-front.webp",
  Shinobi: "/store/shinobi-front.webp",
};

export const HOODIE = {
  handle: "akatsukizipup-mask-hoodie",
  title: "Akatsuki Mask Hoodie",
  price: usd(57.95),
  compareAt: usd(80.95),
  images: [
    { src: "/store/akatsuki-front.webp", alt: "Akatsuki Mask Hoodie, front", style: "Akatsuki" as Style },
    { src: "/store/akatsuki-2.webp", alt: "Akatsuki Mask Hoodie, laid flat", style: "Akatsuki" as Style },
    { src: "/store/shinobi-front.webp", alt: "Shinobi Mask Hoodie, front", style: "Shinobi" as Style },
    { src: "/store/shinobi-back.webp", alt: "Shinobi Mask Hoodie, back", style: "Shinobi" as Style },
    { src: "/store/size-guide.png", alt: "Size guide", style: null },
  ],
  bullets: ["☁️ Join the Akatsuki", "🖤 Your new favorite Zip-Up", "🔥 Wear it. Become a rogue."],
};

export type BundleId = "solo" | "duo" | "squad";
export interface Bundle {
  id: BundleId;
  title: string;
  qty: number;
  saving: string;
  price: number;
  sticker?: string;
  ribbon?: string;
}
// The original prices each extra hoodie lower: two at 10% off, three at 15% off the single price.
export const BUNDLES: Bundle[] = [
  { id: "solo", title: "Solo Hoodie", qty: 1, saving: "You Save 27% OFF!", price: usd(57.95) },
  { id: "duo", title: "Duo Pack", qty: 2, saving: "You Save An EXTRA 27% OFF!", price: usd(104.31), sticker: "Most Popular" },
  { id: "squad", title: "Squad Pack", qty: 3, saving: "You Save An EXTRA 27% OFF!", price: usd(147.77), ribbon: "MOST VALUE" },
];

export type AddOnId = "mystery-box" | "shipping-protection" | "priority-shipping";
export interface AddOn {
  id: AddOnId;
  label: string;
  title: string;
  price: number;
  image: string;
  description: string;
}
export const ADD_ONS: AddOn[] = [
  { id: "mystery-box", label: "Add Mystery Box", title: "Mystery Box", price: usd(13.95), image: "/store/upsell-mystery-box.webp", description: "Add a surprise item to your order." },
  { id: "shipping-protection", label: "Add Shipping Protection", title: "Shipping Protection", price: usd(4.95), image: "/store/upsell-protection.webp", description: "Protect your order against loss, theft and damage in transit." },
  { id: "priority-shipping", label: "Add Priority Shipping", title: "Priority Shipping", price: usd(3.95), image: "/store/upsell-priority.webp", description: "Your order is processed and shipped with priority." },
];

export const PRODUCT_REVIEW = {
  text: "the akatsuki clouds already had my attention but then I saw the mask 😂 whoever came up with this gets it",
  name: "Carlos G.",
  avatar: "/store/carlos.jpg",
};

export const RECENT_BUYERS = ["/store/buyer-1.jpg", "/store/buyer-2.png", "/store/buyer-3.jpg"];

export const PRODUCT_QUESTIONS = [
  {
    q: "🚚 How long does shipping take?",
    a: "Orders are processed within 1-3 business days and typically arrive within 5-10 business days, depending on your location. You will receive a tracking number as soon as your order ships. 📦✨",
  },
  {
    q: "📐 What size should I choose?",
    a: "Check our size guide before ordering. It lists the hoodies' measurements, so you can compare them with a hoodie you already own for the closest fit",
  },
];

export const TICKER_REVIEWS = [
  { text: "Honestly, one of the coolest hoodies I've bought. The ski mask hood looks insane in person, and the material is really comfortable.", name: "Luna L.", avatar: "/store/luna.png" },
  { text: "Got one for myself and one for my boyfriend. He absolutely loved it. The Akatsuki style makes it stand out from regular hoodies.", name: "Vanessa R.", avatar: "/store/vanessa.jpg" },
  { text: "Saw the hoodie on Instagram and instantly bought it. The quality is insane, and everyone asks me where I got it.", name: "Danny B.", avatar: "/store/danny.jpg" },
];

export const JOIN = {
  heading: "Join The Akatsuki ☁️🖤",
  text: "Rep the most iconic clan in anime history. The red clouds. The mystery. The power. Whether you’re hitting the streets or chilling at home, zip up, pull the mask, and let them know — you chose the dark side.",
  video: "/store/join-video.mp4",
  poster: "/store/join-poster.jpg",
};

export const TOP_TICKER = ["FREE WORLDWIDE SHIPPING", "LAST UNITS IN STOCK", "FLASH SALE AT 27%"];
export const SALE_TICKER = ["FREE WORLDWIDE SHIPPING", "27% OFF ENTIRE STORE", "SALE ENDS MIDNIGHT"];

export const FAQS = [
  { q: "Is this hoodie unisex?", a: "Yes! The AkatsukiZipUp Mask Hoodie is made for anyone who loves anime streetwear. Check our size guide to find your preferred fit." },
  { q: "Can I wear it with my face uncovered?", a: "Yes, leave the built-in mask unzipped for an open-face look, or zip it up to complete the full design" },
  { q: "Do you offer free worldwide shipping?", a: "Yes! We offer FREE standard shipping to our available destinations worldwide. Enter your address at checkout to confirm availability. International import duties or taxes may apply separately" },
];

export const TESTIMONIALS = [
  { title: "Completely Obsessed", text: "Love that it's the Akatsuki clouds instead of a huge character graphic. Something I'd actually wear with my everyday outfits", name: "Kass S.", image: "/store/review-kass.webp", avatar: "/store/kass.jpg" },
  { title: "Great quality", text: "Honestly, I thought the quality wouldn't be that good. The design looks crazy in person, and the hoodie feels really comfy.", name: "Morris B.", image: "/store/review-morris.webp", avatar: "/store/morris.jpg" },
  { title: "I couldn't help it", text: "I told myself I didn't need another Naruto hoodie... then I saw the mask 😭 This is way too tempting.", name: "Jessica M.", image: "/store/review-jessica.png", avatar: "/store/jessica.jpg" },
];

export const NAV = [
  { label: "Home", href: "/" },
  { label: "Catalog", href: "/collections/all" },
  { label: "Contact", href: "/pages/contact" },
];

export const FOOTER_LINKS = [
  { label: "Privacy policy", href: "/policies/privacy-policy" },
  { label: "Refund policy", href: "/policies/refund-policy" },
  { label: "Terms of service", href: "/policies/terms-of-service" },
  { label: "Shipping policy", href: "/policies/shipping-policy" },
  { label: "Contact information", href: "/policies/contact-information" },
];

/** Prices in US dollars, written $57.95 (the original's figures, shown in dollars). */
export function money(value: number): string {
  const [whole, cents] = value.toFixed(2).split(".");
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

export const SAVE_PERCENT = Math.round((1 - HOODIE.price / HOODIE.compareAt) * 100); // 28
