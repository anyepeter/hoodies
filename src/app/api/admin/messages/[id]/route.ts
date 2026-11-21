import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-session";
import { prisma } from "@/lib/db";
import { fail, ok, readJson, sameOrigin, serverError } from "@/lib/http";
import { notifyAdmins } from "@/lib/notify";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const patch = z.object({ status: z.enum(["UNREAD", "READ", "ARCHIVED"]) });

/** Mark a contact message unread / read / archived. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  const denied = await requireAdminApi();
  if (denied) return denied;
  const { id } = await params;
  if (!ID_RE.test(id)) return fail("Message not found.", 404);
  const parsed = await readJson(req, patch, 1_000);
  if ("response" in parsed) return parsed.response;
  try {
    const { count } = await prisma.contactMessage.updateMany({ where: { id }, data: { status: parsed.data.status } });
    if (count === 0) return fail("That message no longer exists.", 404);
    notifyAdmins("badges", null);
    return ok({ status: parsed.data.status });
  } catch (err) {
    return serverError("admin/messages PATCH", err);
  }
}

/** Delete a contact message for good. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  const denied = await requireAdminApi();
  if (denied) return denied;
  const { id } = await params;
  if (!ID_RE.test(id)) return fail("Message not found.", 404);
  try {
    const { count } = await prisma.contactMessage.deleteMany({ where: { id } });
    if (count === 0) return fail("That message no longer exists.", 404);
    notifyAdmins("badges", null);
    return ok();
  } catch (err) {
    return serverError("admin/messages DELETE", err);
  }
}
