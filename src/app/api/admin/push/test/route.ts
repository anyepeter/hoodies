import type { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin-session";
import { fail, ok, rateLimit, sameOrigin, serverError } from "@/lib/http";
import { pushToAdmins } from "@/lib/push";

export const dynamic = "force-dynamic";

/** POST /api/admin/push/test — sends a test notification to every device on the list, now. */
export async function POST(req: NextRequest) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  if (!sameOrigin(req)) return fail("Bad origin.", 403);
  if (!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT)) {
    return fail("Notifications aren't set up on the server yet (the VAPID keys are missing).", 503);
  }
  if (!(await rateLimit("push-test:admin", 10, 600))) return fail("That's a lot of tests. Please wait a few minutes.", 429);
  try {
    const result = await pushToAdmins({
      title: "Test notification",
      body: "Notifications work on this device. New orders and messages will show up like this.",
      url: "/admin/notifications",
      tag: "akz-test",
    });
    return ok(result);
  } catch (err) {
    return serverError("push:test", err);
  }
}
