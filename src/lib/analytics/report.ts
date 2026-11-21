import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DAY_MS, type Range } from "./period";
import { trafficSql, type TrafficMode } from "./traffic";

/*
 * Everything Admin → Analytics shows, read in parallel. Each block is one aggregate query over PageView
 * (indexed on createdAt) for the period; the traffic filter is applied in SQL.
 */

export interface Bucket {
  key: string;
  label: string;
  views: number;
  visitors: number;
}

export interface Report {
  views: number;
  visitors: number;
  newVisitors: number;
  avgMs: number | null;
  timedViews: number;
  prev: { views: number; visitors: number; avgMs: number | null };
  series: Bucket[];
  topPages: { path: string; views: number; visitors: number; avgMs: number | null }[];
  countries: { code: string | null; visitors: number }[];
  devices: { device: string | null; visitors: number }[];
  referrers: { host: string; visitors: number; views: number }[];
  live: { id: string; path: string; countryCode: string | null; device: string | null; email: string | null }[];
  recent: {
    id: string;
    countryCode: string | null;
    city: string | null;
    device: string | null;
    email: string | null;
    referrer: string | null;
    firstSeenAt: Date;
    lastSeenAt: Date;
    views: number;
    ms: number;
  }[];
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export async function loadReport(range: Range, mode: TrafficMode, botIds: string[]): Promise<Report> {
  const { start, prevStart, prevEnd } = range;
  const onPv = trafficSql(mode, botIds, Prisma.sql`"visitorId"`);
  const onPvAlias = trafficSql(mode, botIds, Prisma.sql`pv."visitorId"`);
  const onV = trafficSql(mode, botIds, Prisma.sql`v."id"`);
  const unit = range.hourly ? "hour" : "day";
  const liveSince = new Date(Date.now() - 5 * 60_000);

  const [kpi, newV, series, pages, countries, devices, referrers, live, recent] = await Promise.all([
    prisma.$queryRaw<{ views: number; visitors: number; avgms: number | null; timed: number; pviews: number; pvisitors: number; pavgms: number | null }[]>`
      SELECT COUNT(*) FILTER (WHERE "createdAt" >= ${start})::int AS views,
             COUNT(DISTINCT "visitorId") FILTER (WHERE "createdAt" >= ${start})::int AS visitors,
             AVG("durationMs") FILTER (WHERE "createdAt" >= ${start} AND "durationMs" > 0)::float8 AS avgms,
             COUNT(*) FILTER (WHERE "createdAt" >= ${start} AND "durationMs" > 0)::int AS timed,
             COUNT(*) FILTER (WHERE "createdAt" < ${prevEnd})::int AS pviews,
             COUNT(DISTINCT "visitorId") FILTER (WHERE "createdAt" < ${prevEnd})::int AS pvisitors,
             AVG("durationMs") FILTER (WHERE "createdAt" < ${prevEnd} AND "durationMs" > 0)::float8 AS pavgms
      FROM "PageView"
      WHERE "createdAt" >= ${prevStart}${onPv}`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM "Visitor" v WHERE v."firstSeenAt" >= ${start}${onV}`,
    prisma.$queryRaw<{ bucket: Date; views: number; visitors: number }[]>`
      SELECT date_trunc(${unit}, "createdAt") AS bucket, COUNT(*)::int AS views, COUNT(DISTINCT "visitorId")::int AS visitors
      FROM "PageView"
      WHERE "createdAt" >= ${start}${onPv}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ path: string; views: number; visitors: number; avgms: number | null }[]>`
      SELECT "path", COUNT(*)::int AS views, COUNT(DISTINCT "visitorId")::int AS visitors,
             AVG("durationMs") FILTER (WHERE "durationMs" > 0)::float8 AS avgms
      FROM "PageView"
      WHERE "createdAt" >= ${start}${onPv}
      GROUP BY "path" ORDER BY views DESC, "path" LIMIT 10`,
    prisma.$queryRaw<{ code: string | null; visitors: number }[]>`
      SELECT v."countryCode" AS code, COUNT(DISTINCT v."id")::int AS visitors
      FROM "PageView" pv JOIN "Visitor" v ON v."id" = pv."visitorId"
      WHERE pv."createdAt" >= ${start}${onPvAlias}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
    prisma.$queryRaw<{ device: string | null; visitors: number }[]>`
      SELECT v."device" AS device, COUNT(DISTINCT v."id")::int AS visitors
      FROM "PageView" pv JOIN "Visitor" v ON v."id" = pv."visitorId"
      WHERE pv."createdAt" >= ${start}${onPvAlias}
      GROUP BY 1 ORDER BY 2 DESC`,
    prisma.$queryRaw<{ host: string; visitors: number; views: number }[]>`
      SELECT "referrer" AS host, COUNT(DISTINCT "visitorId")::int AS visitors, COUNT(*)::int AS views
      FROM "PageView"
      WHERE "createdAt" >= ${start} AND "referrer" IS NOT NULL${onPv}
      GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 10`,
    prisma.$queryRaw<Report["live"]>`
      SELECT DISTINCT ON (pv."visitorId") pv."visitorId" AS id, pv."path", v."countryCode", v."device", v."email"
      FROM "Visitor" v JOIN "PageView" pv ON pv."visitorId" = v."id"
      WHERE v."lastSeenAt" >= ${liveSince} AND pv."createdAt" >= ${new Date(Date.now() - DAY_MS)}${onV}
      ORDER BY pv."visitorId", pv."createdAt" DESC
      LIMIT 50`,
    prisma.$queryRaw<Report["recent"]>`
      SELECT v."id", v."countryCode", v."city", v."device", v."email", v."referrer", v."firstSeenAt", v."lastSeenAt",
             COUNT(pv."id")::int AS views, COALESCE(SUM(pv."durationMs"), 0)::float8 AS ms
      FROM "Visitor" v JOIN "PageView" pv ON pv."visitorId" = v."id" AND pv."createdAt" >= ${start}
      WHERE v."lastSeenAt" >= ${start}${onV}
      GROUP BY v."id"
      ORDER BY v."lastSeenAt" DESC
      LIMIT 25`,
  ]);

  const k = kpi[0];
  const byKey = new Map(series.map((r) => [bucketKey(r.bucket, range.hourly), r]));
  const buckets: Bucket[] = [];
  const count = range.hourly ? 24 : range.days;
  for (let i = 0; i < count; i++) {
    const at = new Date(range.start.getTime() + i * (range.hourly ? 3_600_000 : DAY_MS));
    const key = bucketKey(at, range.hourly);
    const row = byKey.get(key);
    buckets.push({
      key,
      label: range.hourly
        ? `${String(at.getUTCHours()).padStart(2, "0")}:00`
        : at.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
      views: num(row?.views),
      visitors: num(row?.visitors),
    });
  }

  return {
    views: num(k?.views),
    visitors: num(k?.visitors),
    newVisitors: num(newV[0]?.n),
    avgMs: k?.avgms ?? null,
    timedViews: num(k?.timed),
    prev: { views: num(k?.pviews), visitors: num(k?.pvisitors), avgMs: k?.pavgms ?? null },
    series: buckets,
    topPages: pages.map((p) => ({ path: p.path, views: num(p.views), visitors: num(p.visitors), avgMs: p.avgms })),
    countries: countries.map((c) => ({ code: c.code, visitors: num(c.visitors) })),
    devices: devices.map((d) => ({ device: d.device, visitors: num(d.visitors) })),
    referrers: referrers.map((r) => ({ host: r.host, visitors: num(r.visitors), views: num(r.views) })),
    live,
    recent: recent.map((r) => ({ ...r, views: num(r.views), ms: num(r.ms) })),
  };
}

function bucketKey(d: Date, hourly: boolean): string {
  return d.toISOString().slice(0, hourly ? 13 : 10);
}
