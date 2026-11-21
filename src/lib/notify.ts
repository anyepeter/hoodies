import "server-only";
import { after } from "next/server";
import { ADMIN_CHANNEL, ping, type AdminEvent } from "@/lib/pusher-server";
import { pushToAdmins, type PushPayload } from "@/lib/push";

/**
 * Tell the admin something happened: a Pusher ping to any open admin tab (it refreshes itself) and a web push
 * to their phone. Runs after the response is sent (next/server `after`), so customers never wait on it.
 */
export function notifyAdmins(event: AdminEvent, push: PushPayload | null, data: Record<string, unknown> = {}): void {
  after(async () => {
    await Promise.all([ping(ADMIN_CHANNEL, event, data), push ? pushToAdmins(push) : Promise.resolve()]);
  });
}
