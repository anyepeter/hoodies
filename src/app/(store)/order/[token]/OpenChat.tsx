"use client";

import { useEffect } from "react";

/** The chat widget listens for exactly this window event and opens its panel. */
export const OPEN_CHAT_EVENT = "akz:open-chat";

const openChat = () => window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT));

/**
 * Opens the chat once when the confirmation loads, so the invoice is the first thing the shopper sees. A tiny
 * delay lets the widget (mounted by the store layout) attach its listener first.
 */
export function OpenChatOnLoad() {
  useEffect(() => {
    const t = window.setTimeout(openChat, 400);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}

/** For when they closed it: back to the invoice in one tap. */
export function OpenChatButton({ className = "" }: { className?: string }) {
  return (
    <button type="button" onClick={openChat} className={`btn-brand h-12 gap-2 rounded-2xl px-6 text-[15px] ${className}`}>
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12Z" strokeLinejoin="round" />
      </svg>
      Open the chat
    </button>
  );
}
