"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btn } from "@/components/admin/ui";

const OFFLINE = "We couldn't reach the server. Check your connection and try again.";
type Status = "UNREAD" | "READ" | "ARCHIVED";

/** Mark unread, archive / move back to inbox, delete (with an inline confirm). */
export function MessageActions({ id, status, replyHref }: { id: string; status: Status; replyHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(what: string, method: "PATCH" | "DELETE", next?: Status) {
    setBusy(what);
    setError(null);
    try {
      const res = await fetch(`/api/admin/messages/${encodeURIComponent(id)}`, {
        method,
        headers: next ? { "Content-Type": "application/json" } : undefined,
        body: next ? JSON.stringify({ status: next }) : undefined,
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "That didn't work. Please try again.");
      } else if (method === "DELETE" || next === "UNREAD") {
        // Back to the list: staying here would mark an "unread" message read again on the next render.
        router.push("/admin/messages");
        return;
      } else {
        router.refresh();
      }
    } catch {
      setError(OFFLINE);
    }
    setBusy(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <a href={replyHref} className={btn.primary}>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          Reply by email
        </a>
        {status !== "UNREAD" && (
          <button type="button" className={btn.secondary} disabled={busy !== null} onClick={() => call("unread", "PATCH", "UNREAD")}>
            {busy === "unread" ? "Saving…" : "Mark unread"}
          </button>
        )}
        <button type="button" className={btn.secondary} disabled={busy !== null} onClick={() => call("archive", "PATCH", status === "ARCHIVED" ? "READ" : "ARCHIVED")}>
          {busy === "archive" ? "Saving…" : status === "ARCHIVED" ? "Unarchive" : "Archive"}
        </button>
        {!confirming && (
          <button type="button" className={`${btn.danger} sm:ml-auto`} disabled={busy !== null} onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
      </div>
      {confirming && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5" role="group" aria-label="Confirm delete">
          <p className="mr-auto text-sm text-red-800">Delete this message for good? This can&apos;t be undone.</p>
          <button type="button" className={btn.danger} disabled={busy !== null} onClick={() => call("delete", "DELETE")}>
            {busy === "delete" ? "Deleting…" : "Yes, delete"}
          </button>
          <button type="button" className={btn.ghost} disabled={busy !== null} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-brand">
          {error}
        </p>
      )}
    </div>
  );
}
