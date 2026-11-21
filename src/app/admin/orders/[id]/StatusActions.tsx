"use client";

import type { OrderStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { btn, field, label } from "@/components/admin/ui";
import { ACTION, TRANSITIONS, restoresStock } from "@/lib/orders/status";
import { changeOrderStatus } from "../actions";

const NETWORK_ERROR = "We couldn't reach the server. Check your connection and try again.";

/**
 * The buttons for the next legal steps. "Mark paid" asks for an optional payment reference first;
 * cancelling or refunding asks to confirm and says whether stock goes back.
 */
export function StatusActions({ id, status, stockBack }: { id: string; status: OrderStatus; stockBack: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<OrderStatus | null>(null);
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [running, setRunning] = useState<OrderStatus | null>(null);
  const next = TRANSITIONS[status];
  const direct = (to: OrderStatus) => to === "SHIPPED" || to === "DELIVERED"; // no questions asked

  if (next.length === 0) return <p className="text-sm text-zinc-500">This order is closed. No further steps.</p>;

  const run = (to: OrderStatus) =>
    start(async () => {
      setError(null);
      setRunning(to);
      try {
        const res = await changeOrderStatus({ id, to, reference: to === "PAID" ? reference : undefined });
        if (!res.ok) {
          setError(res.error);
          router.refresh();
          return;
        }
        setOpen(null);
        setReference("");
        router.refresh();
      } catch {
        setError(NETWORK_ERROR);
      } finally {
        setRunning(null);
      }
    });

  const tone = (to: OrderStatus) => (ACTION[to].tone === "primary" ? btn.primary : ACTION[to].tone === "danger" ? btn.danger : btn.secondary);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {next.map((to) => (
          <button
            key={to}
            type="button"
            disabled={pending}
            onClick={() => (direct(to) ? run(to) : setOpen(open === to ? null : to))}
            className={tone(to)}
            aria-expanded={direct(to) ? undefined : open === to}
          >
            {running === to && direct(to) ? "Saving…" : ACTION[to].label}
          </button>
        ))}
      </div>

      {open === "PAID" && (
        <form
          className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run("PAID");
          }}
        >
          <label htmlFor="reference" className={label}>
            Payment reference <span className="font-normal normal-case tracking-normal text-zinc-400">(optional)</span>
          </label>
          <input
            id="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={200}
            placeholder="Bank reference, PayPal transaction ID…"
            className={`${field} h-10`}
            autoFocus
          />
          <p className="mt-1.5 text-xs text-zinc-500">Only confirm once the money is actually in your account.</p>
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={pending} className={btn.primary}>
              {pending ? "Saving…" : "Confirm payment"}
            </button>
            <button type="button" onClick={() => setOpen(null)} className={btn.ghost}>
              Back
            </button>
          </div>
        </form>
      )}

      {(open === "CANCELLED" || open === "REFUNDED") && (
        <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
          <p className="text-sm font-medium text-ink">{open === "CANCELLED" ? "Cancel this order?" : "Mark this order refunded?"}</p>
          <p className="mt-0.5 text-xs text-zinc-600">
            {restoresStock(status, open) ? (stockBack ? `Back into stock: ${stockBack}.` : "No hoodies to put back in stock.") : "It has shipped, so stock stays as it is."}{" "}
            {open === "REFUNDED" ? "Send the money back yourself first: nothing is refunded automatically." : "This can't be undone."}
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={pending} onClick={() => run(open)} className={btn.danger}>
              {pending ? "Saving…" : open === "CANCELLED" ? "Yes, cancel order" : "Yes, mark refunded"}
            </button>
            <button type="button" onClick={() => setOpen(null)} className={btn.ghost}>
              Keep it
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-brand" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
