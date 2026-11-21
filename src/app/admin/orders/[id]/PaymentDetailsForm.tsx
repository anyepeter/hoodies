"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { btn, field } from "@/components/admin/ui";
import { sendOrderPaymentDetails } from "../actions";

const MAX = 2000;
const noSubscribe = () => () => {};

/**
 * The payment-details message for this order, prefilled from its method's template, which the admin checks
 * (and may edit) before it goes into the shopper's chat. Sending again is allowed.
 */
export function PaymentDetailsForm({ id, initial, sentAt, waiting }: { id: string; initial: string; sentAt: string | null; waiting: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  // False on the server and while hydrating. Until then the field is read-only: anything typed earlier would
  // show on screen but not be what gets sent.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) {
          setError("Write the message with the payment details first.");
          return;
        }
        start(async () => {
          setError(null);
          setSent(false);
          try {
            const res = await sendOrderPaymentDetails({ id, body });
            if (!res.ok) return setError(res.error);
            setSent(true);
            router.refresh();
          } catch {
            setError("We couldn't reach the server. Check your connection and try again.");
          }
        });
      }}
      className="space-y-2"
    >
      <label htmlFor="payment-details" className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Payment details message
      </label>
      <textarea
        id="payment-details"
        rows={5}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (error) setError(null);
        }}
        maxLength={MAX}
        readOnly={!hydrated}
        className={`${field} resize-y`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "payment-details-error" : "payment-details-hint"}
      />
      <p id="payment-details-hint" className="text-xs text-zinc-500">
        Filled in from the payment method. Check the account and amount, edit if needed, then send.
        {waiting && " The shopper hasn't confirmed the invoice yet; you can still send it."}
      </p>
      {error && (
        <p id="payment-details-error" className="text-sm font-medium text-brand" role="alert">
          {error}
        </p>
      )}
      {sent && !error && (
        <p className="text-sm font-medium text-emerald-700" role="status">
          Sent to the shopper&apos;s chat.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !hydrated} className={btn.primary}>
          {pending ? "Sending…" : sentAt ? "Send again" : "Send payment details"}
        </button>
        {sentAt && (
          <span className="text-sm text-zinc-600" data-testid="payment-sent-at">
            Sent at {sentAt}
          </span>
        )}
      </div>
    </form>
  );
}
