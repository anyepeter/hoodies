import "server-only";
import type { NextRequest, NextResponse } from "next/server";

/*
 * Who is browsing: one anonymous cookie per browser, plus the small helpers the tracking endpoints share.
 * Ported from the Bourbon store (src/lib/visitor.ts there), trimmed to what this schema stores.
 *
 * The cookie is httpOnly, so only the server reads it. Other modules (orders, chat, newsletter, contact)
 * link their rows to the visitor with `readVisitorId()`; only the tracking endpoint ever mints one.
 */

export const VISITOR_COOKIE = "akz_vid";
const ONE_YEAR = 60 * 60 * 24 * 365;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The visitor id from the request's cookie, or null when missing or not one we minted. */
export function readVisitorId(req: NextRequest): string | null {
  const v = req.cookies.get(VISITOR_COOKIE)?.value;
  return v && UUID_RE.test(v) ? v.toLowerCase() : null;
}

/** Reads the visitor cookie, or mints one and sets it on `res`. */
export function getOrSetVisitorId(req: NextRequest, res: NextResponse): string {
  const existing = readVisitorId(req);
  if (existing) return existing;
  const id = crypto.randomUUID();
  res.cookies.set(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return id;
}

/* ---- Time on page ------------------------------------------------------------------------------------- */

/** One page view banks at most 30 minutes. Longer is a tab left visible on a second screen, not reading. */
export const MAX_PAGE_VIEW_MS = 30 * 60 * 1000;

/** Durations come from the browser, so they are untrusted: a finite whole number in [0, 30 min], else null. */
export function clampDurationMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const ms = Math.round(value);
  if (ms <= 0) return null;
  return Math.min(ms, MAX_PAGE_VIEW_MS);
}

/** The client-made id of one page view. Only short opaque tokens get anywhere near SQL or the admin. */
export const VIEW_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/* ---- What the browser sent ---------------------------------------------------------------------------- */

/*
 * Pages whose URL holds a secret: /order/<token> and /invoice/<token> (the token is the only key to that
 * customer's order and address). They are stored and shown as "/order/[token]", never with the token.
 */
const SECRET_PATHS: [RegExp, string][] = [
  [/^\/order\/[^/]+/i, "/order/[token]"],
  [/^\/invoice\/[^/]+/i, "/invoice/[token]"],
];

/**
 * A same-site pathname only: no protocol-relative or absolute URLs, no query or hash (so nothing from a
 * /checkout?… query string is ever kept), never /admin or /api, and order/invoice tokens collapsed.
 */
export function normalizePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  const path = raw.split(/[?#]/)[0]!;
  if (path.length > 300) return null;
  if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/")) return null;
  for (const [re, replacement] of SECRET_PATHS) if (re.test(path)) return replacement;
  return path;
}

/** "google.com" from "https://www.google.com/search?q=…", or null for no referrer or our own site. */
export function externalReferrerHost(referrer: unknown, ownHost: string | null): string | null {
  if (typeof referrer !== "string" || !referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const own = (ownHost ?? "").split(":")[0]!.toLowerCase().replace(/^www\./, "");
    if (!host || host === own) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

/** Coarse device from the user agent. It exists to give the admin context, not to fingerprint anyone. */
export function deviceFromUa(ua: string): "mobile" | "tablet" | "desktop" {
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile/.test(s)) return "mobile";
  return "desktop";
}

/** Geo from Vercel's request headers (free, no lookup). Empty locally. */
export function geoFromHeaders(headers: Headers): { countryCode: string | null; country: string | null; region: string | null; city: string | null } {
  const code = headers.get("x-vercel-ip-country")?.trim().toUpperCase() ?? "";
  const countryCode = /^[A-Z]{2}$/.test(code) ? code : null;
  const region = headers.get("x-vercel-ip-country-region")?.trim().slice(0, 20) || null;
  let city: string | null = headers.get("x-vercel-ip-city")?.trim() || null;
  if (city) {
    try {
      city = decodeURIComponent(city);
    } catch {
      /* keep the raw value */
    }
    city = city.slice(0, 100);
  }
  return { countryCode, country: countryName(countryCode), region, city };
}

/* ---- Bots --------------------------------------------------------------------------------------------- */

/*
 * Rejected at the door by both tracking endpoints: anything whose user agent names a crawler, an automation
 * driver, a monitor or a plain HTTP client. Deliberately NOT matched: in-app browsers (Instagram, WhatsApp,
 * FBAV, Pinterest...) because those are customers who tapped a link. A false negative costs one inflated row;
 * a false positive silently deletes a customer from the numbers. Bots that send a real Chrome user agent get
 * past this; the "Real people" filter on the analytics page (src/lib/analytics/traffic.ts) handles those.
 */
const BOT_UA_PATTERNS = [
  "bot", "crawl", "spider", "slurp", "scrape",
  "headless", "phantomjs", "puppeteer", "playwright", "selenium", "webdriver", "cypress", "prerender",
  "lighthouse", "pagespeed", "gtmetrix", "pingdom", "uptime", "statuscake", "site24x7", "newrelic", "datadog", "checkly", "monitoring",
  "curl/", "wget", "python-requests", "python-urllib", "aiohttp", "httpx", "node-fetch", "undici", "axios", "okhttp", "go-http-client",
  "java/", "libwww-perl", "httpclient", "postmanruntime", "insomnia", "guzzle",
  "facebookexternalhit", "meta-externalagent", "google-inspectiontool", "googleother", "chatgpt-user", "oai-search",
  "anthropic-ai", "perplexity", "skypeuripreview", "embedly", "preview", "ia_archiver", "feedfetcher", "feedly",
];
const BOT_UA_RE = new RegExp(BOT_UA_PATTERNS.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // a browser always sends one
  return BOT_UA_RE.test(userAgent);
}

/* ---- Display ------------------------------------------------------------------------------------------ */

let regionNames: Intl.DisplayNames | null | undefined;
/** "United States" for "US", or null. */
export function countryName(code: string | null | undefined): string | null {
  if (!code || !/^[A-Z]{2}$/i.test(code)) return null;
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** 🇺🇸 for "US"; a globe when unknown. */
export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Z]{2}$/i.test(code)) return "🌐";
  const base = 0x1f1e6 - 65;
  const up = code.toUpperCase();
  return String.fromCodePoint(up.charCodeAt(0) + base, up.charCodeAt(1) + base);
}

/** "48s", "4m 12s", "1h 06m"; null when nothing was measured (show "—", not "0s"). */
export function formatDuration(ms: number | null | undefined): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  if (total < 60) return `${Math.max(1, total)}s`;
  const m = Math.floor(total / 60);
  if (m < 60) return `${m}m ${String(total % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** A short readable handle for an anonymous visitor: "Visitor 4F2A1B". */
export function visitorLabel(id: string): string {
  return `Visitor ${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}
