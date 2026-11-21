"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { btn } from "@/components/admin/ui";
import { sendUpdatedInvoice } from "./actions";

const NETWORK_ERROR = "We couldn't reach the server. Check your connection and try again.";

/**
 * "Send updated invoice" in the Chat & payment card: the next invoice number goes into the shopper's chat and the
 * current one shows REPLACED there. `prompt` = the order was edited after the last invoice, so this is the next step.
 */
export function SendUpdatedInvoice({
  id,
  current,
  next,
  enabled,
  reason,
  prompt,
}: {
  id: string;
  /** "INV-1001" */
  current: string;
  /** "INV-1001-2" */
  next: string;
  enabled: boolean;
  /** Why it's disabled. */
  reason: string | null;
  prompt: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = () =>
    start(async () => {
      setError(null);
      setSent(null);
      try {
        const res = await sendUpdatedInvoice({ id });
        if (!res.ok) {
          setError(res.error);
          router.refresh();
          return;
        }
        setSent(res.invoiceNumber);
        router.refresh();
      } catch {
        setError(NETWORK_ERROR);
      }
    });

  return (
    <div className={prompt && enabled ? "rounded-lg border border-amber-300 bg-amber-50 p-3" : ""} data-testid="updated-invoice">
      {prompt && enabled && (
        <p className="mb-2 font-semibold text-amber-900" data-testid="updated-invoice-prompt">
          Order saved. Send the updated invoice so the shopper can confirm it.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={send} disabled={!enabled || pending} className={prompt && enabled ? btn.primary : btn.secondary}>
          {pending ? "Sending…" : "Send updated invoice"}
        </button>
        <span className="min-w-0 flex-1 basis-48 text-xs text-zinc-600">
          {enabled ? (
            <>
              Sends <b className="font-semibold text-ink">{next}</b> to the chat with “is everything correct?” again. {current} shows as replaced.
            </>
          ) : (
            reason
          )}
        </span>
      </div>
      {sent && !error && (
        <p className="mt-2 font-medium text-emerald-700" role="status" data-testid="updated-invoice-sent">
          {sent} sent to the chat
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 font-medium text-brand" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
