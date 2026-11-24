import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/store";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "AkatsukiZipUp: the Akatsuki Mask Hoodie", template: "%s – AkatsukiZipUp" },
  description: "The zip-up hoodie with the red clouds and a built-in mask. Akatsuki or Shinobi, S to 2XL. Free worldwide shipping.",
  openGraph: { siteName: "AkatsukiZipUp", type: "website", images: [{ url: "/store/akatsuki-front.webp", width: 1600, height: 1600 }] },
};

export const viewport: Viewport = {
  themeColor: "#121212",
};

// Root: fonts and <html> only. The storefront chrome lives in (store)/layout.tsx, the admin's in admin/layout.tsx.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
