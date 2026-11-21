// Admin sessions: one shared password (ADMIN_PASSWORD), a signed, expiring cookie (ADMIN_SESSION_SECRET).
// Web Crypto only, so the same code runs in src/proxy.ts and in route handlers.
//
// Token = "v1.<exp>.<sig>", sig = HMAC-SHA256(secret, "v1.<exp>.<password fingerprint>").
// The password fingerprint is part of what's signed, so changing ADMIN_PASSWORD signs everyone out;
// rotating ADMIN_SESSION_SECRET does too.

export const ADMIN_COOKIE = "hoodies_admin";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", enc.encode(text));
}

/** Constant-time comparison of two equal-purpose strings (lengths may differ). */
function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function config(): { password: string; secret: string } | null {
  const password = process.env.ADMIN_PASSWORD ?? "";
  const secret = process.env.ADMIN_SESSION_SECRET ?? "";
  // Refuse to run with missing or trivially short secrets rather than "work" insecurely.
  if (password.length < 12 || secret.length < 32) return null;
  return { password, secret };
}

export function adminConfigured(): boolean {
  return config() !== null;
}

async function sign(exp: number, cfg: { password: string; secret: string }): Promise<string> {
  const fingerprint = b64url(await sha256(`hoodies-admin:${cfg.password}`)).slice(0, 22);
  const key = await crypto.subtle.importKey("raw", enc.encode(cfg.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(`v1.${exp}.${fingerprint}`)));
}

/** A fresh session token, valid for SESSION_DAYS. Null if the server isn't configured. */
export async function createSessionToken(): Promise<string | null> {
  const cfg = config();
  if (!cfg) return null;
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400;
  return `v1.${exp}.${await sign(exp, cfg)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  const cfg = config();
  if (!cfg || !token) return false;
  const [v, expStr, sig] = token.split(".");
  if (v !== "v1" || !expStr || !sig || !/^\d{9,11}$/.test(expStr)) return false;
  const exp = Number(expStr);
  if (exp < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(sig, await sign(exp, cfg));
}

/** Checks a typed password against ADMIN_PASSWORD in constant time (both hashed first). */
export async function checkAdminPassword(input: string): Promise<boolean> {
  const cfg = config();
  if (!cfg || typeof input !== "string" || input.length > 200) return false;
  const [a, b] = await Promise.all([sha256(input), sha256(cfg.password)]);
  return safeEqual(b64url(a), b64url(b));
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 86_400,
};
