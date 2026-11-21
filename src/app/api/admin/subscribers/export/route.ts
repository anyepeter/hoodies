import type { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin-session";
import { csvCell, parseSearch, parseSubscriberFilter, subscriberWhere } from "@/lib/analytics/subscribers";
import { prisma } from "@/lib/db";
import { serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** CSV of the list as currently filtered in Admin → Subscribers (?status=&q=). */
export async function GET(req: NextRequest) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const filter = parseSubscriberFilter(req.nextUrl.searchParams.get("status"));
  const q = parseSearch(req.nextUrl.searchParams.get("q"));
  try {
    const rows = await prisma.subscriber.findMany({
      where: subscriberWhere(filter, q),
      orderBy: { createdAt: "desc" },
      select: { email: true, status: true, source: true, createdAt: true, updatedAt: true },
      take: 50_000,
    });
    const lines = [
      ["email", "status", "source", "subscribed_at", "updated_at"].map(csvCell).join(","),
      ...rows.map((s) => [s.email, s.status.toLowerCase(), s.source, s.createdAt.toISOString(), s.updatedAt.toISOString()].map(csvCell).join(",")),
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(lines.join("\r\n") + "\r\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="subscribers-${filter}-${stamp}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return serverError("admin/subscribers export", err);
  }
}
