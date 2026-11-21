import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/admin-session";
import { NotificationsClient } from "./NotificationsClient";

export const metadata: Metadata = { title: "Notifications & app" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await requireAdminPage();
  return (
    <>
      <PageHeader
        title="Notifications & app"
        subtitle="Get told about new orders and messages on your phone or computer, even when the admin isn't open."
      />
      <NotificationsClient vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
    </>
  );
}
