import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp, fail, ok, rateLimit, readJson, sameOrigin, serverError } from "@/lib/http";
import { notifyAdmins } from "@/lib/notify";
import { readVisitorId } from "@/lib/visitor";

export const dynamic = "force-dynamic";

// Loose shape (types and sizes) for readJson; the real rules below give one message per field.
const body = z.object({
  name: z.string().max(2000).optional(),
  email: z.string().max(2000).optional(),
  phone: z.string().max(2000).optional(),
  message: z.string().max(20_000).optional(),
  website: z.string().max(1000).optional(), // honeypot
});

const optional = (max: number, msg: string) =>
  z
    .string()
    .trim()
    .max(max, msg)
    .transform((v) => v || null);

const rules = z.object({
  name: optional(100, "Keep your name under 100 characters."),
  email: z.string().trim().toLowerCase().min(1, "Please enter your email.").max(254, "That email is too long.").email("Please enter a valid email address."),
  phone: optional(40, "That phone number is too long.").refine((v) => v === null || /^[0-9+()\-.\s]{5,40}$/.test(v), "Please enter a valid phone number, or leave it empty."),
  message: z.string().trim().min(5, "Please write a little more (at least 5 characters).").max(4000, "Please keep your message under 4000 characters."),
});

/** The contact form on /pages/contact. Saves the message and pings the admin (realtime + phone push). */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  if (!(await rateLimit(`contact:${clientIp(req)}`, 5, 60 * 60))) {
    return fail("You've sent several messages already. Please wait an hour, or reach us by email.", 429);
  }
  const parsed = await readJson(req, body, 24_000);
  if ("response" in parsed) return parsed.response;

  const { website, ...input } = parsed.data;
  const checked = rules.safeParse({ name: input.name ?? "", email: input.email ?? "", phone: input.phone ?? "", message: input.message ?? "" });
  if (!checked.success) {
    const fields: Record<string, string> = {};
    for (const issue of checked.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fields[key] ??= issue.message;
    }
    return fail("Please check the highlighted fields.", 400, { fields });
  }
  if (website) return ok(); // a bot filled the hidden field: pretend it worked

  const { name, email, phone, message } = checked.data;
  const visitorId = readVisitorId(req);
  try {
    const row = await prisma.contactMessage.create({
      data: { name, email, phone, body: message, visitorId },
      select: { id: true },
    });
    if (visitorId) await prisma.visitor.updateMany({ where: { id: visitorId }, data: { email } });
    notifyAdmins(
      "contact.created",
      { title: `New message from ${name ?? email}`, body: message.replace(/\s+/g, " ").slice(0, 120), url: `/admin/messages/${row.id}`, tag: `contact-${row.id}` },
      { id: row.id },
    );
    return ok({}, 201);
  } catch (err) {
    return serverError("contact", err);
  }
}
