import { VisitTracker } from "@/components/analytics/VisitTracker";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { CartProvider } from "@/components/cart/CartProvider";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { BackToTop } from "@/components/layout/BackToTop";
import { FloatingShop } from "@/components/layout/FloatingShop";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { PromoBar } from "@/components/layout/PromoBar";

// Everything a shopper sees around a page. The admin has its own layout and none of this.
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
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
        <ChatWidget />
        <CartDrawer />
        <BackToTop />
      </CartProvider>
      <VisitTracker />
    </>
  );
}
