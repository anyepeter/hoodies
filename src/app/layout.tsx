import type { Metadata, Viewport } from "next";
import { Pacifico, Poppins } from "next/font/google";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { CartProvider } from "@/components/cart/CartProvider";
import { BackToTop } from "@/components/layout/BackToTop";
import { FlashSaleBar } from "@/components/layout/FlashSaleBar";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { Marquee } from "@/components/Marquee";
import { TOP_TICKER } from "@/lib/store";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
});

const script = Pacifico({ variable: "--font-script-face", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: { default: "AkatsukiZipUp", template: "%s – AkatsukiZipUp" },
  description: "Akatsuki Mask Hoodie: the zip-up hoodie with the red clouds and a built-in mask. Free worldwide shipping.",
  icons: { icon: "/store/logo.jpg" },
};

export const viewport: Viewport = {
  themeColor: "#a70317",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} ${script.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <CartProvider>
          <FlashSaleBar />
          <div className="bg-brand py-2.5 text-white">
            <Marquee speed={28} gap="gap-14">
              {TOP_TICKER.map((t) => (
                <span key={t} className="whitespace-nowrap text-[13px] font-semibold">
                  {t}
                </span>
              ))}
            </Marquee>
          </div>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <CartDrawer />
          <BackToTop />
        </CartProvider>
      </body>
    </html>
  );
}
