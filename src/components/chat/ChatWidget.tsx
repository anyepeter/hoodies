"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { CloseIcon } from "@/components/icons";
import { CHAT_EVENT, EMAIL_MAX, MESSAGE_MAX, NAME_MAX, type ChatMessageDTO, type InvoiceAnswer, type VisitorConversationDTO } from "@/lib/chat/shared";
import { chatChannel, listen } from "@/lib/pusher-client";
import { HOODIE } from "@/lib/store";
import { STICKY_BAR_PATH, handleOpenRequests, setChatOpen } from "./chat-open";
import { PaymentCard, VisitorInvoice } from "./OrderCards";

/*
 * Live chat for shoppers: a bubble bottom-right, a panel (full-screen sheet on phones, a 380 px card on bigger
 * screens) with a greeting and the conversation.
 *
 * Realtime is "ping, then pull": the server pings private-chat-<id> on Pusher when something changes and the
 * widget refetches /api/chat. While the panel is closed it keeps listening (if a conversation exists) so the
 * bubble can show a badge for replies. Without Pusher keys, or as a safety net, the open panel refreshes every
 * 60 s while the tab is visible, and every time it's opened.
 *
 * The conversation's secret lives in an httpOnly cookie; only its id is kept in localStorage, so a page load
 * knows whether there's anything to check (shoppers who never chatted cost the server nothing).
 *
 * Orders live in the chat: placing one posts its invoice here (an INVOICE card with "is everything correct?"
 * and two buttons), and the store later sends the payment details (a PAYMENT card with Copy). The order-confirmed
 * page fires "akz:open-chat": the panel opens, loads the thread by cookie (a first-time chatter's browser doesn't
 * know the conversation yet) and scrolls to the invoice.
 */

const ID_KEY = "akz_chat_id";
const REFRESH_MS = 60_000;
const NETWORK = "We couldn't reach the server. Check your connection and try again.";
const GREETING = "Hi 👋 Questions about sizing or shipping? We usually reply within minutes.";

type Local = ChatMessageDTO & { pending?: "sending" | "failed"; error?: string };
type Thread = { conversation: VisitorConversationDTO | null; messages: ChatMessageDTO[] };
type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string; code?: string };
type Field = "name" | "email" | "message";

async function api<T>(url: string, init?: { method: string; body: unknown }): Promise<Result<T>> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      method: init?.method ?? "GET",
      headers: init ? { "Content-Type": "application/json" } : undefined,
      body: init ? JSON.stringify(init.body) : undefined,
    });
    const json = (await res.json().catch(() => null)) as ({ ok?: boolean; error?: string; code?: string } & T) | null;
    if (!res.ok || !json?.ok) return { ok: false, status: res.status, error: json?.error ?? "Something went wrong. Please try again.", code: json?.code };
    return { ok: true, data: json };
  } catch {
    return { ok: false, status: 0, error: NETWORK };
  }
}

function rememberId(id: string | null) {
  try {
    if (id) localStorage.setItem(ID_KEY, id);
    else localStorage.removeItem(ID_KEY);
  } catch {
    /* storage blocked: the panel still finds the chat by cookie when opened */
  }
}

