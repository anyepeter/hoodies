"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { logout } from "./login/actions";

type Counts = { pendingOrders: number; unreadChats: number; unreadMessages: number; lowStock: number };
const EMPTY: Counts = { pendingOrders: 0, unreadChats: 0, unreadMessages: 0, lowStock: 0 };

// Same navigation shape as the owner's other admin panels (Bourbon, vape, muh-med).
const NAV: { href: string; label: string; icon: string; badge?: keyof Counts }[] = [
  { href: "/admin", label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { href: "/admin/orders", label: "Orders", badge: "pendingOrders", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { href: "/admin/products", label: "Products & stock", badge: "lowStock", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
  { href: "/admin/payment-methods", label: "Payment methods", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
  { href: "/admin/chat", label: "Live chat", badge: "unreadChats", icon: "M8 10h.01M12 10h.01M16 10h.01M21 12a9 9 0 11-3.6-7.2L21 3l-1.2 3.4A8.96 8.96 0 0121 12z" },
  { href: "/admin/messages", label: "Messages", badge: "unreadMessages", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  { href: "/admin/subscribers", label: "Subscribers", icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z" },
  { href: "/admin/analytics", label: "Analytics", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { href: "/admin/notifications", label: "Notifications & app", icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" },
];

const POLL_MS = 60_000; // Pusher pings refresh instantly; this is only the safety net.

export function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Counts>(EMPTY);

  const load = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    try {
      const res = await fetch("/api/admin/badges", { cache: "no-store" });
      if (res.ok) setCounts({ ...EMPTY, ...(await res.json()) });
    } catch {
      /* offline: keep the last counts rather than flashing zero */
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(load, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    const onPing = () => load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("admin:badges", onPing);
    window.addEventListener("admin:order.created", onPing);
    window.addEventListener("admin:order.updated", onPing);
    window.addEventListener("admin:chat.message", onPing);
    window.addEventListener("admin:contact.created", onPing);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("admin:badges", onPing);
      window.removeEventListener("admin:order.created", onPing);
      window.removeEventListener("admin:order.updated", onPing);
      window.removeEventListener("admin:chat.message", onPing);
      window.removeEventListener("admin:contact.created", onPing);
    };
    // Re-read on navigation: opening an inbox clears its badge on the server.
  }, [load, pathname]);

  const total = counts.pendingOrders + counts.unreadChats + counts.unreadMessages;
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <>
      {/* Phone: top bar with the menu button */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/10 bg-ink px-4 text-white lg:hidden">
        <Link prefetch={false} href="/admin" className="flex items-center gap-2">
          <span className="rounded-md bg-white px-1.5 py-1">
            <Image src="/store/logo.jpg" alt="AkatsukiZipUp" width={1600} height={719} className="h-5 w-auto" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand">Admin</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={total > 0 ? `Menu, ${total} need attention` : "Menu"}
          className="relative grid h-10 w-10 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
        >
          {total > 0 && !open && (
            <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] font-bold tabular-nums ring-2 ring-ink">{total > 9 ? "9+" : total}</span>
          )}
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      </header>

      <aside className={`${open ? "block" : "hidden"} fixed inset-x-0 top-14 bottom-0 z-30 overflow-y-auto bg-ink lg:inset-y-0 lg:left-0 lg:top-0 lg:block lg:w-64 lg:border-r lg:border-white/5`}>
        <div className="flex min-h-full flex-col">
          <div className="hidden border-b border-white/10 px-6 py-6 lg:block">
            <Link prefetch={false} href="/admin" className="block">
              <span className="inline-block rounded-lg bg-white px-2 py-1.5">
                <Image src="/store/logo.jpg" alt="AkatsukiZipUp" width={1600} height={719} className="h-7 w-auto" />
              </span>
              <span className="mt-2 block text-[10px] font-bold uppercase tracking-[0.4em] text-brand">Store admin</span>
            </Link>
          </div>

          <nav className="flex-1 space-y-0.5 px-3 py-4" aria-label="Admin">
            {NAV.map((item) => {
              const active = isActive(item.href);
              const count = item.badge ? counts[item.badge] : 0;
              return (
                <Link prefetch={false}
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-brand/15 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"}`}
                >
                  <span className={`relative shrink-0 ${active ? "text-brand" : ""}`}>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={item.icon} />
                    </svg>
                    {count > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-brand ring-2 ring-ink" />}
                  </span>
                  {item.label}
                  {count > 0 && (
                    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-bold tabular-nums text-white" aria-label={`${count} need attention`}>
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-white/10 px-3 py-4">
            <Link prefetch={false} href="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/55 transition hover:bg-white/5 hover:text-white">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              View store
            </Link>
            <form action={logout}>
              <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/55 transition hover:bg-white/5 hover:text-red-300">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
