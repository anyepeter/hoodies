import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { CartProvider } from "@/components/cart/CartProvider";
import { BackToTop } from "@/components/layout/BackToTop";
import { FloatingShop } from "@/components/layout/FloatingShop";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { PromoBar } from "@/components/layout/PromoBar";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: { default: "AkatsukiZipUp: the Akatsuki Mask Hoodie", template: "%s – AkatsukiZipUp" },
  description: "The zip-up hoodie with the red clouds and a built-in mask. Akatsuki or Shinobi, S to 2XL. Free worldwide shipping.",
  openGraph: { siteName: "AkatsukiZipUp", type: "website", images: [{ url: "/store/akatsuki-front.webp", width: 1600, height: 1600 }] },
  // A design preview of someone else's live store: keep it out of search results so it never competes
  // with (or passes for) the real one.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#121212",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <a href="#main" className="sr-only z-[60] rounded-md bg-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
          Skip to content
        </a>
        <CartProvider>
          <PromoBar />
          <Header />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
          <FloatingShop />
          <CartDrawer />
          <BackToTop />
        </CartProvider>
      </body>
    </html>
  );
}
