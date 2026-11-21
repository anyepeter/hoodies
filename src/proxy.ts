import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, adminConfigured, verifySessionToken } from "@/lib/admin-auth";

// Layer 1 of the admin guard (see src/lib/admin-session.ts). Fast and optimistic: pages and API handlers
// check again on their own.
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/admin");

  // The login page and the admin's app manifest/service worker scope must load signed out.
  if (pathname === "/admin/login" || pathname === "/admin/manifest.webmanifest") return NextResponse.next();

  if (!adminConfigured()) {
    if (isApi) return NextResponse.json({ ok: false, error: "Admin is not configured on the server." }, { status: 503 });
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "?error=unconfigured";
    return NextResponse.redirect(url);
  }

  if (await verifySessionToken(req.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next();

  if (isApi) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = pathname !== "/admin" && pathname.startsWith("/admin/") ? `?from=${encodeURIComponent(pathname)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
