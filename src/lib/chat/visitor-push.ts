import "server-only";
import { after } from "next/server";
import webpush from "web-push";
import { prisma } from "@/lib/db";

/*
 * Phone/desktop notifications for SHOPPERS (the admin's own devices are src/lib/push.ts). A shopper turns them on
 * from the card in the chat ("Don't miss your payment details"). Same rules as the vape store:
 *   - only for messages from the store (replies, payment details, an updated invoice);
 *   - not while they're on the site (their browser checked in within ONLINE_MS: they see it anyway);
 *   - at most one per chat per PUSH_GAP_MS, however many messages the admin sends in a row.
 */

const ONLINE_MS = 45_000;
const PUSH_GAP_MS = 60_000;

let configured: boolean | undefined;
function ready(): boolean {
  if (configured !== undefined) return configured;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  configured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
  if (configured) webpush.setVapidDetails(VAPID_SUBJECT!, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  return configured;
}

/** The shopper's browser checked in (they're looking at the store). Never throws. */
export async function touchVisitor(conversationId: string): Promise<void> {
  await prisma.conversation.update({ where: { id: conversationId }, data: { visitorLastSeenAt: new Date() } }).catch(() => {});
}

/**
 * After the store sends something in a chat: notify the shopper's devices, unless they're on the site or were
 * notified for this chat in the last minute. Runs after the response. Never throws.
 */
export function pushToConversation(conversationId: string, preview: string): void {
  after(async () => {
    if (!ready()) return;
    try {
      const now = new Date();
      const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { visitorLastSeenAt: true } });
      if (!conv) return;
      if (conv.visitorLastSeenAt && now.getTime() - conv.visitorLastSeenAt.getTime() < ONLINE_MS) return;
      const subs = await prisma.chatPushSubscription.findMany({ where: { conversationId }, select: { id: true, endpoint: true, p256dh: true, auth: true } });
      if (subs.length === 0) return;
      // Claim the slot: only one push per chat per minute, even if two messages race.
      const claimed = await prisma.conversation.updateMany({
        where: { id: conversationId, OR: [{ lastPushAt: null }, { lastPushAt: { lt: new Date(now.getTime() - PUSH_GAP_MS) } }] },
        data: { lastPushAt: now },
      });
      if (claimed.count === 0) return;
      const payload = JSON.stringify({
        title: "AkatsukiZipUp",
        body: preview.length > 140 ? `${preview.slice(0, 139)}…` : preview,
        url: "/?chat=open",
        tag: `chat-${conversationId}`,
      });
      await Promise.all(
        subs.map(async (s) => {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24, urgency: "high" });
            await prisma.chatPushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date(), failures: 0 } }).catch(() => {});
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) await prisma.chatPushSubscription.delete({ where: { id: s.id } }).catch(() => {});
            else await prisma.chatPushSubscription.update({ where: { id: s.id }, data: { failures: { increment: 1 } } }).catch(() => {});
          }
        }),
      );
    } catch (err) {
      console.error("[visitor-push] failed", err);
    }
  });
}
