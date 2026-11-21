"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btn } from "@/components/admin/ui";

const OFFLINE = "We couldn't reach the server. Check your connection and try again.";

/** Unsubscribe / resubscribe, and delete with an inline confirm. Errors show next to the buttons. */
export function SubscriberActions({ id, email, subscribed }: { id: string; email: string; subscribed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "PATCH" | "DELETE", body?: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/subscribers/${encodeURIComponent(id)}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "That didn't work. Please try again.");
        setBusy(false);
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setError(OFFLINE);
    }
    setBusy(false);
  }

  const small = "h-8! px-3! text-xs!";
  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Delete ${email}?`}>
          <span className="text-xs text-zinc-600">Delete for good?</span>
          <button type="button" className={`${btn.danger} ${small}`} disabled={busy} onClick={() => call("DELETE")}>
            {busy ? "Deleting…" : "Yes, delete"}
          </button>
          <button type="button" className={`${btn.ghost} ${small}`} disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${btn.secondary} ${small}`}
            disabled={busy}
            onClick={() => call("PATCH", { status: subscribed ? "UNSUBSCRIBED" : "SUBSCRIBED" })}
            aria-label={`${subscribed ? "Unsubscribe" : "Resubscribe"} ${email}`}
          >
            {busy ? "Saving…" : subscribed ? "Unsubscribe" : "Resubscribe"}
          </button>
          <button type="button" className={`${btn.danger} ${small}`} disabled={busy} onClick={() => setConfirming(true)} aria-label={`Delete ${email}`}>
            Delete
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-brand">
          {error}
        </p>
      )}
    </div>
  );
}
