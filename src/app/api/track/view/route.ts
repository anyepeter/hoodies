import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp, fail, rateLimit, readJson, sameOrigin } from "@/lib/http";
import { VIEW_ID_RE, deviceFromUa, externalReferrerHost, geoFromHeaders, getOrSetVisitorId, isLikelyBot, normalizePath } from "@/lib/visitor";

export const dynamic = "force-dynamic";

const schema = z.object({
  path: z.string().max(2000),
  referrer: z.string().max(2000).optional(),
  viewId: z.string().regex(VIEW_ID_RE),
});

/**
 * One page view from <VisitTracker />. Two queries: the rate limit, then one statement that upserts the
 * visitor and inserts the view. Always answers ok so the browser never retries.
 */
export async function POST(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? "";
  if (isLikelyBot(ua)) return NextResponse.json({ ok: true, ignored: "bot" });
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  // 30 a minute and 1,000 a day per connection: plenty for a real shopper, and a cap on how much a script can
  // write into the database (it's a free-tier Postgres; a full disk would stop orders too).
  const ip = clientIp(req);
  if (!(await rateLimit(`track:${ip}`, 30, 60)) || !(await rateLimit(`track-day:${ip}`, 1000, 86_400))) return fail("Too many requests.", 429);

  const parsed = await readJson(req, schema, 4_000);
  if ("response" in parsed) return parsed.response;
  const path = normalizePath(parsed.data.path);
  if (!path) return NextResponse.json({ ok: true, ignored: "path" });

  const res = NextResponse.json({ ok: true });
  const visitorId = getOrSetVisitorId(req, res);
  const geo = geoFromHeaders(req.headers);
  const ref = externalReferrerHost(parsed.data.referrer, req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  const now = new Date();

  try {
    // Geo, device and referrer keep their first known value: "where this visitor came from".
    await prisma.$executeRaw`
      WITH v AS (
        INSERT INTO "Visitor" ("id", "country", "countryCode", "region", "city", "userAgent", "device", "referrer", "firstSeenAt", "lastSeenAt")
        VALUES (${visitorId}, ${geo.country}, ${geo.countryCode}, ${geo.region}, ${geo.city}, ${ua.slice(0, 500)}, ${deviceFromUa(ua)}, ${ref}, ${now}, ${now})
        ON CONFLICT ("id") DO UPDATE SET
          "lastSeenAt"  = EXCLUDED."lastSeenAt",
          "referrer"    = COALESCE("Visitor"."referrer", EXCLUDED."referrer"),
          "country"     = COALESCE("Visitor"."country", EXCLUDED."country"),
          "countryCode" = COALESCE("Visitor"."countryCode", EXCLUDED."countryCode"),
          "region"      = COALESCE("Visitor"."region", EXCLUDED."region"),
          "city"        = COALESCE("Visitor"."city", EXCLUDED."city"),
          "userAgent"   = COALESCE("Visitor"."userAgent", EXCLUDED."userAgent"),
          "device"      = COALESCE("Visitor"."device", EXCLUDED."device")
        RETURNING "id"
      )
      INSERT INTO "PageView" ("id", "visitorId", "path", "referrer", "viewId", "createdAt")
      SELECT ${crypto.randomUUID()}, v."id", ${path}, ${ref}, ${parsed.data.viewId}, ${now} FROM v
      ON CONFLICT ("viewId") DO NOTHING`;
  } catch (err) {
    // Analytics must never cost the shopper anything: log it and answer ok.
    console.error("[track/view]", err);
  }
  return res;
}
