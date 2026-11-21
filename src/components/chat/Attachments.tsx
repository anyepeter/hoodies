"use client";

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { ChatFileDTO } from "@/lib/chat/shared";
import { fileSize } from "./attach";

/*
 * Files in a chat message, for the shopper's widget and the admin inbox: a picture (its box reserved from the
 * stored width/height so the thread doesn't jump while it loads; tap → full screen) or a PDF chip (opens in a new
 * tab). Both load from the access-checked file routes; names are plain text (React escapes them).
 */

const MAX_W = 240;
const MAX_H = 320;

/** The picture's box: at most 240 px wide and 320 px tall, in its own shape. */
function boxOf(w: number | null, h: number | null): { width: number; aspectRatio: string } {
  if (!w || !h) return { width: MAX_W, aspectRatio: "4 / 3" };
  let width = Math.min(MAX_W, w);
  if ((width * h) / w > MAX_H) width = Math.max(96, (MAX_H * w) / h);
  return { width: Math.round(width), aspectRatio: `${w} / ${h}` };
}

export function ChatImage({ file, sending = false, onOpen }: { file: ChatFileDTO; sending?: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={sending}
      aria-label={`Open picture ${file.name}`}
      style={boxOf(file.width, file.height)}
      className="relative block max-h-80 max-w-full overflow-hidden rounded-xl bg-black/[0.06] disabled:cursor-default"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- private, access-checked file: the image optimiser can't fetch it */}
      <img src={file.url} alt={file.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      {sending && (
        <span className="absolute inset-0 grid place-items-center bg-black/30">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" aria-hidden />
        </span>
      )}
    </button>
  );
}

function PdfIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}

/** A PDF: icon, name, size. Opens (downloads) in a new tab once it's sent. `mine` = on a dark/brand bubble. */
export function FileChip({ file, mine = false, sending = false }: { file: ChatFileDTO; mine?: boolean; sending?: boolean }) {
  const inner = (
    <>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${mine ? "bg-white/15 text-white" : "bg-brand/10 text-brand"}`}>
        <PdfIcon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13.5px] font-semibold">{file.name}</span>
        <span className={`block text-[11.5px] ${mine ? "text-white/70" : "text-ink/55"}`}>
          PDF · {fileSize(file.size)}
          {sending ? " · Sending…" : ""}
        </span>
      </span>
    </>
  );
  const cls = `flex w-[min(15rem,calc(100vw-8rem))] max-w-full items-center gap-3 rounded-xl p-2.5 ${mine ? "bg-white/10" : "bg-black/[0.04]"}`;
  if (sending) return <div className={cls}>{inner}</div>;
  return (
    <a href={file.url} target="_blank" rel="noopener noreferrer" className={`${cls} transition ${mine ? "hover:bg-white/15" : "hover:bg-black/[0.07]"}`}>
      {inner}
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

export function PaperclipIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.9-8.9a3.7 3.7 0 0 1 5.2 5.2l-8.9 8.9a1.8 1.8 0 0 1-2.6-2.6l8.2-8.2" />
    </svg>
  );
}

/** A picture from the chat, full screen: close (button, Escape, tap outside) and download. */
export function ImageViewer({ file, onClose }: { file: ChatFileDTO | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!file) return;
    const before = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      before?.focus?.();
    };
  }, [file]);

  if (!file || typeof document === "undefined") return null;

  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Everything stays here: the chat panel underneath would otherwise close on Escape too.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Tab" && boxRef.current) {
      const items = [...boxRef.current.querySelectorAll<HTMLElement>("a[href], button")];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === boxRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return createPortal(
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="true"
      aria-label="Picture"
      tabIndex={-1}
      onKeyDown={onKey}
      className="fixed inset-0 z-[70] flex flex-col bg-black/90 outline-none motion-safe:animate-[fade_0.15s_ease-out]"
    >
      <div className="flex items-center gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] text-white sm:px-4">
        <p className="min-w-0 flex-1 truncate text-[13px] text-white/80">{file.name}</p>
        <a
          href={file.url}
          download={file.name}
          aria-label="Download picture"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/85 transition hover:bg-white/10 hover:text-white"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
          </svg>
        </a>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close picture"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/85 transition hover:bg-white/10 hover:text-white"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-6" onClick={onClose}>
        {/* eslint-disable-next-line @next/next/no-img-element -- private, access-checked file: the image optimiser can't fetch it */}
        <img src={file.url} alt={file.name} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      </div>
    </div>,
    document.body,
  );
}
