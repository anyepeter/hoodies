"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { INVOICE_COPY, type InvoiceAnswer, type InvoiceDTO } from "@/lib/chat/shared";

/*
 * Orders in the chat: the invoice as a small receipt, and the payment details the admin sends for it. Used by
 * the shopper's chat widget and by the admin inbox, so both see the same card. Everything here is plain text
 * from our own API (never rendered as HTML).
 *
 * An order can have several invoices (INV-1001, then INV-1001-2 after "Something's wrong" and a fix). Only the
 * newest one counts: an older one shows a grey REPLACED stamp, folded up and dimmed, without any buttons.
 */

const NETWORK = "We couldn't reach the server. Check your connection and try again.";

const STAMP: Record<string, { text: string; tone: string }> = {
  PENDING: { text: "Payment due", tone: "border-brand/40 text-brand" },
  PAID: { text: "Paid", tone: "border-emerald-600/40 text-emerald-700" },
  SHIPPED: { text: "Paid", tone: "border-emerald-600/40 text-emerald-700" },
  DELIVERED: { text: "Paid", tone: "border-emerald-600/40 text-emerald-700" },
  CANCELLED: { text: "Cancelled", tone: "border-zinc-400 text-zinc-500" },
  REFUNDED: { text: "Refunded", tone: "border-zinc-400 text-zinc-500" },
};

const REPLACED = { text: "Replaced", tone: "border-zinc-300 bg-zinc-100 text-zinc-500" };

const dateOf = (iso: string) => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });

/** "−$11.46 (Cryptocurrency)" → ["−$11.46", "Cryptocurrency"], so the reason can sit with the label. */
function splitDiscount(text: string): [string, string | null] {
  const m = /^(\S+)\s+\((.+)\)$/.exec(text);
  return m ? [m[1], m[2]] : [text, null];
}

/**
 * The invoice itself: number, order and date, lines, totals, how they're paying. `children` go along the bottom
 * edge. A replaced invoice starts folded (header + "Show details") and dimmed.
 */
export function InvoiceReceipt({ invoice, children }: { invoice: InvoiceDTO; children?: ReactNode }) {
  const replaced = !invoice.latest;
  const [open, setOpen] = useState(!replaced);
  const detailsId = useId();
  const stamp = replaced ? REPLACED : (STAMP[invoice.status] ?? { text: invoice.status.toLowerCase(), tone: "border-zinc-300 text-zinc-500" });
  const [discount, discountWhy] = invoice.discount ? splitDiscount(invoice.discount) : [null, null];
  return (
    <article
      aria-label={`Invoice ${invoice.invoiceNumber}`}
      className={`w-full overflow-hidden rounded-xl border border-black/10 border-t-[3px] text-ink ${
        replaced ? "border-t-zinc-300 bg-zinc-50" : "border-t-brand bg-white shadow-[0_1px_2px_rgba(18,18,18,0.06),0_8px_24px_-14px_rgba(18,18,18,0.25)]"
      }`}
    >
      <header className="flex items-start justify-between gap-3 px-4 pb-3 pt-3.5">
        <div className="min-w-0">
          <h3 className={`text-[15px] font-bold leading-tight tabular-nums [overflow-wrap:anywhere] ${replaced ? "text-ink/60" : ""}`}>Invoice {invoice.invoiceNumber}</h3>
          <p className="mt-0.5 text-[12px] tabular-nums text-ink/55">
            Order {invoice.number} · {dateOf(invoice.createdAt)}
          </p>
        </div>
        <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${stamp.tone}`}>{stamp.text}</span>
      </header>

      {replaced && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={detailsId}
          className="mx-4 mb-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink/60 underline-offset-2 hover:text-ink hover:underline"
        >
          {open ? "Hide details" : "Show details"}
          <svg className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      )}

      {open && (
        <div id={detailsId} className={replaced ? "opacity-70" : undefined}>
          <ul className="mx-4 divide-y divide-black/[0.06] border-y border-dashed border-black/15" aria-label="Items">
            {invoice.lines.map((l, i) => (
              <li key={i} className="flex items-start gap-3 py-2.5 text-[13px]">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug [overflow-wrap:anywhere]">{l.title}</p>
                  {l.detail && <p className="mt-0.5 text-[12px] leading-snug text-ink/55 [overflow-wrap:anywhere]">{l.detail}</p>}
                  <p className="mt-0.5 text-[12px] tabular-nums text-ink/55">Qty {l.quantity}</p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums">{l.total}</p>
              </li>
            ))}
          </ul>

          <dl className="space-y-1 px-4 pb-3 pt-2.5 text-[13px] tabular-nums">
            <div className="flex justify-between gap-3">
              <dt className="text-ink/60">Subtotal</dt>
              <dd>{invoice.subtotal}</dd>
            </div>
            {discount && (
              <div className="flex justify-between gap-3">
                <dt className="min-w-0 text-ink/60">
                  Discount{discountWhy && <span className="text-ink/45"> · {discountWhy}</span>}
                </dt>
                <dd className="shrink-0 text-emerald-700">{discount}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-ink/60">Shipping</dt>
              <dd>{invoice.shipping}</dd>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-black/10 pt-2 text-[15px] font-bold">
              <dt>Total</dt>
              <dd>{invoice.total}</dd>
            </div>
          </dl>

          <p className="flex items-baseline justify-between gap-3 border-t border-dashed border-black/15 px-4 py-2.5 text-[12.5px]">
            <span className="text-ink/55">Payment</span>
            <span className="min-w-0 text-right font-semibold [overflow-wrap:anywhere]">{invoice.paymentMethod}</span>
          </p>
        </div>
      )}

      {children}
    </article>
  );
}

/**
 * The shopper's invoice in their chat: the receipt, a link to the printable page, the question, and either the
 * two answer buttons or where things stand. `onAnswer` resolves to an error sentence, or null when it worked.
 */
export function VisitorInvoice({ invoice, onAnswer }: { invoice: InvoiceDTO; onAnswer: (answer: InvoiceAnswer) => Promise<string | null> }) {
  const [pending, setPending] = useState<InvoiceAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const answer = async (value: InvoiceAnswer) => {
    if (busy.current) return; // a double tap sends once
    busy.current = true;
    setPending(value);
    setError(null);
    try {
      setError(await onAnswer(value));
    } catch {
      setError(NETWORK);
    } finally {
      busy.current = false;
      setPending(null);
    }
  };

  // Only the newest invoice of an unpaid order is still waiting for this answer.
  const askable = invoice.latest && !invoice.answer && invoice.status === "PENDING";

  if (!invoice.latest) {
    return (
      <InvoiceReceipt invoice={invoice}>
        <p className="border-t border-black/10 px-4 py-2.5 text-[12.5px] text-ink/55">This invoice was replaced by a newer one below.</p>
      </InvoiceReceipt>
    );
  }

  return (
    <InvoiceReceipt invoice={invoice}>
      <div className="border-t border-black/10 bg-soft/70 px-4 pb-3.5 pt-3">
        <a
          href={`/invoice/${encodeURIComponent(invoice.token)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand underline-offset-2 hover:underline"
        >
          View / print invoice
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
          </svg>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        <p className="mt-2 text-[13.5px] leading-snug text-ink">{INVOICE_COPY.question}</p>

        {invoice.answer ? (
          <p className={`mt-2.5 text-[13px] font-semibold ${invoice.answer === "confirmed" ? "text-emerald-700" : "text-amber-700"}`}>
            {invoice.answer === "confirmed" ? "You confirmed this invoice ✓" : "You said something's wrong"}
          </p>
        ) : (
          askable && (
            <div className="mt-3 grid grid-cols-2 gap-2" aria-busy={pending !== null}>
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => void answer("confirmed")}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-brand px-2 text-[13px] font-semibold leading-tight text-white transition hover:bg-brand-dark active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
              >
                {pending === "confirmed" && <Spinner />}
                {INVOICE_COPY.yesButton}
              </button>
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => void answer("wrong")}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-black/15 bg-white px-2 text-[13px] font-semibold leading-tight text-ink transition hover:border-ink/40 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
              >
                {pending === "wrong" && <Spinner dark />}
                {INVOICE_COPY.noButton}
              </button>
            </div>
          )
        )}
        {error && (
          <p className="mt-2 text-[12.5px] text-brand" role="alert">
            {error}
          </p>
        )}
      </div>
    </InvoiceReceipt>
  );
}

