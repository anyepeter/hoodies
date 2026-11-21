import type { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin-session";
import { prisma } from "@/lib/db";
import { fail, ok, sameOrigin, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** DELETE /api/admin/push/<id> — stop sending notifications to that device. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  const { id } = await ctx.params;
  if (!/^[a-z0-9]{20,40}$/.test(id)) return fail("That device isn't on the list.", 404);
  try {
    const res = await prisma.pushSubscription.deleteMany({ where: { id } });
    if (res.count === 0) return fail("That device isn't on the list.", 404);
    return ok();
  } catch (err) {
    return serverError("push:remove", err);
  }
}
