"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ADMIN_CHANNEL, listen } from "@/lib/pusher-client";
import { playChime, unlockAudioOnInteraction } from "./realtime/chime";
import { captureInstallPrompt } from "./realtime/pwa";

/*
 * Mounted on every admin page (AdminChrome). It:
 *   1. subscribes to Pusher's private-admin channel and re-dispatches each ping as a window event the pages
 *      listen to — "admin:badges", "admin:order.created", "admin:order.updated", "admin:chat.message",
 *      "admin:contact.created" (detail = the ping's data) — so pages refresh themselves;
 *   2. shows a small toast (top right, goes away by itself) for a new order, chat message or contact message,
 *      with an optional chime (Admin → Notifications & app);
 *   3. registers the admin service worker (web push) and follows "open this page" messages from it when a
 *      notification is tapped;
 *   4. catches the browser's install prompt for the "Install the admin app" button.
 * Without Pusher keys only 1–2 stand down; every page still has its own 60-second refresh.
 */

const EVENTS = ["order.created", "order.updated", "chat.message", "contact.created", "badges"] as const;
type AdminEvent = (typeof EVENTS)[number];

type Toast = { id: number; title: string; body?: string; href: string };
const TOAST_MS = 7000;

type Detail = Record<string, unknown> | null;
const str = (v: unknown) => (typeof v === "string" && v.length < 200 ? v : undefined);

function toastFor(event: AdminEvent, d: Detail, pathname: string): Omit<Toast, "id"> | null {
  const id = str(d?.id);
  if (event === "order.created") {
    const n = typeof d?.number === "number" ? ` #${1000 + d.number}` : "";
    return { title: `New order${n}`, body: str(d?.name) ?? str(d?.total), href: id ? `/admin/orders/${encodeURIComponent(id)}` : "/admin/orders" };
  }
  if (event === "contact.created") return { title: "New contact message", body: str(d?.name) ?? str(d?.email), href: id ? `/admin/messages/${encodeURIComponent(id)}` : "/admin/messages" };
  if (event === "chat.message") {
    // Our own replies (from another tab or device) refresh the inbox silently; and the inbox itself shows new
    // messages live, so no toast on top of it.
    if (d?.from === "ADMIN" || pathname.startsWith("/admin/chat")) return null;
    return { title: "New chat message", body: "A visitor is waiting for a reply.", href: id ? `/admin/chat?c=${encodeURIComponent(id)}` : "/admin/chat" };
  }
  return null;
}

export function AdminRealtime() {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  // 1 + 2: Pusher → window events + toasts
  useEffect(() => {
    const offs = EVENTS.map((event) =>
      listen(ADMIN_CHANNEL, event, (data) => {
        const detail = (data && typeof data === "object" ? data : null) as Detail;
        window.dispatchEvent(new CustomEvent(`admin:${event}`, { detail }));
        const fromCustomer = event === "order.created" || event === "contact.created" || (event === "chat.message" && detail?.from !== "ADMIN");
        if (fromCustomer) playChime();
        const t = toastFor(event, detail, pathRef.current);
        if (!t) return;
        const id = ++seq.current;
        setToasts((list) => [...list.slice(-2), { id, ...t }]);
        window.setTimeout(() => dismiss(id), TOAST_MS);
      }),
    );
    return () => offs.forEach((off) => off());
  }, [dismiss]);

  // 2: let the chime play later (browsers need one interaction first)
  useEffect(() => unlockAudioOnInteraction(), []);

  // 4: install prompt
  useEffect(() => captureInstallPrompt(), []);

  // 3: service worker for web push + notification taps
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/admin-sw.js", { scope: "/admin/" }).catch((err) => console.warn("[admin-sw] register failed", err));
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string; url?: unknown } | null;
      if (msg?.type === "akz:navigate" && typeof msg.url === "string" && msg.url.startsWith("/admin")) router.push(msg.url);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  // The live region stays in the page even when empty, so screen readers announce each toast as it arrives.
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-3 top-16 z-[70] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2 lg:right-6 lg:top-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-lg ring-1 ring-black/5 motion-safe:animate-[pop_0.25s_ease-out]"
        >
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" aria-hidden />
          <Link href={t.href} onClick={() => dismiss(t.id)} className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">{t.title}</span>
            {t.body && <span className="mt-0.5 block truncate text-xs text-zinc-500">{t.body}</span>}
            <span className="mt-1 block text-xs font-semibold text-brand">Open →</span>
          </Link>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-m-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-ink">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
