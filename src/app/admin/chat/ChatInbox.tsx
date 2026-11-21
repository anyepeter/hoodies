"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { EmptyState, PageHeader, StatusPill, btn } from "@/components/admin/ui";
import { ATTACH_ACCEPT, localFile, prepareAttachment, uploadAttachment, type Prepared } from "@/components/chat/attach";
import { ChatImage, FileChip, ImageViewer, PaperclipIcon } from "@/components/chat/Attachments";
import { InvoiceReceipt, PaymentCard } from "@/components/chat/OrderCards";
import { INVOICE_COPY, MESSAGE_MAX, type ChatFileDTO, type ChatMessageDTO, type ChatStatus, type InvoiceDTO } from "@/lib/chat/shared";

/*
 * Admin → Live chat. Inbox on the left, the open conversation on the right (on a phone: the list, then the
 * conversation full-screen with a back button). The open conversation is ?c=<id>, so push notifications and
 * toasts deep-link straight to it.
 *
 * Live: AdminRealtime turns each Pusher ping into a window event "admin:chat.message" (detail.id = the
 * conversation) and this refetches. Safety net: a refresh every 60 s while the tab is visible, and on return.
 *
 * Orders live in the chat: an order's invoice shows as a receipt card with the shopper's answer ("is everything
 * correct?"), a link to the order and "Send payment details" (the form is on the order page, #payment). The
 * payment details, once sent, show as a highlighted card. An invoice an updated one replaced shows REPLACED and
 * no actions: only the newest counts.
 *
 * Pictures and PDFs both ways: the paperclip sends one (pictures made small in the browser, the text box as its
 * caption), shown as "Sending…" until saved, with Retry if it fails. Tap a picture to see it full screen.
 */

type Row = {
  id: string;
  name: string | null;
  email: string | null;
  status: ChatStatus;
  unreadForAdmin: number;
  lastMessage: string | null;
  lastMessageAt: string;
  createdAt: string;
  lastFrom: "VISITOR" | "ADMIN" | "SYSTEM" | null;
  lastKind: string | null;
};
type Counts = { open: number; closed: number; all: number };
type Filter = keyof Counts;
type Detail = {
  id: string;
  name: string | null;
  email: string | null;
  status: ChatStatus;
  visitorId: string | null;
  pagePath: string | null;
  device: string;
  unreadForVisitor: number;
  createdAt: string;
  lastMessageAt: string;
};

const REFRESH_MS = 60_000;
const NETWORK = "We couldn't reach the server. Check your connection and try again.";

/** A file of ours on its way (or failed), shown after the saved messages. */
type PendingUpload = ChatMessageDTO & { pending: "sending" | "failed"; error?: string };
let uploadSeq = 0;

type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function api<T>(url: string, init?: { method: string; body?: unknown }): Promise<Result<T>> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const json = (await res.json().catch(() => null)) as ({ ok?: boolean; error?: string } & T) | null;
    if (res.status === 401) return { ok: false, status: 401, error: "You've been signed out. Reload the page to sign in again." };
    if (!res.ok || !json?.ok) return { ok: false, status: res.status, error: json?.error ?? "Something went wrong. Please try again." };
    return { ok: true, data: json };
  } catch {
    return { ok: false, status: 0, error: NETWORK };
  }
}

const who = (c: { name: string | null; email: string | null }) => c.name || c.email || "Visitor";
const initial = (c: { name: string | null; email: string | null }) => (c.name || c.email || "V").trim().charAt(0).toUpperCase();

