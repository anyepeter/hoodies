import type { Metadata, Viewport } from "next";
import { AdminChrome } from "./AdminChrome";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin – AkatsukiZipUp" },
  robots: { index: false, follow: false },
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, title: "AKZ Admin", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#121212" };

// Pages under /admin each call requireAdminPage() themselves (the login page can't, so the layout doesn't).
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminChrome>{children}</AdminChrome>;
}
