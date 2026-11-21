import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/db";

/*
 * Web push to the admin's devices (phone, laptop) that turned notifications on in Admin → Notifications.
 * Subscriptions the push service says are gone (404/410) are deleted; others get a failure count.
 */

let configured: boolean | undefined;
function ready(): boolean {
  if (configured !== undefined) return configured;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  configured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
  if (configured) webpush.setVapidDetails(VAPID_SUBJECT!, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  return configured;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Where tapping the notification goes, e.g. "/admin/orders/abc". */
  url: string;
  /** Same tag replaces an earlier notification instead of stacking (e.g. one per conversation). */
  tag?: string;
}

/** Sends to every admin device. Returns how many it reached. Never throws. */
export async function pushToAdmins(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!ready()) return { sent: 0, failed: 0 };
  let subs: { id: string; endpoint: string; p256dh: string; auth: string }[] = [];
  try {
    subs = await prisma.pushSubscription.findMany({ select: { id: true, endpoint: true, p256dh: true, auth: true } });
  } catch (err) {
    console.error("[push] could not load subscriptions", err);
    return { sent: 0, failed: 0 };
  }
  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24, urgency: "high" });
        sent++;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date(), failures: 0 } }).catch(() => {});
      } catch (err) {
        failed++;
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else await prisma.pushSubscription.update({ where: { id: s.id }, data: { failures: { increment: 1 } } }).catch(() => {});
      }
    }),
  );
  return { sent, failed };
}
