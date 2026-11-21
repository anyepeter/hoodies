import { PageHeader } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

// Placeholder: the dashboard (KPIs, recent orders, stock, unread chats/messages) is built here.
export default async function AdminHome() {
  await requireAdminPage();
  return <PageHeader title="Dashboard" subtitle="Coming together…" />;
}
