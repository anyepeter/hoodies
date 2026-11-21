import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { prisma } from "@/lib/db";

/*
 * The API contract every route handler follows:
 *   success → { ok: true, ...data }            (status 200/201)
 *   failure → { ok: false, error: "plain sentence" } (status 4xx/5xx)
 * Order of checks in a write handler: sameOrigin → rate limit → auth (admin routes) → validate → work.
 * Never return stack traces, SQL, or secrets in `error`.
 */

export function ok<T extends Record<string, unknown>>(data: T = {} as T, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}

export function fail(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

/**
 * CSRF guard for cookie-authenticated or state-changing POSTs: the request must come from this site.
 * Browsers always send Origin on cross-site POSTs, so a missing Origin with a matching Sec-Fetch-Site is allowed.
 */
export function sameOrigin(req: NextRequest | Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return false;
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = req.headers.get("sec-fetch-site");
  return site === "same-origin" || site === "none" || site === null;
}

/** The caller's IP (Vercel sets x-forwarded-for; the first entry is the client). */
export function clientIp(req: NextRequest | Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim().slice(0, 64);
  return req.headers.get("x-real-ip")?.slice(0, 64) ?? "unknown";
}

/**
 * Fixed-window rate limit backed by Postgres (works across serverless instances).
 * Returns true if this call is allowed. One atomic statement: no race between read and write.
 * Fails open (allows) if the database is unreachable, so an outage never locks everyone out of the store;
 * the login limiter passes failClosed so it fails safe instead.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number, opts: { failClosed?: boolean } = {}): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("key", "count", "windowStart")
      VALUES (${key}, 1, NOW())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."windowStart" < NOW() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE "RateLimit"."count" + 1 END,
        "windowStart" = CASE WHEN "RateLimit"."windowStart" < NOW() - make_interval(secs => ${windowSeconds}) THEN NOW() ELSE "RateLimit"."windowStart" END
      RETURNING "count"`;
    return (rows[0]?.count ?? 1) <= limit;
  } catch (err) {
    console.error("[rateLimit] failed for", key.split(":")[0], err);
    return !opts.failClosed;
  }
}

/** Reads a JSON body and validates it. Returns the parsed data or a ready-made 400 response. */
export async function readJson<T>(req: NextRequest | Request, schema: ZodType<T>, maxBytes = 32_000): Promise<{ data: T } | { response: NextResponse }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) return { response: fail("That request is too large.", 413) };
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > maxBytes) return { response: fail("That request is too large.", 413) };
    raw = text ? JSON.parse(text) : {};
  } catch {
    return { response: fail("Invalid request.", 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first?.path.join(".");
    return { response: fail(first ? `${field ? `${field}: ` : ""}${first.message}` : "Invalid request.", 400) };
  }
  return { data: parsed.data };
}

/** Logs an unexpected server error with context and returns a safe 500. */
export function serverError(where: string, err: unknown) {
  console.error(`[${where}]`, err);
  return fail("Something went wrong on our side. Please try again.", 500);
}
