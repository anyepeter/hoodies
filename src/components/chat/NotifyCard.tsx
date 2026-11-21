"use client";

import { useCallback, useEffect, useState } from "react";
import { INVOICE_COPY, NOTIFY_COPY, type ChatMessageDTO } from "@/lib/chat/shared";

/*
 * "Don't miss your payment details": in the shopper's chat, right under the store's "Thanks for confirming!",
 * while the newest invoice is confirmed and the order still awaits payment (the vape store's notifyAfter).
 * Tapping the button asks for permission, registers /sw.js (scope "/": only now, never on page load), subscribes
 * with the store's VAPID key and saves the subscription for this chat (POST /api/chat/push). The store's
 * messages then reach the shopper's phone when they're not on the site (src/lib/chat/visitor-push.ts).
 */

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const NETWORK = "We couldn't reach the server. Check your connection and try again.";
const SYNCED_KEY = "akz_push_synced";

/**
 * The id of the store's "Thanks for confirming!" reply after the newest invoice, when that invoice is confirmed
 * and its order still awaits payment: the notifications card goes right under it. Null otherwise.
 */
export function notifyAfter(messages: Pick<ChatMessageDTO, "id" | "sender" | "body" | "kind" | "invoice">[]): string | null {
  let q = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].kind === "INVOICE" && messages[i].invoice?.latest) {
      q = i;
      break;
    }
  }
  const invoice = q >= 0 ? messages[q].invoice : null;
  if (invoice?.answer !== "confirmed" || invoice.status !== "PENDING") return null;
  return messages.slice(q + 1).find((m) => m.sender === "ADMIN" && m.body === INVOICE_COPY.yesReply)?.id ?? null;
}

type State = "loading" | "unsupported" | "iphone" | "off" | "busy" | "on" | "blocked";

/** iPhone/iPad Safari in a normal tab: web push only works once the site is added to the Home Screen. */
function iphoneTab(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !standalone;
}

const supported = () => Boolean(PUBLIC_KEY) && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const k = sub.options.applicationServerKey;
  if (!k) return false;
  const a = new Uint8Array(k);
  return a.length === key.length && a.every((b, i) => b === key[i]);
}

/** The store's worker (scope "/"), registered now if it isn't yet, once it's active (push needs that). */
async function storeRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  if (reg.active) return reg;
  const worker = reg.installing ?? reg.waiting;
  if (worker) {
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error("The service worker took too long to start.")), 15_000);
      worker.addEventListener("statechange", () => {
        if (worker.state === "activated") {
          window.clearTimeout(t);
          resolve();
        } else if (worker.state === "redundant") {
          window.clearTimeout(t);
          reject(new Error("The service worker failed to start."));
        }
      });
    });
  }
  return reg;
}

async function save(sub: PushSubscription, conversationId: string | null): Promise<string | null> {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    const res = await fetch("/api/chat/push", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, ...(conversationId ? { conversationId } : {}) }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    return res.ok && body?.ok ? null : (body?.error ?? "We couldn't turn on notifications. Try again.");
  } catch {
    return NETWORK;
  }
}

/** This browser already has a subscription: make sure the server has it for THIS chat (once per tab session). */
async function syncOnce(sub: PushSubscription, conversationId: string | null): Promise<void> {
  const mark = `${conversationId ?? ""}|${sub.endpoint.slice(-32)}`;
  try {
    if (sessionStorage.getItem(SYNCED_KEY) === mark) return;
  } catch {
    /* storage blocked: sync anyway */
  }
  if ((await save(sub, conversationId)) === null) {
    try {
      sessionStorage.setItem(SYNCED_KEY, mark);
    } catch {
      /* fine */
    }
  }
}

/** `onShown` runs once the card knows what to show (it's empty until then), so the thread can bring it into view. */
export function NotifyCard({ conversationId, onShown }: { conversationId: string | null; onShown?: () => void }) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const visible = state !== "loading" && state !== "unsupported";

  useEffect(() => {
    if (visible) onShown?.();
    // Only when it first appears, not on every state change after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // What this browser can do, read after mount (the APIs don't exist on the server).
  useEffect(() => {
    let cancelled = false;
    const set = (s: State) => !cancelled && setState(s);
    void (async () => {
      try {
        if (!PUBLIC_KEY) return set("unsupported");
        if (iphoneTab()) return set("iphone");
        if (!supported()) return set("unsupported");
        if (Notification.permission === "denied") return set("blocked");
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        if (sub && Notification.permission === "granted") {
          set("on");
          void syncOnce(sub, conversationId);
        } else set("off");
      } catch {
        set("unsupported");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  /** Only from a tap: browsers ask for permission, then this device subscribes. */
  const turnOn = useCallback(async () => {
    setState("busy");
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "blocked" : "off");
      const key = keyBytes(PUBLIC_KEY);
      const reg = await storeRegistration();
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub, key)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const failed = await save(sub, conversationId);
      if (failed) {
        setError(failed);
        return setState("off");
      }
      setState("on");
    } catch {
      setError("We couldn't turn on notifications on this device. Try again, or keep this page open.");
      setState("off");
    }
  }, [conversationId]);

  if (!visible) return null;

  if (state === "on") {
    return (
      <section aria-label={NOTIFY_COPY.title} className="mx-auto w-full max-w-[340px] rounded-xl border border-emerald-600/20 bg-emerald-50 px-4 py-3 text-[13px] leading-snug text-emerald-900">
        <p className="flex items-start gap-2">
          <svg className="mt-px h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          <span>{NOTIFY_COPY.done}</span>
        </p>
      </section>
    );
  }

  return (
    <section aria-label={NOTIFY_COPY.title} className="mx-auto w-full max-w-[340px] rounded-xl border border-black/10 bg-white p-4 text-ink shadow-[0_1px_2px_rgba(18,18,18,0.06)]">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand" aria-hidden>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" />
            <path d="M10.3 20a1.9 1.9 0 0 0 3.4 0" />
          </svg>
        </span>
        <div className="min-w-0">
          <h3 className="text-[14px] font-bold leading-snug">{NOTIFY_COPY.title}</h3>
          <p className="mt-1 text-[13px] leading-snug text-ink/65">{state === "blocked" ? NOTIFY_COPY.blocked : state === "iphone" ? NOTIFY_COPY.iphone : NOTIFY_COPY.body}</p>
        </div>
      </div>
      {(state === "off" || state === "busy") && (
        <button
          type="button"
          onClick={() => void turnOn()}
          disabled={state === "busy"}
          className="mt-3.5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 text-[14px] font-semibold text-white transition hover:bg-brand-dark active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
        >
          {state === "busy" && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" aria-hidden />}
          {NOTIFY_COPY.button}
        </button>
      )}
      {error && (
        <p className="mt-2 text-[12.5px] text-brand" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