function ago(iso: string, now: number): string {
  const d = new Date(iso);
  const mins = Math.floor((now - d.getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins} min`;
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(now - 86_400_000);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const fullDate = (iso: string) => new Date(iso).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Calls `fn` every 60 s while the tab is visible, and when it becomes visible again. */
function useVisibleRefresh(fn: () => void) {
  useEffect(() => {
    const timer = window.setInterval(() => document.visibilityState === "visible" && fn(), REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && fn();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fn]);
}

/** Runs `fn` whenever a chat ping arrives (any conversation). */
function useChatPing(fn: (conversationId: string | null) => void) {
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<{ id?: unknown } | null>).detail?.id;
      fn(typeof id === "string" ? id : null);
    };
    window.addEventListener("admin:chat.message", on);
    return () => window.removeEventListener("admin:chat.message", on);
  }, [fn]);
}

export function ChatInbox() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = params.get("c");

  const [filter, setFilter] = useState<Filter>("open");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Counts>({ open: 0, closed: 0, all: 0 });
  const [listError, setListError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  const loadList = useCallback(async () => {
    const r = await api<{ conversations: Row[]; counts: Counts }>(`/api/admin/chat?status=${filter}`);
    setNow(Date.now());
    if (!r.ok) return setListError(r.error);
    setListError(null);
    setRows(r.data.conversations);
    setCounts(r.data.counts);
  }, [filter]);

  useEffect(() => {
    const t = window.setTimeout(() => void loadList(), 0);
    return () => window.clearTimeout(t);
  }, [loadList]);
  useVisibleRefresh(loadList);
  useChatPing(useCallback(() => void loadList(), [loadList]));

  const openConversation = (id: string) => router.push(`${pathname}?c=${id}`, { scroll: false });
  const back = () => router.push(pathname, { scroll: false });

  return (
    <div>
      <div className={active ? "hidden lg:block" : ""}>
        <PageHeader title="Live chat" subtitle="Questions from shoppers, as they come in. Replies show up in their chat window straight away." />
      </div>

      <div className={`grid gap-4 lg:h-[calc(100dvh-9.5rem)] lg:min-h-[32rem] lg:grid-cols-[22rem_1fr] ${active ? "h-[calc(100dvh-6.5rem)] lg:h-[calc(100dvh-9.5rem)]" : ""}`}>
        {/* Inbox */}
        <section aria-label="Conversations" className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm ${active ? "hidden lg:flex" : "flex"}`}>
          <div className="flex gap-1 border-b border-zinc-100 p-2" role="tablist" aria-label="Show">
            {(["open", "closed", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => {
                  setFilter(f);
                  setRows(null);
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium capitalize transition ${filter === f ? "bg-ink text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-ink"}`}
              >
                {f}
                <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${filter === f ? "bg-white/20" : "bg-zinc-200 text-zinc-700"}`}>{counts[f]}</span>
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {listError && (
              <p className="m-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-brand" role="alert">
                {listError}{" "}
                <button type="button" onClick={() => void loadList()} className="font-semibold underline">
                  Try again
                </button>
              </p>
            )}
            {rows === null && !listError && <ListSkeleton />}
            {rows?.length === 0 && (
              <div className="p-3">
                <EmptyState title={filter === "closed" ? "No closed conversations" : "No conversations yet"}>
                  {filter === "closed" ? "Conversations you close end up here." : "When a shopper writes in from the chat bubble on the store, it appears here."}
                </EmptyState>
              </div>
            )}
            {rows && rows.length > 0 && (
              <ul className="divide-y divide-zinc-100">
                {rows.map((c) => {
                  const selected = c.id === active;
                  const unread = c.unreadForAdmin > 0;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => openConversation(c.id)}
                        aria-current={selected ? "true" : undefined}
                        className={`relative flex w-full items-start gap-3 px-4 py-3 text-left transition ${selected ? "bg-zinc-100" : "hover:bg-zinc-50"}`}
                      >
                        {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-brand" aria-hidden />}
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${unread ? "bg-brand text-white" : "bg-zinc-200 text-zinc-600"}`} aria-hidden>
                          {initial(c)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className={`min-w-0 flex-1 truncate text-sm ${unread ? "font-bold text-ink" : "font-medium text-ink"}`}>{who(c)}</span>
                            <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">{ago(c.lastMessageAt, now)}</span>
                          </span>
                          {c.name && c.email && <span className="block truncate text-[11px] text-zinc-400">{c.email}</span>}
                          <span className="mt-0.5 flex items-center gap-2">
                            <span className={`min-w-0 flex-1 truncate text-[13px] ${unread ? "text-ink" : "text-zinc-500"}`}>
                              {c.lastFrom === "ADMIN" && c.lastKind !== "INVOICE" && <span className="text-zinc-400">You: </span>}
                              {c.lastMessage || "…"}
                            </span>
                            {unread && (
                              <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold tabular-nums text-white" aria-label={`${c.unreadForAdmin} unread`}>
                                {c.unreadForAdmin > 99 ? "99+" : c.unreadForAdmin}
                              </span>
                            )}
                            {filter === "all" && c.status === "CLOSED" && <StatusPill status="CLOSED" />}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Conversation */}
        <section aria-label="Conversation" className={`min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm ${active ? "flex" : "hidden lg:flex"}`}>
          {active ? (
            <ThreadPane key={active} id={active} onBack={back} onChanged={loadList} onGone={back} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-zinc-100 text-zinc-400" aria-hidden>
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 20l1.8-5.1A7.5 7.5 0 1 1 20 11.5Z" />
                </svg>
              </span>
              <p className="font-semibold text-ink">Pick a conversation</p>
              <p className="max-w-xs text-sm text-zinc-500">Choose one on the left to read it and reply.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="divide-y divide-zinc-100" aria-label="Loading conversations">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex gap-3 px-4 py-3">
          <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-zinc-200" />
          <span className="flex-1 space-y-2 py-0.5">
            <span className="block h-3 w-1/2 animate-pulse rounded bg-zinc-200" />
            <span className="block h-3 w-4/5 animate-pulse rounded bg-zinc-100" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function ThreadPane({ id, onBack, onChanged, onGone }: { id: string; onBack: () => void; onChanged: () => void; onGone: () => void }) {
  const [conv, setConv] = useState<Detail | null>(null);
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"status" | "delete" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [viewing, setViewing] = useState<ChatFileDTO | null>(null);
  /** What to send again on Retry, and the preview to free, by local id. */
  const uploadData = useRef(new Map<string, { prepared: Prepared; caption: string; url: string }>());

  const load = useCallback(async () => {
    const r = await api<{ conversation: Detail; messages: ChatMessageDTO[]; cleared: boolean }>(`/api/admin/chat/${id}`);
    if (!r.ok) {
      if (r.status === 404) setMissing(true);
      else setLoadError(r.error);
      return;
    }
    setLoadError(null);
    setConv(r.data.conversation);
    setMessages(r.data.messages);
    if (r.data.cleared) {
      // It was unread and now isn't: the sidebar badge and the inbox row both change.
      window.dispatchEvent(new CustomEvent("admin:badges"));
      onChanged();
    }
  }, [id, onChanged]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);
  useVisibleRefresh(load);
  useChatPing(useCallback((pinged: string | null) => (pinged === null || pinged === id) && void load(), [id, load]));

  const lastId = messages.at(-1)?.id;
  const lastUpload = uploads.at(-1);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, lastUpload?.id, lastUpload?.pending]);

  useEffect(() => {
    const map = uploadData.current;
    return () => map.forEach((u) => URL.revokeObjectURL(u.url));
  }, []);

  const dropUpload = (localId: string) => {
    const u = uploadData.current.get(localId);
    if (u) URL.revokeObjectURL(u.url);
    uploadData.current.delete(localId);
    setUploads((prev) => prev.filter((x) => x.id !== localId));
  };

  const sendFile = async (prepared: Prepared, caption: string, retryId?: string) => {
    const localId = retryId ?? `upload-${++uploadSeq}`;
    if (retryId) {
      setUploads((prev) => prev.map((u) => (u.id === retryId ? { ...u, pending: "sending", error: undefined } : u)));
    } else {
      const url = URL.createObjectURL(prepared.blob);
      uploadData.current.set(localId, { prepared, caption, url });
      setUploads((prev) => [
        ...prev,
        { id: localId, sender: "ADMIN", body: caption, createdAt: new Date().toISOString(), kind: "TEXT", file: localFile(prepared, localId, url), pending: "sending" },
      ]);
    }
    const r = await uploadAttachment(`/api/admin/chat/${id}/files`, prepared, caption);
    if (r.ok) {
      dropUpload(localId);
      setMessages((prev) => (prev.some((m) => m.id === r.message.id) ? prev : [...prev, r.message]));
      setConv((c) => (c ? { ...c, unreadForVisitor: c.unreadForVisitor + 1 } : c));
      onChanged();
      return;
    }
    if (r.status === 404) setMissing(true);
    setUploads((prev) => prev.map((u) => (u.id === localId ? { ...u, pending: "failed", error: r.error } : u)));
  };

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // the same file can be picked again
    if (!file || preparing) return;
    setPreparing(true);
    const p = await prepareAttachment(file);
    setPreparing(false);
    if (!p.ok) return setReplyError(p.error);
    const caption = draft.trim().slice(0, MESSAGE_MAX);
    setDraft("");
    setReplyError(null);
    void sendFile(p.file, caption);
  };

  const reply = async () => {
    const text = draft.trim();
    if (!text || sending) {
      if (!text) setReplyError("Write a reply first.");
      return;
    }
    setSending(true);
    setReplyError(null);
    const r = await api<{ message: ChatMessageDTO }>(`/api/admin/chat/${id}`, { method: "POST", body: { message: text } });
    setSending(false);
    if (!r.ok) {
      if (r.status === 404) setMissing(true);
      return setReplyError(r.error);
    }
    setDraft("");
    setMessages((prev) => (prev.some((m) => m.id === r.data.message.id) ? prev : [...prev, r.data.message]));
    setConv((c) => (c ? { ...c, unreadForVisitor: c.unreadForVisitor + 1 } : c));
    onChanged();
    inputRef.current?.focus();
  };

  const setStatus = async (status: ChatStatus) => {
    setBusy("status");
    setActionError(null);
    const r = await api<{ status: ChatStatus }>(`/api/admin/chat/${id}`, { method: "PATCH", body: { status } });
    setBusy(null);
    if (!r.ok) return setActionError(r.error);
    setConv((c) => (c ? { ...c, status } : c));
    window.dispatchEvent(new CustomEvent("admin:badges"));
    onChanged();
  };

  const remove = async () => {
    setBusy("delete");
    setActionError(null);
    const r = await api(`/api/admin/chat/${id}`, { method: "DELETE" });
    setBusy(null);
    if (!r.ok && r.status !== 404) return setActionError(r.error);
    window.dispatchEvent(new CustomEvent("admin:badges"));
    onChanged();
    onGone();
  };

  const onKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void reply();
    }
  };

  if (missing) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-semibold text-ink">This conversation doesn&apos;t exist any more</p>
        <p className="text-sm text-zinc-500">It may have been deleted on another device.</p>
        <button type="button" onClick={onBack} className={btn.secondary}>
          Back to the inbox
        </button>
      </div>
    );
  }

  const last = messages.at(-1);

  return (
    <>
      {/* Who */}
      <div className="flex items-center gap-3 border-b border-zinc-100 px-3 py-3 sm:px-4">
        <button type="button" onClick={onBack} aria-label="Back to conversations" className="-ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-ink lg:hidden">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {conv ? (
          <>
            <span className="hidden h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-200 text-sm font-bold text-zinc-600 sm:grid" aria-hidden>
              {initial(conv)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-ink">{who(conv)}</span>
                <StatusPill status={conv.status} />
              </p>
              {conv.email ? (
                <a href={`mailto:${conv.email}`} className="block truncate text-xs text-zinc-500 hover:text-brand">
                  {conv.email}
                </a>
              ) : (
                <p className="text-xs text-zinc-400">No email given</p>
              )}
            </div>
            {!confirmDelete && (
              <div className="flex shrink-0 gap-1.5">
                <button type="button" disabled={busy !== null} onClick={() => void setStatus(conv.status === "OPEN" ? "CLOSED" : "OPEN")} className={`${btn.secondary} h-9 px-3`}>
                  {busy === "status" ? "Saving…" : conv.status === "OPEN" ? "Close" : "Reopen"}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => setConfirmDelete(true)} className={`${btn.danger} h-9 px-3`} aria-label="Delete conversation">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.87 12.14A2 2 0 0116.14 21H7.86a2 2 0 01-1.99-1.86L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
                  </svg>
                  <span className="hidden sm:inline">Delete</span>
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 space-y-2">
            <span className="block h-3.5 w-40 animate-pulse rounded bg-zinc-200" />
            <span className="block h-3 w-28 animate-pulse rounded bg-zinc-100" />
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="flex flex-wrap items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-3 text-sm" role="alertdialog" aria-label="Delete this conversation?">
          <p className="min-w-0 flex-1 text-red-800">Delete this conversation and all its messages? This can&apos;t be undone.</p>
          <button type="button" onClick={() => setConfirmDelete(false)} disabled={busy === "delete"} className={`${btn.secondary} h-9 px-3`}>
            Cancel
          </button>
          <button type="button" onClick={() => void remove()} disabled={busy === "delete"} className="inline-flex h-9 items-center rounded-lg bg-red-700 px-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">
            {busy === "delete" ? "Deleting…" : "Delete for good"}
          </button>
        </div>
      )}
      {actionError && (
        <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-brand" role="alert">
          {actionError}
        </p>
      )}

      {/* Visitor info */}
      {conv && (
        <dl className="flex flex-wrap gap-x-5 gap-y-1 border-b border-zinc-100 bg-zinc-50/70 px-4 py-2 text-xs text-zinc-500">
          <div className="flex gap-1">
            <dt>Started</dt>
            <dd className="font-medium text-zinc-700">{fullDate(conv.createdAt)}</dd>
          </div>
          {conv.pagePath && /^\/(?![\/\\])[^\s\\]*$/.test(conv.pagePath) && (
            <div className="flex min-w-0 gap-1">
              <dt className="shrink-0">on</dt>
              <dd className="min-w-0 truncate font-medium text-zinc-700">
                <a href={conv.pagePath} target="_blank" rel="noreferrer" className="hover:text-brand">
                  {conv.pagePath}
                </a>
              </dd>
            </div>
          )}
          <div className="flex gap-1">
            <dt>Device</dt>
            <dd className="font-medium text-zinc-700">{conv.device}</dd>
          </div>
        </dl>
      )}

      {/* Messages */}
      <div ref={listRef} role="log" aria-label="Messages" className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-zinc-50 px-3 py-4 sm:px-5">
        {loadError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand" role="alert">
            {loadError}{" "}
            <button type="button" onClick={() => void load()} className="font-semibold underline">
              Try again
            </button>
          </p>
        )}
        {!conv && !loadError && (
          <div className="space-y-2" aria-label="Loading messages">
            <div className="h-12 w-2/3 animate-pulse rounded-2xl bg-zinc-200/70" />
            <div className="ml-auto h-10 w-1/2 animate-pulse rounded-2xl bg-zinc-200/70" />
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.sender === "ADMIN";
          const newDay = i === 0 || dayOf(messages[i - 1].createdAt) !== dayOf(m.createdAt);
          return (
            <div key={m.id}>
              {newDay && <p className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{dayOf(m.createdAt)}</p>}
              {m.sender === "SYSTEM" ? (
                <p className="text-center text-xs text-zinc-400">{m.body}</p>
              ) : m.kind === "INVOICE" && m.invoice ? (
                <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  {/* The message's first line ("Here's your updated invoice."); the rest of its text is the card. */}
                  {m.invoice.version > 1 && <p className="mb-1.5 max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-sm leading-relaxed text-white sm:max-w-[70%]">{INVOICE_COPY.updated}</p>}
                  <div className="w-full max-w-sm">
                    <AdminInvoice invoice={m.invoice} paymentSent={messages.some((x) => x.kind === "PAYMENT" && x.invoice?.orderId === m.invoice?.orderId)} />
                  </div>
                  <span className="mt-0.5 px-1 text-[11px] tabular-nums text-zinc-400">
                    {timeOf(m.createdAt)} · {m.invoice.version > 1 ? "Updated invoice" : "Sent automatically with the order"}
                  </span>
                </div>
              ) : m.kind === "PAYMENT" ? (
                <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  <div className="w-full max-w-sm">
                    <PaymentCard title={m.invoice ? `Payment details sent · ${m.invoice.number}` : "Payment details sent"} body={m.body} />
                  </div>
                  <span className="mt-0.5 px-1 text-[11px] tabular-nums text-zinc-400">
                    {timeOf(m.createdAt)}
                    {m.id === last?.id && conv && (conv.unreadForVisitor > 0 ? " · Not seen yet" : " · Seen")}
                  </span>
                </div>
              ) : (
                <AdminBubble message={m} mine={mine} onOpenFile={setViewing}>
                  {timeOf(m.createdAt)}
                  {mine && m.id === last?.id && uploads.length === 0 && conv && (conv.unreadForVisitor > 0 ? " · Not seen yet" : " · Seen")}
                </AdminBubble>
              )}
            </div>
          );
        })}
        {uploads.map((u) => (
          <AdminBubble key={u.id} message={u} mine sending={u.pending === "sending"} onOpenFile={setViewing}>
            {u.pending === "sending" ? (
              "Sending…"
            ) : (
              <span className="inline-flex flex-wrap items-center justify-end gap-x-2 text-brand" role="alert">
                Not sent. {u.error === NETWORK ? "Check your connection." : u.error}
                <button
                  type="button"
                  onClick={() => {
                    const d = uploadData.current.get(u.id);
                    if (d) void sendFile(d.prepared, d.caption, u.id);
                  }}
                  className="font-semibold underline underline-offset-2"
                >
                  Retry
                </button>
                <button type="button" onClick={() => dropUpload(u.id)} className="text-zinc-500 underline underline-offset-2">
                  Remove
                </button>
              </span>
            )}
          </AdminBubble>
        ))}
      </div>
      <ImageViewer file={viewing} onClose={() => setViewing(null)} />

      {/* Reply */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void reply();
        }}
        className="border-t border-zinc-100 p-3"
        noValidate
      >
        {replyError && (
          <p className="mb-2 text-sm text-brand" role="alert">
            {replyError}
          </p>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} onChange={(e) => void onPickFile(e)} className="sr-only" tabIndex={-1} aria-hidden />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={!conv || preparing}
            aria-label="Attach a picture or PDF"
            title="Attach a picture or PDF"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-zinc-300 bg-white text-zinc-600 shadow-sm transition hover:border-zinc-400 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {preparing ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-ink motion-reduce:animate-none" aria-hidden />
            ) : (
              <PaperclipIcon className="h-5 w-5" />
            )}
          </button>
          <label htmlFor="admin-chat-reply" className="sr-only">
            Reply
          </label>
          <textarea
            id="admin-chat-reply"
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (replyError) setReplyError(null);
            }}
            onKeyDown={onKey}
            rows={1}
            maxLength={MESSAGE_MAX}
            disabled={!conv}
            placeholder={conv?.status === "CLOSED" ? "Closed. You can still reply…" : "Write a reply…"}
            className="max-h-40 min-h-10 flex-1 resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-ink shadow-sm outline-none transition [field-sizing:content] placeholder:text-zinc-400 focus:border-ink focus:ring-2 focus:ring-ink/10 disabled:bg-zinc-50"
          />
          <button type="submit" disabled={sending || !conv} className={btn.primary}>
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
        <p className="mt-1.5 hidden text-[11px] text-zinc-400 sm:block">Enter to send · Shift + Enter for a new line</p>
      </form>
    </>
  );
}

const ANSWER: Record<"waiting" | "confirmed" | "wrong", { text: string; tone: string }> = {
  waiting: { text: "Waiting for the shopper", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  confirmed: { text: "Confirmed ✓", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  wrong: { text: "Says something's wrong", tone: "bg-red-50 text-red-800 ring-red-200" },
};

/** A text message, or a picture / PDF with its caption. `children` is the line under it (time, seen, errors). */
function AdminBubble({
  message: m,
  mine,
  sending = false,
  onOpenFile,
  children,
}: {
  message: ChatMessageDTO;
  mine: boolean;
  sending?: boolean;
  onOpenFile: (file: ChatFileDTO) => void;
  children: ReactNode;
}) {
  const tone = mine ? "rounded-br-md bg-ink text-white" : "rounded-bl-md border border-zinc-200 bg-white text-ink";
  const file = m.file;
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      {file ? (
        <div className={`max-w-[85%] overflow-hidden rounded-2xl p-1 sm:max-w-[70%] ${tone}`}>
          {file.kind === "image" ? <ChatImage file={file} sending={sending} onOpen={() => onOpenFile(file)} /> : <FileChip file={file} mine={mine} sending={sending} />}
          {m.body && <p className="whitespace-pre-wrap break-words px-2.5 pb-1.5 pt-1.5 text-sm leading-relaxed">{m.body}</p>}
        </div>
      ) : (
        <p className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed sm:max-w-[70%] ${tone}`}>{m.body}</p>
      )}
      <span className="mt-0.5 px-1 text-[11px] tabular-nums text-zinc-400">{children}</span>
    </div>
  );
}

/**
 * An order's invoice in the thread: the receipt, what the shopper answered, and the next step. Only the newest
 * invoice of an order has an answer and actions; a replaced one just says so.
 */
function AdminInvoice({ invoice, paymentSent }: { invoice: InvoiceDTO; paymentSent: boolean }) {
  const answer = ANSWER[invoice.answer ?? "waiting"];
  const pending = invoice.status === "PENDING";
  const order = invoice.orderId ? `/admin/orders/${encodeURIComponent(invoice.orderId)}` : null;

  if (!invoice.latest) {
    return (
      <InvoiceReceipt invoice={invoice}>
        <div className="space-y-2.5 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
          <p className="text-xs text-zinc-500">Replaced by an updated invoice. Only the newest one counts.</p>
          {order && (
            <Link prefetch={false} href={order} className={`${btn.secondary} h-9 w-full`}>
              Open order {invoice.number}
            </Link>
          )}
        </div>
      </InvoiceReceipt>
    );
  }

  return (
    <InvoiceReceipt invoice={invoice}>
      <div className="space-y-2.5 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
        <p className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-medium text-zinc-500">&ldquo;Is everything correct?&rdquo;</span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset ${answer.tone}`}>{answer.text}</span>
        </p>
        {order && (
          <div className="flex flex-col gap-2">
            {pending &&
              (paymentSent ? (
                <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                  <span className="font-semibold text-emerald-700">Payment details sent ✓</span>
                  <Link prefetch={false} href={`${order}#payment`} className="font-semibold text-zinc-600 underline-offset-2 hover:text-ink hover:underline">
                    Send again
                  </Link>
                </p>
              ) : (
                <Link prefetch={false} href={`${order}#payment`} className={`${btn.primary} w-full`}>
                  Send payment details
                </Link>
              ))}
            <Link prefetch={false} href={order} className={`${btn.secondary} h-9 w-full`}>
              Open order {invoice.number}
            </Link>
            {pending && (
              <Link prefetch={false} href={`${order}#payment`} className="self-center text-xs font-semibold text-zinc-500 underline-offset-2 hover:text-ink hover:underline">
                Send updated invoice
              </Link>
            )}
          </div>
        )}
      </div>
    </InvoiceReceipt>
  );
}