function Spinner({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 motion-reduce:animate-none ${dark ? "border-ink/20 border-t-ink" : "border-white/40 border-t-white"}`}
      aria-hidden
    />
  );
}

/** Payment details for an order, highlighted, with a Copy button for the whole text. */
export function PaymentCard({ title, body }: { title: string; body: string }) {
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const textRef = useRef<HTMLParagraphElement>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onCopy = async () => {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(body);
      setCopy("done");
      timer.current = window.setTimeout(() => setCopy("idle"), 2500);
    } catch {
      // No clipboard access (old browser, permission): select the text so it can be copied by hand.
      const el = textRef.current;
      const sel = window.getSelection();
      if (el && sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      setCopy("failed");
    }
  };

  return (
    <section aria-label={title} className="w-full overflow-hidden rounded-xl border border-brand/25 bg-[#fdf5f6] text-ink shadow-[0_1px_2px_rgba(167,3,23,0.08)]">
      <header className="flex items-center justify-between gap-3 border-b border-brand/15 px-4 py-2.5">
        <h3 className="flex min-w-0 items-center gap-2 text-[13.5px] font-bold tabular-nums">
          <svg className="h-4 w-4 shrink-0 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 10h18M7 15h4" />
          </svg>
          <span className="min-w-0">{title}</span>
        </h3>
        <button
          type="button"
          onClick={() => void onCopy()}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-brand/25 bg-white px-2.5 text-[12.5px] font-semibold text-brand transition hover:border-brand/50 active:scale-[0.97]"
        >
          {copy === "done" ? (
            <>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a1 1 0 0 1 1-1h10" />
              </svg>
              Copy
            </>
          )}
        </button>
      </header>
      <p ref={textRef} className="whitespace-pre-wrap px-4 py-3 text-[13.5px] leading-relaxed [overflow-wrap:anywhere]">
        {body}
      </p>
      <p className="sr-only" aria-live="polite">
        {copy === "done" ? "Payment details copied." : ""}
      </p>
      {copy === "failed" && (
        <p className="border-t border-brand/15 px-4 py-2 text-[12px] text-brand" role="alert">
          We couldn&apos;t copy it for you. The text is selected: copy it from your keyboard or press and hold.
        </p>
      )}
    </section>
  );
}
