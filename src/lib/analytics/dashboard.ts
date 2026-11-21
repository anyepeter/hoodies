import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { periodRange, utcMidnight } from "./period";
import { loadTraffic, trafficSql } from "./traffic";

/*
 * The numbers on Admin → Dashboard. A handful of aggregate queries in parallel (one per table), so a refresh
 * stays cheap. Revenue counts orders that are PAID, SHIPPED or DELIVERED, by the day they were placed.
 * Visitors are "Real people" (see ./traffic.ts), the same default as Admin → Analytics.
 */

export interface Dashboard {
  revenue30: number;
  revenuePrev30: number;
  revenueToday: number;
  ordersToday: number;
  orders7: number;
  orders30: number;
  pending: number;
  pendingValue: number;
  visitorsToday: number;
  visitors7: number;
  visitors30: number;
  viewsToday: number;
  liveNow: number;
  unreadChats: number;
  unreadMessages: number;
  messagesToday: number;
  subscribersToday: number;
  stock: { style: string; stock: number }[];
  recentOrders: { id: string; number: number; name: string; total: number; status: string; createdAt: Date }[];
  recentMessages: { id: string; name: string | null; email: string; body: string; status: string; createdAt: Date }[];
}

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export async function loadDashboard(): Promise<Dashboard> {
  const now = new Date();
  const today = utcMidnight(now);
  const week = utcMidnight(now, 6);
  const r30 = periodRange("30d", now);
  const live = new Date(now.getTime() - 5 * 60_000);

  const [orders, misc, stock, recentOrders, recentMessages, visitors] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        COALESCE(SUM("total") FILTER (WHERE "status" IN ('PAID','SHIPPED','DELIVERED') AND "createdAt" >= ${r30.start}), 0)::float8 AS rev30,
        COALESCE(SUM("total") FILTER (WHERE "status" IN ('PAID','SHIPPED','DELIVERED') AND "createdAt" >= ${r30.prevStart} AND "createdAt" < ${r30.prevEnd}), 0)::float8 AS revprev,
        COALESCE(SUM("total") FILTER (WHERE "status" IN ('PAID','SHIPPED','DELIVERED') AND "createdAt" >= ${today}), 0)::float8 AS revtoday,
        COUNT(*) FILTER (WHERE "createdAt" >= ${today})::int AS today,
        COUNT(*) FILTER (WHERE "createdAt" >= ${week})::int AS week,
        COUNT(*) FILTER (WHERE "createdAt" >= ${r30.start})::int AS month,
        COUNT(*) FILTER (WHERE "status" = 'PENDING')::int AS pending,
        COALESCE(SUM("total") FILTER (WHERE "status" = 'PENDING'), 0)::float8 AS pendingvalue
      FROM "Order"
      WHERE "createdAt" >= ${r30.prevStart} OR "status" = 'PENDING'`,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        (SELECT COUNT(*) FROM "Conversation" WHERE "unreadForAdmin" > 0 AND "status" = 'OPEN')::int AS chats,
        (SELECT COUNT(*) FROM "ContactMessage" WHERE "status" = 'UNREAD')::int AS messages,
        (SELECT COUNT(*) FROM "ContactMessage" WHERE "createdAt" >= ${today})::int AS messagestoday,
        (SELECT COUNT(*) FROM "Subscriber" WHERE "status" = 'SUBSCRIBED' AND "createdAt" >= ${today})::int AS substoday`,
    prisma.styleStock.findMany({ orderBy: { style: "asc" }, select: { style: true, stock: true } }),
    prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { id: true, number: true, name: true, total: true, status: true, createdAt: true } }),
    prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { id: true, name: true, email: true, body: true, status: true, createdAt: true } }),
    loadTraffic().then(({ botIds }) => {
      const onPv = trafficSql("people", botIds, Prisma.sql`"visitorId"`);
      const onV = trafficSql("people", botIds, Prisma.sql`v."id"`);
      return prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT
          COUNT(DISTINCT "visitorId") FILTER (WHERE "createdAt" >= ${today})::int AS today,
          COUNT(DISTINCT "visitorId") FILTER (WHERE "createdAt" >= ${week})::int AS week,
          COUNT(DISTINCT "visitorId")::int AS month,
          COUNT(*) FILTER (WHERE "createdAt" >= ${today})::int AS viewstoday,
          (SELECT COUNT(*) FROM "Visitor" v WHERE v."lastSeenAt" >= ${live}${onV})::int AS live
        FROM "PageView"
        WHERE "createdAt" >= ${r30.start}${onPv}`;
    }),
  ]);

  const o = orders[0] ?? {};
  const m = misc[0] ?? {};
  const v = visitors[0] ?? {};
  return {
    revenue30: n(o.rev30),
    revenuePrev30: n(o.revprev),
    revenueToday: n(o.revtoday),
    ordersToday: n(o.today),
    orders7: n(o.week),
    orders30: n(o.month),
    pending: n(o.pending),
    pendingValue: n(o.pendingvalue),
    visitorsToday: n(v.today),
    visitors7: n(v.week),
    visitors30: n(v.month),
    viewsToday: n(v.viewstoday),
    liveNow: n(v.live),
    unreadChats: n(m.chats),
    unreadMessages: n(m.messages),
    messagesToday: n(m.messagestoday),
    subscribersToday: n(m.substoday),
    stock,
    recentOrders: recentOrders.map((r) => ({ ...r, total: Number(r.total) })),
    recentMessages,
  };
}
