import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-session";
import { prisma } from "@/lib/db";
import { fail, ok, readJson, sameOrigin, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const patch = z.object({ status: z.enum(["SUBSCRIBED", "UNSUBSCRIBED"]) });

/** Unsubscribe or resubscribe one address. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  const denied = await requireAdminApi();
  if (denied) return denied;
  const { id } = await params;
  if (!ID_RE.test(id)) return fail("Subscriber not found.", 404);
  const parsed = await readJson(req, patch, 1_000);
  if ("response" in parsed) return parsed.response;
  try {
    const { count } = await prisma.subscriber.updateMany({ where: { id }, data: { status: parsed.data.status } });
    if (count === 0) return fail("That subscriber no longer exists.", 404);
    return ok({ status: parsed.data.status });
  } catch (err) {
    return serverError("admin/subscribers PATCH", err);
  }
}

/** Remove an address from the list entirely (e.g. a deletion request). */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  const denied = await requireAdminApi();
  if (denied) return denied;
  const { id } = await params;
  if (!ID_RE.test(id)) return fail("Subscriber not found.", 404);
  try {
    const { count } = await prisma.subscriber.deleteMany({ where: { id } });
    if (count === 0) return fail("That subscriber no longer exists.", 404);
    return ok();
  } catch (err) {
    return serverError("admin/subscribers DELETE", err);
  }
}
