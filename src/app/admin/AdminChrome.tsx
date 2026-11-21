"use client";

import { usePathname } from "next/navigation";
import { AdminRealtime } from "@/components/admin/AdminRealtime";
import { AdminSidebar } from "./AdminSidebar";

/* The login screen lives under /admin so the proxy can special-case it, but it must not get the panel chrome
   (it would show a signed-out visitor the whole navigation). Layouts can't read the pathname; this can. */
export function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <div className="min-h-dvh bg-zinc-100 text-ink">
      <AdminSidebar />
      <AdminRealtime />
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}
