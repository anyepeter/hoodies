"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Card, EmptyState, StatusPill, btn, field, label } from "@/components/admin/ui";
import { deletePaymentOption, movePaymentOption, savePaymentOption, setPaymentOptionActive, type PaymentResult } from "./actions";

export interface PaymentRow {
  id: string;
  name: string;
  instructions: string;
  details: string;
  active: boolean;
  orders: number;
}

type FieldErrors = NonNullable<Extract<PaymentResult, { ok: false }>["fieldErrors"]>;

const NETWORK_ERROR = "We couldn't reach the server. Check your connection and try again.";
const EXAMPLE = { order: "#1001", total: "$129.97" };
const fill = (s: string) => s.replaceAll("{order}", EXAMPLE.order).replaceAll("{total}", EXAMPLE.total);

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
                      <h2 className="text-base font-semibold text-ink">{o.name}</h2>
                      <StatusPill status={o.active ? "ACTIVE" : "HIDDEN"}>{o.active ? "Shown at checkout" : "Off"}</StatusPill>
                    </div>
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-zinc-600">{o.instructions}</p>
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
  const [instructions, setInstructions] = useState(option?.instructions ?? "Send {total} by bank transfer and write {order} as the reference. We ship as soon as it arrives.");
  const [details, setDetails] = useState(option?.details ?? "");
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const local: FieldErrors = {};
    if (!name.trim()) local.name = "Give the method a name, like “Bank transfer”.";
    if (!instructions.trim()) local.instructions = "Tell the customer what to do to pay.";
    setErrors(local);
    if (Object.keys(local).length) return;
    start(async () => {
      setError(null);
      try {
        const res = await savePaymentOption({ id: option?.id, name, instructions, details, active });
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

  return (
    <Card title={option ? `Edit ${option.name}` : "New payment method"}>
      <form onSubmit={submit} noValidate className="space-y-4 p-5">
        <div>
          <label htmlFor="pm-name" className={label}>
            Name shown at checkout
          </label>
          <input
            id="pm-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Bank transfer"
            className={`${field} h-10 max-w-sm`}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "pm-name-error" : undefined}
          />
          {errors.name && (
            <p id="pm-name-error" className="mt-1 text-sm font-medium text-brand">
              {errors.name}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="pm-instructions" className={label}>
            Instructions
          </label>
          <textarea
            id="pm-instructions"
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={2000}
            className={field}
            aria-invalid={Boolean(errors.instructions)}
            aria-describedby="pm-instructions-hint"
          />
          <p id="pm-instructions-hint" className="mt-1 text-xs text-zinc-500">
            Write <code className="rounded bg-zinc-100 px-1">{"{order}"}</code> for the order number and <code className="rounded bg-zinc-100 px-1">{"{total}"}</code> for the
            amount: each order fills in its own.
          </p>
          {errors.instructions && <p className="mt-1 text-sm font-medium text-brand">{errors.instructions}</p>}
        </div>

        <div>
          <label htmlFor="pm-details" className={label}>
            Account details <span className="font-normal normal-case tracking-normal text-zinc-400">(optional)</span>
          </label>
          <textarea
            id="pm-details"
            rows={3}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={2000}
            placeholder={"Account name: …\nIBAN: …"}
            className={field}
            aria-invalid={Boolean(errors.details)}
          />
          <p className="mt-1 text-xs text-zinc-500">Shown under the instructions on the order page and invoice, not at checkout.</p>
          {errors.details && <p className="mt-1 text-sm font-medium text-brand">{errors.details}</p>}
        </div>

        {(instructions.trim() || details.trim()) && (
          <div className="rounded-lg bg-zinc-50 p-3">
            <p className={label}>The customer of order {EXAMPLE.order} would read</p>
            <p className="whitespace-pre-line text-sm text-zinc-700">
              {fill(instructions.trim())}
              {details.trim() && `\n\n${fill(details.trim())}`}
            </p>
          </div>
        )}

        {!option && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-brand" />
            Show it at checkout right away
          </label>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-brand" role="alert">
            {error}
          </p>
        )}
        {option && <p className="text-xs text-zinc-500">Orders already placed keep the instructions they were given.</p>}

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
