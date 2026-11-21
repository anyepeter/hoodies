// The admin's installable app ("Add to Home Screen" / "Install app"). Linked from src/app/admin/layout.tsx;
// src/proxy.ts lets it load signed out, because browsers fetch manifests without credentials.
//
// Scope is "/admin" rather than "/admin/": a manifest's start_url must lie inside its scope, and "/admin" is not
// inside "/admin/" (scope matching is a plain prefix test), so browsers would throw "/admin/" away and fall back
// to "/" — the whole store. "/admin" covers /admin and every page under it.

export const dynamic = "force-static";

const manifest = {
  id: "/admin",
  name: "AkatsukiZipUp Admin",
  short_name: "AKZ Admin",
  description: "Orders, live chat and messages for the AkatsukiZipUp store.",
  start_url: "/admin",
  scope: "/admin",
  display: "standalone",
  orientation: "portrait",
  background_color: "#121212",
  theme_color: "#121212",
  icons: [
    { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
  ],
};

export function GET() {
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8" },
  });
}