function storedId(): string | null {
  try {
    const v = localStorage.getItem(ID_KEY);
    return v && /^[a-z0-9]{20,40}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

/** Server rows first (they're the truth), then anything of ours still sending or failed. */
function merge(server: ChatMessageDTO[], prev: Local[]): Local[] {
  const ids = new Set(server.map((m) => m.id));
  return [...server, ...prev.filter((m) => m.pending && !ids.has(m.id))];
}

const isPhone = () => !window.matchMedia("(min-width: 640px)").matches;

let localSeq = 0;

export function ChatWidget() {
  const pathname = usePathname();
  const raised = pathname === STICKY_BAR_PATH;

  const [open, setOpen] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [conv, setConv] = useState<VisitorConversationDTO | null>(null);
  const [messages, setMessages] = useState<Local[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [draft, setDraft] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field | "form", string>>>({});
  const [starting, setStarting] = useState(false);
  // Opened for an order: show the loading skeleton (not the "start a chat" form) until the thread arrives.
  const [expecting, setExpecting] = useState(false);
  const [focusTick, setFocusTick] = useState(0);

  const openRef = useRef(false);
  const convIdRef = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);
  /** "waiting": opened for an order, scroll to the invoice once the thread has loaded ("ready"). */
  const focusInvoice = useRef<"no" | "waiting" | "ready">("no");

  const forget = useCallback(() => {
    rememberId(null);
    convIdRef.current = null;
    setConvId(null);
    setConv(null);
    setUnread(0);
  }, []);

  const adopt = useCallback((c: VisitorConversationDTO) => {
    rememberId(c.id);
    convIdRef.current = c.id;
    setConvId(c.id);
    setConv(c);
  }, []);

  /** Full refresh of the thread (marks replies read). Only while the panel is open. */
  const loadThread = useCallback(async () => {
    const r = await api<Thread>("/api/chat");
    if (!r.ok) {
      setLoadError(r.error === NETWORK ? "We couldn't load your messages. Check your connection." : r.error);
      setLoaded(true);
      return;
    }
    setLoadError(null);
    const c = r.data.conversation;
    if (!c) {
      if (convIdRef.current) setNotice("This chat has ended. Write below to start a new one.");
      forget();
      setMessages([]);
      focusInvoice.current = "no";
    } else {
      adopt(c);
      setUnread(0);
      setMessages((prev) => merge(r.data.messages, prev));
      if (focusInvoice.current === "waiting") {
        focusInvoice.current = "ready";
        setFocusTick((n) => n + 1);
      }
    }
    setLoaded(true);
  }, [adopt, forget]);

  /** Unread count only, for the bubble badge while the panel is closed. */
  const peek = useCallback(async () => {
    const r = await api<Thread>("/api/chat?peek=1");
    if (!r.ok) return;
    if (!r.data.conversation) forget();
    else setUnread(r.data.conversation.unread);
  }, [forget]);

  // On page load: only someone who has chatted before has anything to check.
  useEffect(() => {
    const id = storedId();
    if (!id) return;
    convIdRef.current = id;
    const t = window.setTimeout(() => {
      setConvId(id);
      void peek();
    }, 0);
    return () => window.clearTimeout(t);
  }, [peek]);

  // Live pings for this conversation (open or closed).
  useEffect(() => {
    if (!convId) return;
    return listen(chatChannel(convId), CHAT_EVENT, (data) => {
      if (openRef.current) void loadThread();
      else if ((data as { from?: string } | null)?.from !== "VISITOR") void peek();
    });
  }, [convId, loadThread, peek]);

  // "akz:open-chat" (the order-confirmed page): open the panel on the shopper's invoice.
  useEffect(
    () =>
      handleOpenRequests(() => {
        focusInvoice.current = "waiting";
        setNotice(null);
        if (!convIdRef.current) {
          setExpecting(true);
          setLoaded(false);
        }
        if (openRef.current) void loadThread();
        else setOpen(true); // opening loads the thread
      }),
    [loadThread],
  );

  // Open panel: load now, then the slow safety refresh while the tab is visible.
  useEffect(() => {
    openRef.current = open;
    setChatOpen(open);
    if (!open) return;
    const first = window.setTimeout(() => void loadThread(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadThread();
    }, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && void loadThread();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [open, loadThread]);

  // Focus in on open (the message box on a computer; the panel itself on a phone, so the keyboard doesn't jump
  // up over the greeting), back to the bubble on close. Phones: the sheet covers the page, so the page can't scroll.
  useEffect(() => {
    if (!open) return;
    const phone = isPhone();
    const t = window.setTimeout(() => (phone ? panelRef.current?.focus() : inputRef.current?.focus()), 30);
    const root = document.documentElement;
    const before = root.style.overflow;
    if (phone) root.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      root.style.overflow = before;
    };
  }, [open]);

  // Keep the newest message in view; when opened for an order, the newest invoice instead: all of it when it
  // fits, otherwise its bottom (the question and the two buttons are what they need to see).
  const last = messages.at(-1);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (focusInvoice.current === "ready") {
      focusInvoice.current = "no";
      const cards = el.querySelectorAll<HTMLElement>("[data-invoice-card]");
      const card = cards[cards.length - 1];
      if (card) {
        const l = el.getBoundingClientRect();
        const r = card.getBoundingClientRect();
        const topToTop = r.top - l.top - 12;
        const bottomToBottom = r.bottom - l.bottom + 12;
        // The larger of the two: top-aligned when the card fits (its bottom is then in view too), else bottom-aligned.
        el.scrollTop += Math.max(topToTop, bottomToBottom);
        return;
      }
    }
    el.scrollTop = el.scrollHeight;
  }, [last?.id, last?.pending, open, loaded, focusTick]);

  const close = useCallback(() => {
    const hadFocus = panelRef.current?.contains(document.activeElement);
    setOpen(false);
    if (hadFocus) window.setTimeout(() => bubbleRef.current?.focus(), 0);
  }, []);

  const onPanelKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    // On a phone the sheet is the whole screen: keep Tab inside it.
    if (e.key === "Tab" && isPhone() && panelRef.current) {
      const items = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([tabindex='-1']), textarea, a[href]")];
      if (!items.length) return;
      const first = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  /* ---------------------------------------------------------------- sending */

  const start = async () => {
    const message = draft.trim();
    const next: typeof errors = {};
    if (!message) next.message = "Please write a message.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Please enter a valid email address, or leave it empty.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setStarting(true);
    const r = await api<Thread>("/api/chat", {
      method: "POST",
      body: { name: name.trim(), email: email.trim(), message, pagePath: window.location.pathname, website: honeypotRef.current?.value ?? "" },
    });
    setStarting(false);
    if (!r.ok) {
      const m = /^(name|email|message): (.+)$/.exec(r.error);
      setErrors(m ? { [m[1] as Field]: m[2] } : { form: r.error });
      return;
    }
    if (!r.data.conversation) return; // honeypot: nothing happened
    setNotice(null);
    adopt(r.data.conversation);
    setMessages(r.data.messages);
    setLoaded(true);
    setDraft("");
    inputRef.current?.focus();
  };

  const send = async (text: string, retryId?: string) => {
    const localId = retryId ?? `local-${++localSeq}`;
    if (retryId) {
      setMessages((prev) => prev.map((m) => (m.id === retryId ? { ...m, pending: "sending", error: undefined } : m)));
    } else {
      setMessages((prev) => [...prev, { id: localId, sender: "VISITOR", body: text, createdAt: new Date().toISOString(), kind: "TEXT", pending: "sending" }]);
      setDraft("");
    }

    const r = await api<{ message: ChatMessageDTO | null }>("/api/chat/messages", {
      method: "POST",
      body: { message: text, website: honeypotRef.current?.value ?? "" },
    });
    if (r.ok) {
      const saved = r.data.message;
      setMessages((prev) => {
        const next = saved ? prev.map((m) => (m.id === localId ? saved : m)) : prev.filter((m) => m.id !== localId);
        return next.filter((m, i) => next.findIndex((x) => x.id === m.id) === i);
      });
      setConv((c) => (c ? { ...c, status: "OPEN" } : c));
    } else if (r.code === "no_conversation") {
      // The store deleted the conversation: start over, keeping what they typed.
      forget();
      setMessages([]);
      setDraft(text);
      setNotice("This chat has ended. Send your message again to start a new one.");
    } else {
      setMessages((prev) => prev.map((m) => (m.id === localId ? { ...m, pending: "failed", error: r.error } : m)));
    }
  };

  /** "Yes, all correct" / "Something's wrong" under an invoice. Resolves to an error sentence, or null. */
  const answerInvoice = async (messageId: string, answer: InvoiceAnswer): Promise<string | null> => {
    const r = await api<Thread>("/api/chat/invoice", { method: "POST", body: { messageId, answer } });
    if (r.ok) {
      if (r.data.conversation) adopt(r.data.conversation);
      setMessages((prev) => merge(r.data.messages, prev));
      return null;
    }
    if (r.status === 409) void loadThread(); // answered already (another tab?): show where it stands
    return r.error;
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!conv) {
      if (!starting) void start();
      return;
    }
    const text = draft.trim();
    if (!text) {
      setErrors({ message: "Write a message first." });
      return;
    }
    if (text.length > MESSAGE_MAX) {
      setErrors({ message: `Keep it under ${MESSAGE_MAX} characters.` });
      return;
    }
    setErrors({});
    void send(text);
  };

  const onComposerKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  /* ----------------------------------------------------------------- layout */

  // Bottom-right, clear of everything else down there (see FloatingShop and BackToTop, which line up with this).
  // On the hoodie page everything sits above the 68 px sticky "Add to cart" bar.
  const bubblePos = raised
    ? "right-4 bottom-[calc(5.25rem_+_env(safe-area-inset-bottom))] sm:right-6"
    : "right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] sm:right-6 sm:bottom-6";
  const panelPos = raised
    ? "sm:bottom-[calc(9.5rem_+_env(safe-area-inset-bottom))] sm:h-[min(560px,calc(100dvh_-_11.5rem))]"
    : "sm:bottom-[5.75rem] sm:h-[min(600px,calc(100dvh_-_7.5rem))]";

  const showThread = Boolean(conv) || ((Boolean(convId) || expecting) && !loaded);
  const label = unread > 0 ? `Chat with us, ${unread} new ${unread === 1 ? "reply" : "replies"}` : "Chat with us";

  return (
    <>
      <button
        ref={bubbleRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? "Close chat" : label}
        aria-expanded={open}
        aria-controls="akz-chat-panel"
        className={`fixed z-40 grid h-14 w-14 place-items-center rounded-full bg-ink text-white shadow-[0_14px_34px_-10px_rgba(18,18,18,0.65)] ring-1 ring-white/10 transition-transform duration-200 hover:scale-105 active:scale-95 motion-safe:animate-[dock_0.6s_cubic-bezier(0.2,0.9,0.25,1.2)_1.1s_both] motion-reduce:transition-none ${bubblePos} ${open ? "max-sm:hidden" : ""}`}
      >
        {open ? (
          <CloseIcon className="h-6 w-6" />
        ) : (
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 20l1.8-5.1A7.5 7.5 0 1 1 20 11.5Z" />
            <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" strokeWidth={2.4} />
          </svg>
        )}
        {!open && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold tabular-nums text-white ring-2 ring-white" aria-hidden>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id="akz-chat-panel"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="akz-chat-title"
          tabIndex={-1}
          onKeyDown={onPanelKey}
          className={`fixed inset-0 z-50 flex flex-col overflow-hidden bg-white outline-none motion-safe:animate-[rise_0.35s_cubic-bezier(0.2,0.8,0.2,1)] sm:inset-auto sm:right-6 sm:w-[380px] sm:origin-bottom-right sm:rounded-2xl sm:border sm:border-black/5 sm:shadow-[0_30px_70px_-20px_rgba(18,18,18,0.45)] ${panelPos}`}
        >
          {/* Header */}
          <div className="flex items-center gap-3 bg-ink px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-white sm:pt-4">
            <Image src={HOODIE.images[0].src} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full bg-white object-cover ring-2 ring-white/20" />
            <div className="min-w-0 flex-1 leading-tight">
              <h2 id="akz-chat-title" className="text-[15px] font-bold">
                Chat with AkatsukiZipUp
              </h2>
              <p className="mt-0.5 text-[12px] text-white/60">We usually reply within minutes</p>
            </div>
            <button type="button" onClick={close} aria-label="Close chat" className="-mr-1 grid h-10 w-10 place-items-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white">
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Thread */}
          <div ref={listRef} role="log" aria-live="polite" aria-label="Messages" className="flex-1 space-y-2.5 overflow-y-auto overscroll-contain bg-soft/60 px-4 py-4">
            <Bubble mine={false} body={GREETING} />
            {notice && <p className="mx-auto max-w-[85%] rounded-lg bg-amber-50 px-3 py-2 text-center text-[12.5px] text-amber-900">{notice}</p>}
            {showThread && !loaded && (
              <div className="space-y-2.5" aria-label="Loading messages">
                <div className="ml-auto h-10 w-2/3 animate-pulse rounded-2xl bg-black/[0.06]" />
                <div className="h-14 w-3/4 animate-pulse rounded-2xl bg-black/[0.06]" />
              </div>
            )}
            {loadError && (
              <p className="text-center text-[12.5px] text-brand" role="alert">
                {loadError}{" "}
                <button type="button" onClick={() => void loadThread()} className="font-semibold underline underline-offset-2">
                  Try again
                </button>
              </p>
            )}
            {messages.map((m) =>
              m.sender === "SYSTEM" ? (
                <p key={m.id} className="text-center text-[12px] text-ink/50">
                  {m.body}
                </p>
              ) : m.kind === "INVOICE" && m.invoice ? (
                <CardRow key={m.id} meta={timeOf(m.createdAt)} invoice>
                  <VisitorInvoice invoice={m.invoice} onAnswer={(a) => answerInvoice(m.id, a)} />
                </CardRow>
              ) : m.kind === "PAYMENT" ? (
                <CardRow key={m.id} meta={timeOf(m.createdAt)}>
                  <PaymentCard title={m.invoice ? `Payment details · ${m.invoice.number}` : "Payment details"} body={m.body} />
                </CardRow>
              ) : (
                <Bubble
                  key={m.id}
                  mine={m.sender === "VISITOR"}
                  body={m.body}
                  meta={m.pending === "sending" ? "Sending…" : m.pending === "failed" ? undefined : timeOf(m.createdAt)}
                  failed={m.pending === "failed" ? (m.error ?? NETWORK) : undefined}
                  onRetry={m.pending === "failed" ? () => void send(m.body, m.id) : undefined}
                />
              ),
            )}
            {conv?.status === "CLOSED" && (
              <p className="text-center text-[12px] text-ink/50">This chat was closed. Write again and we&apos;ll pick it back up.</p>
            )}
          </div>

          {/* Composer */}
          <form onSubmit={submit} noValidate className="border-t border-black/5 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            {/* Honeypot: people never see or fill this; bots do. */}
            <input ref={honeypotRef} type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />

            {!showThread && (
              <div className="mb-2.5 grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="akz-chat-name" className="sr-only">
                    Your name (optional)
                  </label>
                  <input
                    id="akz-chat-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={NAME_MAX}
                    autoComplete="name"
                    placeholder="Name (optional)"
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? "akz-chat-name-error" : undefined}
                    className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-[14px] outline-none transition placeholder:text-ink/40 focus:border-ink"
                  />
                </div>
                <div>
                  <label htmlFor="akz-chat-email" className="sr-only">
                    Your email (optional)
                  </label>
                  <input
                    id="akz-chat-email"
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors((x) => ({ ...x, email: undefined }));
                    }}
                    maxLength={EMAIL_MAX}
                    autoComplete="email"
                    placeholder="Email (optional)"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? "akz-chat-email-error" : undefined}
                    className={`h-10 w-full rounded-lg border bg-white px-3 text-[14px] outline-none transition placeholder:text-ink/40 focus:border-ink ${errors.email ? "border-brand" : "border-black/10"}`}
                  />
                </div>
                {errors.name && (
                  <p id="akz-chat-name-error" className="col-span-2 text-[12px] text-brand">
                    {errors.name}
                  </p>
                )}
                {errors.email && (
                  <p id="akz-chat-email-error" className="col-span-2 text-[12px] text-brand">
                    {errors.email}
                  </p>
                )}
                <p className="col-span-2 text-[11.5px] text-ink/50">Leave an email if you&apos;d like the answer there too.</p>
              </div>
            )}

            <div className="flex items-end gap-2">
              <label htmlFor="akz-chat-message" className="sr-only">
                Your message
              </label>
              <textarea
                id="akz-chat-message"
                ref={inputRef}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (errors.message) setErrors((x) => ({ ...x, message: undefined }));
                }}
                onKeyDown={onComposerKey}
                rows={showThread ? 1 : 2}
                maxLength={MESSAGE_MAX}
                placeholder={showThread ? "Write a message…" : "Ask us anything…"}
                aria-invalid={Boolean(errors.message)}
                aria-describedby={errors.message || errors.form ? "akz-chat-error" : "akz-chat-hint"}
                className={`max-h-32 min-h-11 flex-1 resize-none rounded-xl border bg-white px-3 py-2.5 text-[14px] leading-snug outline-none transition [field-sizing:content] placeholder:text-ink/40 focus:border-ink ${errors.message ? "border-brand" : "border-black/10"}`}
              />
              <button
                type="submit"
                disabled={starting}
                aria-label={showThread ? "Send message" : "Start chat"}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand text-white transition hover:bg-brand-dark active:scale-95 disabled:cursor-wait disabled:opacity-60"
              >
                {starting ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" aria-hidden />
                ) : (
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                )}
              </button>
            </div>
            {errors.message || errors.form ? (
              <p id="akz-chat-error" className="mt-1.5 text-[12px] text-brand" role="alert">
                {errors.message ?? errors.form}
              </p>
            ) : (
              <p id="akz-chat-hint" className="mt-1.5 hidden text-[11px] text-ink/40 sm:block">
                Enter to send · Shift + Enter for a new line
              </p>
            )}
          </form>
        </div>
      )}
    </>
  );
}

/** An order card from the store, left-aligned like the store's replies, a little wider than a bubble. */
function CardRow({ meta, invoice = false, children }: { meta: string; invoice?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start" data-invoice-card={invoice ? "" : undefined}>
      <div className="w-full max-w-[340px]">{children}</div>
      <span className="mt-1 px-1 text-[11px] tabular-nums text-ink/45">{meta}</span>
    </div>
  );
}

function Bubble({ mine, body, meta, failed, onRetry }: { mine: boolean; body: string; meta?: string; failed?: string; onRetry?: () => void }) {
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <p
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed ${
          mine ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-white text-ink shadow-[0_1px_2px_rgba(18,18,18,0.08)]"
        } ${failed ? "opacity-70" : ""}`}
      >
        {body}
      </p>
      {meta && <span className="mt-1 px-1 text-[11px] tabular-nums text-ink/45">{meta}</span>}
      {failed && (
        <span className="mt-1 flex items-center gap-2 px-1 text-[11.5px] text-brand" role="alert">
          Not sent. {failed === NETWORK ? "Check your connection." : failed}
          {onRetry && (
            <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
              Retry
            </button>
          )}
        </span>
      )}
    </div>
  );
}
