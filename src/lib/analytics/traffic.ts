import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/*
 * "Real people" vs "All traffic" — the Bourbon idea, simplified.
 *
 * Crawlers that name themselves (Googlebot, curl, Playwright's default agent...) are rejected before they are
 * stored (isLikelyBot in src/lib/visitor.ts). What gets through sends a real browser's user agent, so one row
 * looks exactly like a person. What gives it away is the shape of the traffic, so the rule reads that:
 *
 *   A visitor counts as AUTOMATED when they never gave an email AND never banked a single millisecond of
 *   visible time on any page, AND at least one of these is true:
 *     1. "Not a browser"   — the user agent has no browser token at all (no Mozilla/WebKit/Gecko/Chrome...).
 *     2. "No page"         — a visitor row with no page view (only a direct call to the API can do that).
 *     3. "Crowd"           — 8 or more visitors share one byte-identical user agent and none of them ever
 *                             banked time or gave an email; each of them has at most 2 page views.
 *
 *   Everyone else is a real person. An email or measured time always wins: a stripped user agent from a
 *   privacy browser that then read a page for 10 seconds is a person. When unsure, we count them as human:
 *   counting a bot inflates a number, but dropping a customer deletes a real person from the owner's view.
 *
 * One SQL query over all visitors (small table, admin-only page, no caching: a stale list is worse).
 */

export type TrafficMode = "people" | "all";
export const DEFAULT_TRAFFIC: TrafficMode = "people";
export const parseTraffic = (v: unknown): TrafficMode => (v === "all" ? "all" : "people");

export const CROWD_MIN = 8;
export const CROWD_MAX_VIEWS = 2;

export type BotReason = "not-a-browser" | "no-page" | "crowd";
export const BOT_REASON_LABEL: Record<BotReason, string> = {
  "not-a-browser": "Not a browser",
  "no-page": "No page view",
  crowd: "Identical-agent crowd",
};

export interface Traffic {
  botIds: string[];
  reasonById: Map<string, BotReason>;
  byReason: Record<BotReason, number>;
  total: number;
  bots: number;
  people: number;
}

export async function loadTraffic(): Promise<Traffic> {
  const [rows, totals] = await Promise.all([
    prisma.$queryRaw<{ id: string; reason: BotReason }[]>`
      WITH s AS (
        SELECT v."id", v."userAgent" AS ua, (v."email" IS NOT NULL) AS identified,
               COUNT(pv."id")::int AS views,
               COUNT(pv."id") FILTER (WHERE pv."durationMs" > 0)::int AS timed
        FROM "Visitor" v
        LEFT JOIN "PageView" pv ON pv."visitorId" = v."id"
        GROUP BY v."id"
      ),
      crowds AS (
        SELECT ua FROM s WHERE ua IS NOT NULL AND ua <> ''
        GROUP BY ua
        HAVING COUNT(*) >= ${CROWD_MIN} AND bool_and(NOT identified AND timed = 0)
      )
      SELECT s."id",
             CASE
               WHEN COALESCE(s.ua, '') !~* '(mozilla/|applewebkit|gecko|trident|presto|chrome|safari|firefox|opera|edg)' THEN 'not-a-browser'
               WHEN s.views = 0 THEN 'no-page'
               ELSE 'crowd'
             END AS reason
      FROM s
      WHERE NOT s.identified AND s.timed = 0 AND (
        COALESCE(s.ua, '') !~* '(mozilla/|applewebkit|gecko|trident|presto|chrome|safari|firefox|opera|edg)'
        OR s.views = 0
        OR (s.ua IN (SELECT ua FROM crowds) AND s.views <= ${CROWD_MAX_VIEWS})
      )`,
    prisma.visitor.count(),
  ]);
  const reasonById = new Map(rows.map((r) => [r.id, r.reason]));
  const byReason: Record<BotReason, number> = { "not-a-browser": 0, "no-page": 0, crowd: 0 };
  for (const r of rows) byReason[r.reason]++;
  return { botIds: rows.map((r) => r.id), reasonById, byReason, total: totals, bots: rows.length, people: Math.max(0, totals - rows.length) };
}

/**
 * The filter as a SQL fragment to append inside a WHERE clause (`column` is the visitor-id column of the table
 * being read). Array binding: one parameter, and `= ANY('{}')` is valid where `IN ()` is not.
 */
export function trafficSql(mode: TrafficMode, botIds: string[], column: Prisma.Sql): Prisma.Sql {
  if (mode === "all" || botIds.length === 0) return Prisma.empty;
  return Prisma.sql` AND NOT (${column} = ANY(${botIds}::text[]))`;
}
