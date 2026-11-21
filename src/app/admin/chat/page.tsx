import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdminPage } from "@/lib/admin-session";
import { ChatInbox } from "./ChatInbox";

export const metadata: Metadata = { title: "Live chat" };
export const dynamic = "force-dynamic";

export default async function AdminChatPage() {
  await requireAdminPage();
  return (
    // The open conversation lives in the URL (?c=<id>), so a tapped push notification opens the right one.
    <Suspense fallback={null}>
      <ChatInbox />
    </Suspense>
  );
}
