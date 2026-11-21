"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Card, EmptyState, StatusPill, btn, field, label } from "@/components/admin/ui";
import { PaymentLogo } from "@/components/checkout/PaymentLogos";
import { MAX_DISCOUNT_RATE, PAYMENT_KEYS, fillPaymentTemplate } from "@/lib/orders/payment-rails";
import { deletePaymentOption, movePaymentOption, savePaymentOption, setPaymentOptionActive, type PaymentResult } from "./actions";

export interface PaymentRow {
  id: string;
  name: string;
  /** "" = Other (no built-in logo) */
  key: string;
  detail: string;
  discountPercent: number;
  details: string;
  instructions: string;
  active: boolean;
  orders: number;
}

type FieldErrors = NonNullable<Extract<PaymentResult, { ok: false }>["fieldErrors"]>;

const NETWORK_ERROR = "We couldn't reach the server. Check your connection and try again.";
const MAX_PERCENT = Math.round(MAX_DISCOUNT_RATE * 100);
/** What the preview fills the message with. */
const EXAMPLE = { order: "#1001", total: "$129.97" };
const code = "rounded bg-zinc-100 px-1 font-mono text-[12px] text-ink";

export function PaymentMethodsClient({ rows }: { rows: PaymentRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<PaymentRow | "new" | null>(rows.length === 0 ? "new" : null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<PaymentResult>, done: string) =>
    start(async () => {
      setMessage(null);
      try {
        const res = await fn();
        if (!res.ok) return setMessage({ ok: false, text: res.error });
        // One transition, so the message and the refreshed list appear together.
        start(() => {
          setMessage({ ok: true, text: done });
          setConfirmDelete(null);
          router.refresh();
        });
      } catch {
        setMessage({ ok: false, text: NETWORK_ERROR });
      }
    });

  return (
    <div className="space-y-4">
      {editing === null && (
        <div className="flex justify-end">
          <button
            type="button"
            className={btn.primary}
            onClick={() => {
              setEditing("new");
              setMessage(null);
            }}
          >
            + Add payment method
          </button>
        </div>
      )}

      {editing !== null && (
        <OptionForm
          key={editing === "new" ? "new" : editing.id}
          option={editing === "new" ? null : editing}
          onDone={(text) => {
            setEditing(null);
            setMessage({ ok: true, text });
            router.refresh();
          }}
          onCancel={rows.length === 0 ? undefined : () => setEditing(null)}
        />
      )}

      {message && (
        <p className={`rounded-lg px-3 py-2 text-sm font-medium ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-brand"}`} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No payment methods yet">Add one above, or customers can&apos;t place an order.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((o, i) => (
            <li key={o.id}>
              <Card className={o.active ? "" : "opacity-75"}>
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
                  <div className="flex shrink-0 gap-1 sm:flex-col">
                    <button
                      type="button"
                      disabled={pending || i === 0}
                      onClick={() => run(() => movePaymentOption({ id: o.id, direction: "up" }), `${o.name} moved up.`)}
                      className={`${btn.ghost} disabled:opacity-30`}
                      aria-label={`Move ${o.name} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={pending || i === rows.length - 1}
                      onClick={() => run(() => movePaymentOption({ id: o.id, direction: "down" }), `${o.name} moved down.`)}
                      className={`${btn.ghost} disabled:opacity-30`}
                      aria-label={`Move ${o.name} down`}
                    >
                      ↓
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold tabular-nums text-zinc-400">{i + 1}.</span>
                      <PaymentLogo paymentKey={o.key || null} name={o.name} />
                      <h2 className="text-base font-semibold text-ink">{o.name}</h2>
                      {o.discountPercent > 0 && <span className="rounded-md bg-brand px-1.5 py-0.5 text-[11px] font-bold uppercase text-white">{o.discountPercent}% off</span>}
                      <StatusPill status={o.active ? "ACTIVE" : "HIDDEN"}>{o.active ? "Shown at checkout" : "Off"}</StatusPill>
                    </div>
                    {o.detail && <p className="mt-1 text-sm text-zinc-600">{o.detail}</p>}
                    <p className="mt-1 break-words text-xs text-zinc-500">
                      {o.details ? (
                        <>
                          Payment details: <span className="font-mono text-ink">{o.details}</span>
                        </>
                      ) : (
                        <span className="font-medium text-amber-700">No payment details yet: add them before shoppers pick this.</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {o.orders} {o.orders === 1 ? "order" : "orders"} placed with it
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      className={btn.secondary}
                      onClick={() => {
                        setEditing(o);
                        setMessage(null);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      className={btn.secondary}
                      onClick={() =>
                        run(() => setPaymentOptionActive({ id: o.id, active: !o.active }), o.active ? `${o.name} is hidden from checkout.` : `${o.name} is shown at checkout.`)
                      }
                    >
                      {o.active ? "Turn off" : "Turn on"}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      className={btn.danger}
                      onClick={() => setConfirmDelete(confirmDelete === o.id ? null : o.id)}
                      aria-expanded={confirmDelete === o.id}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {confirmDelete === o.id && (
                  <div className="flex flex-col gap-3 border-t border-red-100 bg-red-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <p className="text-sm text-ink">
                      Delete <b>{o.name}</b> for good? {o.orders > 0 ? "Its past orders keep their payment details. " : ""}
                      {o.active ? "Turning it off hides it without deleting." : ""}
                    </p>
                    <span className="flex shrink-0 gap-2">
                      <button type="button" disabled={pending} className={btn.danger} onClick={() => run(() => deletePaymentOption({ id: o.id }), `${o.name} deleted.`)}>
                        {pending ? "Deleting…" : "Yes, delete"}
                      </button>
                      <button type="button" className={btn.ghost} onClick={() => setConfirmDelete(null)}>
                        Keep
                      </button>
                    </span>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OptionForm({ option, onDone, onCancel }: { option: PaymentRow | null; onDone: (text: string) => void; onCancel?: () => void }) {
  const [name, setName] = useState(option?.name ?? "");
  const [key, setKey] = useState(option?.key ?? "");
  const [detail, setDetail] = useState(option?.detail ?? "");
  const [discount, setDiscount] = useState(String(option?.discountPercent ?? 0));
  const [details, setDetails] = useState(option?.details ?? "");
  const [instructions, setInstructions] = useState(
    option?.instructions ?? "Please send {total} to {details} and write {order} in the note. Send us a screenshot here once it's done.",
  );
  const [active, setActive] = useState(option?.active ?? true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const percent = Number(discount);
  const percentOk = discount.trim() !== "" && Number.isInteger(percent) && percent >= 0 && percent <= MAX_PERCENT;
  const preview = fillPaymentTemplate(instructions, { ...EXAMPLE, details: details.trim() || "(your payment details)" });
  const missingDetails = details.trim() !== "" && !instructions.includes("{details}");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const local: FieldErrors = {};
    if (!name.trim()) local.name = "Give the method a name, like “Cash App”.";
    if (!percentOk) local.discountPercent = `Enter a whole number from 0 to ${MAX_PERCENT}.`;
    if (!instructions.trim()) local.instructions = "Write the message the shopper gets in the chat.";
    setErrors(local);
    if (Object.keys(local).length) return;
    start(async () => {
      setError(null);
      try {
        const res = await savePaymentOption({ id: option?.id, name, key, detail, discountPercent: percent, details, instructions, active });
        if (!res.ok) {
          setErrors(res.fieldErrors ?? {});
          setError(res.error);
          return;
        }
        onDone(option ? `${name.trim()} saved.` : `${name.trim()} added.`);
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  };

  const errorText = (f: keyof FieldErrors) =>
    errors[f] && (
      <p id={`pm-${f}-error`} className="mt-1 text-sm font-medium text-brand">
        {errors[f]}
      </p>
    );
  const aria = (f: keyof FieldErrors, hint?: string) => ({
    "aria-invalid": Boolean(errors[f]),
    "aria-describedby": [errors[f] ? `pm-${f}-error` : null, hint].filter(Boolean).join(" ") || undefined,
  });

  return (
    <Card title={option ? `Edit ${option.name}` : "New payment method"}>
      <form onSubmit={submit} noValidate className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pm-name" className={label}>
              Name shown at checkout
            </label>
            <input id="pm-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Cash App" className={`${field} h-10`} {...aria("name")} />
            {errorText("name")}
          </div>
          <div>
            <label htmlFor="pm-key" className={label}>
              Logo
            </label>
            <div className="flex items-center gap-3">
              <select id="pm-key" value={key} onChange={(e) => setKey(e.target.value)} className={`${field} h-10`} {...aria("key")}>
                {PAYMENT_KEYS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
                <option value="">Other (plain badge)</option>
              </select>
              <PaymentLogo paymentKey={key || null} name={name || "?"} />
            </div>
            {errorText("key")}
          </div>
        </div>

        <div>
          <label htmlFor="pm-detail" className={label}>
            Short line under the name <span className="font-normal normal-case tracking-normal text-zinc-400">(optional)</span>
          </label>
          <input
            id="pm-detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            maxLength={140}
            placeholder="Pay to our $Cashtag from the Cash App."
            className={`${field} h-10`}
            {...aria("detail")}
          />
          {errorText("detail")}
        </div>

        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <div>
            <label htmlFor="pm-discount" className={label}>
              Discount %
            </label>
            <input
              id="pm-discount"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_PERCENT}
              step={1}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className={`${field} h-10`}
              {...aria("discountPercent", "pm-discount-hint")}
            />
            {errorText("discountPercent")}
          </div>
          <p id="pm-discount-hint" className="text-xs text-zinc-500 sm:pt-7">
            Off the items when a shopper pays this way: 0 for none, at most {MAX_PERCENT}. Checkout shows it as a “% off” badge and the server applies it.
          </p>
        </div>

        <div>
          <label htmlFor="pm-details" className={label}>
            Payment details <span className="font-normal normal-case tracking-normal text-zinc-400">(account handle or address)</span>
          </label>
          <textarea
            id="pm-details"
            rows={2}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={2000}
            placeholder={"$YourCashtag"}
            className={`${field} font-mono`}
            {...aria("details", "pm-details-hint")}
          />
          <p id="pm-details-hint" className="mt-1 text-xs text-zinc-500">
            Never shown at checkout. It goes into the chat message where you write <code className={code}>{"{details}"}</code>.
          </p>
          {errorText("details")}
        </div>

        <div>
          <label htmlFor="pm-instructions" className={label}>
            Chat message with the payment details
          </label>
          <textarea
            id="pm-instructions"
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={2000}
            className={field}
            {...aria("instructions", "pm-instructions-hint")}
          />
          <p id="pm-instructions-hint" className="mt-1 text-xs text-zinc-500">
            Sent from the order page once the shopper confirms their invoice. Write <code className={code}>{"{order}"}</code> for the order number,{" "}
            <code className={code}>{"{total}"}</code> for the amount and <code className={code}>{"{details}"}</code> for the payment details: each order fills in its own.
          </p>
          {missingDetails && (
            <p className="mt-1 text-xs font-medium text-amber-700">The message has no {"{details}"}, so the shopper won&apos;t see the payment details above.</p>
          )}
          {errorText("instructions")}
        </div>

        {instructions.trim() && (
          <div className="rounded-lg bg-zinc-50 p-3" data-testid="pm-preview">
            <p className={label}>
              The shopper of order {EXAMPLE.order} ({EXAMPLE.total}) would get
            </p>
            <p className="whitespace-pre-line break-words text-sm text-zinc-700">{preview}</p>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-brand" />
          Show it at checkout
        </label>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-brand" role="alert">
            {error}
          </p>
        )}
        {option && <p className="text-xs text-zinc-500">Orders already placed keep the message they were placed with.</p>}

        <div className="flex gap-2">
          <button type="submit" disabled={pending} className={btn.primary}>
            {pending ? "Saving…" : option ? "Save changes" : "Add method"}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className={btn.ghost}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </Card>
  );
}
