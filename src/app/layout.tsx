import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://hoodies-psi.vercel.app"),
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

// Root: fonts and <html> only. The storefront chrome lives in (store)/layout.tsx, the admin's in admin/layout.tsx.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
