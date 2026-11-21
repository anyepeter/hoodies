"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminConfigured, checkAdminPassword, createSessionToken, sessionCookieOptions } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/http";

export type LoginState = { error?: string };

/** Only same-site admin paths are allowed as a post-login destination (no open redirects). */
function safeFrom(from: FormDataEntryValue | null): string {
  const v = typeof from === "string" ? from : "";
  return /^\/admin(\/[A-Za-z0-9/_\-?=&.]*)?$/.test(v) && !v.startsWith("//") ? v : "/admin";
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (!adminConfigured()) return { error: "The admin password isn't set up on the server yet." };

  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
  // 8 tries per 15 minutes per IP, and fail closed: if we can't count, we don't allow.
  if (!(await rateLimit(`login:${ip}`, 8, 15 * 60, { failClosed: true }))) {
    return { error: "Too many attempts. Wait 15 minutes and try again." };
  }

  const password = form.get("password");
  if (typeof password !== "string" || !(await checkAdminPassword(password))) {
    // Same message whether the password is wrong or missing; a small delay blunts guessing.
    await new Promise((r) => setTimeout(r, 400));
    return { error: "That password isn't right." };
  }

  const token = await createSessionToken();
  if (!token) return { error: "The admin password isn't set up on the server yet." };
  // A good sign-in clears the counter, so only failed guesses ever add up to a lock-out.
  await prisma.rateLimit.delete({ where: { key: `login:${ip}` } }).catch(() => {});
  (await cookies()).set(ADMIN_COOKIE, token, sessionCookieOptions);
  redirect(safeFrom(form.get("from")));
}

export async function logout(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}
