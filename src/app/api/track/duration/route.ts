import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp, fail, rateLimit, readJson, sameOrigin } from "@/lib/http";
import { VIEW_ID_RE, clampDurationMs, isLikelyBot, readVisitorId } from "@/lib/visitor";

export const dynamic = "force-dynamic";

const schema = z.object({
  viewId: z.string().regex(VIEW_ID_RE),
  ms: z.number(),
});

/**
 * The "time on page" beacon (navigator.sendBeacon) for one view. It carries the running total of *visible*
 * time, so a repeat or late beacon is harmless: GREATEST never walks the number back. It only ever updates a
 * view that belongs to the caller's own visitor cookie, so a leaked viewId is a no-op for anyone else.
 */
export async function POST(req: NextRequest) {
  if (isLikelyBot(req.headers.get("user-agent"))) return NextResponse.json({ ok: true, ignored: "bot" });
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  const visitorId = readVisitorId(req);
  if (!visitorId) return NextResponse.json({ ok: true, ignored: "no-visitor" });
  if (!(await rateLimit(`track:${clientIp(req)}`, 120, 60))) return fail("Too many requests.", 429);

  const parsed = await readJson(req, schema, 1_000);
  if ("response" in parsed) return parsed.response;
  const ms = clampDurationMs(parsed.data.ms);
  if (ms === null) return NextResponse.json({ ok: true, ignored: "duration" });

  try {
    // One statement: bank the time, and mark the visitor as seen now (so "live now" includes readers).
    await prisma.$executeRaw`
      WITH pv AS (
        UPDATE "PageView" SET "durationMs" = GREATEST(COALESCE("durationMs", 0), ${ms}::int)
        WHERE "viewId" = ${parsed.data.viewId} AND "visitorId" = ${visitorId}
        RETURNING "visitorId"
      )
      UPDATE "Visitor" SET "lastSeenAt" = ${new Date()} WHERE "id" IN (SELECT "visitorId" FROM pv)`;
  } catch (err) {
    console.error("[track/duration]", err);
  }
  return NextResponse.json({ ok: true });
}
