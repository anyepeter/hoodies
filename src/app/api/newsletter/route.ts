import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp, fail, ok, rateLimit, readJson, sameOrigin, serverError } from "@/lib/http";
import { readVisitorId } from "@/lib/visitor";

export const dynamic = "force-dynamic";

// Loose shape first (types and sizes), then the real rule, so the shopper gets one plain sentence back.
const body = z.object({
  email: z.string().max(1000).optional(),
  website: z.string().max(1000).optional(), // honeypot: people never see it, bots fill it
  source: z.string().max(40).optional(),
});
const emailRule = z.string().trim().toLowerCase().min(1).max(254).email();
const SOURCES = new Set(["footer", "checkout", "popup"]);

const SUBSCRIBED_MESSAGE = "Thanks for subscribing";

/**
 * Footer newsletter sign-up. The answer is the same whether the address is new, already subscribed or coming
 * back after unsubscribing, so the form can't be used to find out who is on the list.
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  if (!(await rateLimit(`newsletter:${clientIp(req)}`, 10, 60 * 60))) {
    return fail("Too many sign-ups from this connection. Please try again in an hour.", 429);
  }
  const parsed = await readJson(req, body, 4_000);
  if ("response" in parsed) return parsed.response;
  const email = emailRule.safeParse(parsed.data.email ?? "");
  if (!email.success) return fail("Please enter a valid email address.", 400, { field: "email" });
  if (parsed.data.website) return ok({ message: SUBSCRIBED_MESSAGE });

  const source = parsed.data.source && SOURCES.has(parsed.data.source) ? parsed.data.source : "footer";
  const visitorId = readVisitorId(req);
  try {
    await prisma.subscriber.upsert({
      where: { email: email.data },
      create: { email: email.data, source, visitorId },
      update: { status: "SUBSCRIBED" },
    });
    // Link the anonymous visitor to the address, if that visitor exists (no-op otherwise).
    if (visitorId) await prisma.visitor.updateMany({ where: { id: visitorId }, data: { email: email.data } });
    return ok({ message: SUBSCRIBED_MESSAGE });
  } catch (err) {
    // Two sign-ups for the same new address at once: the other one won, which is the same outcome.
    if ((err as { code?: string }).code === "P2002") return ok({ message: SUBSCRIBED_MESSAGE });
    return serverError("newsletter", err);
  }
}
