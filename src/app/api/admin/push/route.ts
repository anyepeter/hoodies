import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-session";
import { deviceLabel } from "@/lib/chat/device";
import { prisma } from "@/lib/db";
import { fail, ok, readJson, sameOrigin, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

/*
 * The admin's notification devices (Admin → Notifications & app).
 *   GET    → whether push is set up on the server, and every device that turned it on
 *   POST   → this device turned notifications on: save its push subscription
 *   DELETE → { endpoint } this device turned them off
 * One device = one browser push subscription. Removing another device: DELETE /api/admin/push/<id>.
 */

const pushConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);

// Push services hand out https URLs; refusing anything else keeps the server from posting to odd places.
const Endpoint = z
  .string()
  .trim()
  .max(1000)
  .url()
  .refine((u) => u.startsWith("https://"), "Push endpoints must be https.");
const Key = z.string().trim().min(8).max(200).regex(/^[A-Za-z0-9_-]+={0,2}$/, "Invalid key.");

const SubscribeSchema = z.object({ endpoint: Endpoint, keys: z.object({ p256dh: Key, auth: Key }) });
const UnsubscribeSchema = z.object({ endpoint: Endpoint });

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const devices = await prisma.pushSubscription.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, endpoint: true, label: true, failures: true, lastUsedAt: true, createdAt: true },
    });
    return ok({
      configured: pushConfigured(),
      devices: devices.map((d) => ({ ...d, lastUsedAt: d.lastUsedAt?.toISOString() ?? null, createdAt: d.createdAt.toISOString() })),
    });
  } catch (err) {
    return serverError("push:list", err);
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  const parsed = await readJson(req, SubscribeSchema, 4_000);
  if ("response" in parsed) return parsed.response;
  const { endpoint, keys } = parsed.data;
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;
  try {
    const device = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth, userAgent, label: deviceLabel(userAgent), failures: 0 },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent, label: deviceLabel(userAgent) },
      select: { id: true, label: true },
    });
    return ok({ device }, 201);
  } catch (err) {
    return serverError("push:subscribe", err);
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  const parsed = await readJson(req, UnsubscribeSchema, 4_000);
  if ("response" in parsed) return parsed.response;
  try {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint } });
    return ok();
  } catch (err) {
    return serverError("push:unsubscribe", err);
  }
}
