import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/admin-auth";

/*
 * The three layers of the admin guard:
 *   1. src/proxy.ts       — redirects/401s anyone without a valid cookie (fast, optimistic)
 *   2. requireAdminPage() — every admin page/layout re-checks on the server
 *   3. requireAdminApi() / assertAdmin() — every admin route handler and server action re-checks
 * The proxy alone is never trusted: Next.js says it's for optimistic checks only.
 */

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifySessionToken(jar.get(ADMIN_COOKIE)?.value);
}

/** For admin pages and layouts: sends anyone who isn't signed in to the login page. */
export async function requireAdminPage(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

/** For /api/admin route handlers: `const denied = await requireAdminApi(); if (denied) return denied;` */
export async function requireAdminApi(): Promise<NextResponse | null> {
  if (await isAdmin()) return null;
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

/** For server actions: throws if the caller isn't the admin. */
export async function assertAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Unauthorized");
}
