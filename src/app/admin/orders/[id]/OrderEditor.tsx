"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Card, btn, field, label as labelClass } from "@/components/admin/ui";
import { customerSchema } from "@/lib/orders/checkout-schema";
import { COUNTRIES, isCountryCode, needsPostcode } from "@/lib/orders/countries";
import { NEEDS_ATTENTION, orderLimitProblem, type OrderEditInput } from "@/lib/orders/edit-schema";
import { discountCents, ratePercent } from "@/lib/orders/payment-rails";
import { MAX_HOODIES_PER_ORDER, MAX_QTY, bundleKey, describeUnits, hoodieCount, moneyCents, parseLineKey, parsePicks, priceCart } from "@/lib/orders/pricing";
import { ADD_ONS, BUNDLES, SIZES, STYLES, money, type AddOnId, type BundleId, type Size, type Style } from "@/lib/store";
import { updateOrder } from "./actions";

const NETWORK_ERROR = "We couldn't reach the server. Check your connection and try again.";
/** The admin field style without its full width, for the small controls that set their own. */
const compact = field.replace("w-full ", "");

export type EditorCustomer = {
  name: string;
  email: string;
  phone: string;
  country: string; // two-letter code
  address1: string;
  address2: string;
  city: string;
  region: string;
  postalCode: string;
  notes: string;
  paymentOptionId: string;
};
type CustomerField = keyof EditorCustomer;

export type EditorOption = { id: string; name: string; discountRate: number; off: boolean };

type Pick = { style: Style; size: Size };
type Line =
  | { uid: string; kind: "bundle"; bundle: BundleId; picks: Pick[]; qty: string }
  | { uid: string; kind: "addon"; addOn: AddOnId; qty: string }
  | { uid: string; kind: "unknown"; key: string; title: string; qty: string };

let seq = 0;
const uid = () => `line-${++seq}`;

function toLine(l: { key: string; qty: number; title: string }): Line {
  const qty = String(l.qty);
  const pack = parsePicks(l.key);
  if (pack) return { uid: uid(), kind: "bundle", bundle: pack.bundle, picks: pack.picks, qty };
  const parsed = parseLineKey(l.key);
  if (parsed?.kind === "addon") return { uid: uid(), kind: "addon", addOn: parsed.sku as AddOnId, qty };
  return { uid: uid(), kind: "unknown", key: l.key, title: l.title, qty };
}

const keyOf = (l: Line) => (l.kind === "bundle" ? bundleKey(l.bundle, l.picks) : l.kind === "addon" ? `addon:${l.addOn}` : l.key);
const qtyOf = (l: Line) => Number(l.qty);
const validQty = (l: Line) => Number.isInteger(qtyOf(l)) && qtyOf(l) >= 1;

const CUSTOMER_FIELDS: CustomerField[] = ["name", "email", "phone", "country", "address1", "address2", "city", "region", "postalCode", "notes", "paymentOptionId"];

function validate(customer: EditorCustomer, lines: Line[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const result = customerSchema.safeParse(customer);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const f = issue.path[0];
      if (typeof f === "string") errors[f] ??= issue.message;
    }
  }
  lines.forEach((l, i) => {
    if (l.kind === "unknown") errors[`lines.${i}`] = "This item isn't sold any more. Remove it to save.";
    else if (!validQty(l)) errors[`lines.${i}`] = "Enter a quantity of at least 1.";
    else if (qtyOf(l) > MAX_QTY) errors[`lines.${i}`] = `At most ${MAX_QTY} of one item per order.`;
  });
  if (lines.length === 0) errors.lines = "An order needs at least one item. Add one, or cancel the order instead.";
  return errors;
}

/**
 * The Items card of a PENDING order, with "Edit order": change the hoodies in each pack (style and size), quantities,
 * add or remove packs and add-ons, the customer's details and the payment method. The totals and stock moves shown
 * while editing are a preview; the server works everything out again when it saves. Read-only (and says why) for
 * any other status. `children` is the read-only list the server rendered.
 */
export function OrderEditor(props: {
  orderId: string;
  title: string;
  editable: boolean;
  reason: string | null;
  /** The shopper said "Something's wrong": the Edit button is the main action. */
  emphasize: boolean;
  customer: EditorCustomer;
  lines: { key: string; qty: number; title: string }[];
  options: EditorOption[];
  /** Pieces left on the shelf per style when the page loaded. */
  stock: Record<Style, number>;
  /** What this order holds now. */
  taken: Record<Style, number>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState(props.customer);
  const [lines, setLines] = useState<Line[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [pending, start] = useTransition();

  const priced = useMemo(
    () => priceCart(lines.filter((l) => l.kind !== "unknown" && validQty(l)).map((l) => ({ key: keyOf(l), qty: qtyOf(l) }))),
    [lines],
  );

  // Opening always starts from what the order is now (the page may have refreshed since).
  const begin = () => {
    setCustomer(props.customer);
    setLines(props.lines.map(toLine));
    setErrors({});
    setFormError(null);
    setSubmitted(false);
    setNote(null);
    setAdding("");
    setOpen(true);
  };

  if (!open) {
    return (
      <Card
        title={props.title}
        actions={
          props.editable ? (
            <button type="button" onClick={begin} className={props.emphasize ? btn.primary : btn.secondary}>
              Edit order
            </button>
          ) : undefined
        }
      >
        {note && (
          <p className="border-b border-zinc-100 bg-zinc-50 px-5 py-2.5 text-sm text-zinc-700" role="status">
            {note}
          </p>
        )}
        {props.children}
        {props.reason && (
          <p className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500" data-testid="edit-locked">
            {props.reason}
          </p>
        )}
      </Card>
    );
  }

  const recheck = (c: EditorCustomer, ls: Line[]) => {
    if (submitted) setErrors(validate(c, ls));
  };
  const setField = (f: CustomerField, value: string) => {
    const next = { ...customer, [f]: value };
    setCustomer(next);
    if (submitted) recheck(next, lines);
    else if (errors[f]) setErrors((e) => ({ ...e, [f]: "" }));
  };
  const changeLines = (fn: (ls: Line[]) => Line[]) => {
    const next = fn(lines);
    setLines(next);
    // Line errors are positional: work them out again rather than keep stale ones.
    if (submitted) recheck(customer, next);
    else setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith("lines"))));
  };
  const setLine = (id: string, change: (l: Line) => Line) => changeLines((ls) => ls.map((l) => (l.uid === id ? change(l) : l)));
  const setPick = (id: string, index: number, change: Partial<Pick>) =>
    setLine(id, (l) => (l.kind === "bundle" ? { ...l, picks: l.picks.map((p, j) => (j === index ? { ...p, ...change } : p)) } : l));

  const addItem = () => {
    if (!adding) return;
    const [kind, sku] = adding.split(":") as ["bundle" | "addon", string];
    if (kind === "addon") {
      const addOn = sku as AddOnId;
      const existing = lines.find((l) => l.kind === "addon" && l.addOn === addOn);
      if (existing) setLine(existing.uid, (l) => ({ ...l, qty: String(validQty(l) ? qtyOf(l) + 1 : 1) }));
      else changeLines((ls) => [...ls, { uid: uid(), kind: "addon", addOn, qty: "1" }]);
    } else {
      const bundle = BUNDLES.find((b) => b.id === sku);
      if (bundle) {
        const picks = Array.from({ length: bundle.qty }, (): Pick => ({ style: STYLES[0]!, size: "M" }));
        changeLines((ls) => [...ls, { uid: uid(), kind: "bundle", bundle: bundle.id, picks, qty: "1" }]);
      }
    }
    setAdding("");
  };

  const option = props.options.find((o) => o.id === customer.paymentOptionId);
  const discount = option ? discountCents(priced.subtotalCents, option.discountRate) : 0;
  const totalCents = priced.subtotalCents - discount + priced.shippingCents;
  const hoodies = hoodieCount(priced.units);
  const limit = lines.length > 0 && !lines.some((l) => l.kind === "unknown") ? orderLimitProblem(priced) : null;
  const take: Partial<Record<Style, number>> = {};
  const back: Partial<Record<Style, number>> = {};
  for (const s of STYLES) {
    const d = priced.units[s] - props.taken[s];
    if (d > 0) take[s] = d;
    if (d < 0) back[s] = -d;
  }
  const short = STYLES.filter((s) => (take[s] ?? 0) > props.stock[s]);
  const moves = [describeUnits(take) && `takes ${describeUnits(take)} from stock`, describeUnits(back) && `puts ${describeUnits(back)} back`].filter(Boolean).join(", ");
  const postcodeOptional = isCountryCode(customer.country) && !needsPostcode(customer.country);
  const locked = !props.editable; // the order moved on while this was open (another tab, or the realtime refresh)

  const aria = (key: string, id: string) => ({ "aria-invalid": Boolean(errors[key]), "aria-describedby": errors[key] ? `${id}-error` : undefined });
  const input = `${field} h-10 aria-[invalid=true]:border-brand`;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || locked) return;
    setSubmitted(true);
    setFormError(null);
    const found = validate(customer, lines);
    setErrors(found);
    const firstCustomer = CUSTOMER_FIELDS.find((f) => found[f]);
    const firstLine = lines.findIndex((_, i) => found[`lines.${i}`]);
    if (firstCustomer || firstLine >= 0 || found.lines) {
      setFormError(NEEDS_ATTENTION);
      document.getElementById(firstLine >= 0 ? `edit-qty-${firstLine}` : firstCustomer ? `edit-${firstCustomer}` : "edit-add")?.focus();
      return;
    }
    const body: OrderEditInput = { id: props.orderId, customer, lines: lines.map((l) => ({ key: keyOf(l), qty: qtyOf(l) })) };
    start(async () => {
      try {
        const res = await updateOrder(body);
        if (!res.ok) {
          setErrors(res.fieldErrors ?? {});
          setFormError(res.error);
          // Not a field problem (signed out, the order moved on…): show the order as it is now.
          if (!res.fieldErrors) router.refresh();
          return;
        }
        setOpen(false);
        if (!res.changed) {
          setNote("Nothing changed, so there was nothing to save.");
          return;
        }
        router.refresh();
        // The next step is the updated invoice, in the Chat & payment card.
        requestAnimationFrame(() => document.getElementById("payment")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      } catch {
        setFormError(NETWORK_ERROR);
      }
    });
  };

  return (
    <Card title="Edit order">
      <form onSubmit={save} noValidate className="divide-y divide-zinc-100" data-testid="order-editor">
        {locked && props.reason && (
          <p className="bg-red-50 px-5 py-3 text-sm font-medium text-brand" role="alert">
            {props.reason}
          </p>
        )}

        <section className="p-5" aria-labelledby="edit-items-title">
          <h3 id="edit-items-title" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Items
          </h3>
          {lines.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-center text-sm text-zinc-500">No items. Add a pack or an add-on below.</p>
          ) : (
            <ul className="mt-1 divide-y divide-zinc-100">
              {lines.map((l, i) => (
                <LineRow
                  key={l.uid}
                  line={l}
                  index={i}
                  error={errors[`lines.${i}`]}
                  onPick={(j, change) => setPick(l.uid, j, change)}
                  onQty={(qty) => setLine(l.uid, (x) => ({ ...x, qty }))}
                  onRemove={() => changeLines((ls) => ls.filter((x) => x.uid !== l.uid))}
                />
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-4">
            <div className="min-w-0 flex-1 basis-56">
              <label htmlFor="edit-add" className={labelClass}>
                Add an item
              </label>
              <select id="edit-add" value={adding} onChange={(e) => setAdding(e.target.value)} className={input}>
                <option value="">Choose a pack or an add-on…</option>
                <optgroup label="Packs">
                  {BUNDLES.map((b) => (
                    <option key={b.id} value={`bundle:${b.id}`}>
                      {b.title} · {b.qty} {b.qty === 1 ? "hoodie" : "hoodies"} · {money(b.price)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Add-ons">
                  {ADD_ONS.map((a) => (
                    <option key={a.id} value={`addon:${a.id}`}>
                      {a.title} · {money(a.price)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <button type="button" onClick={addItem} disabled={!adding} className={btn.secondary}>
              Add item
            </button>
          </div>
          {errors.lines && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-brand" role="alert" data-testid="edit-lines-error">
              {errors.lines}
            </p>
          )}
        </section>

        <section className="p-5" aria-labelledby="edit-customer-title">
          <h3 id="edit-customer-title" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Customer and delivery
          </h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field id="name" label="Full name" error={errors.name}>
              <input id="edit-name" value={customer.name} onChange={(e) => setField("name", e.target.value)} maxLength={100} autoComplete="off" className={input} {...aria("name", "edit-name")} />
            </Field>
            <Field id="email" label="Email" error={errors.email}>
              <input
                id="edit-email"
                type="email"
                inputMode="email"
                value={customer.email}
                onChange={(e) => setField("email", e.target.value)}
                maxLength={254}
                autoComplete="off"
                className={input}
                {...aria("email", "edit-email")}
              />
            </Field>
            <Field id="phone" label="Phone" optional error={errors.phone}>
              <input id="edit-phone" type="tel" value={customer.phone} onChange={(e) => setField("phone", e.target.value)} maxLength={30} autoComplete="off" className={input} {...aria("phone", "edit-phone")} />
            </Field>
            <Field id="country" label="Country" error={errors.country}>
              <select id="edit-country" value={customer.country} onChange={(e) => setField("country", e.target.value)} className={input} {...aria("country", "edit-country")}>
                <option value="">Choose the country</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="address1" label="Address" error={errors.address1} className="sm:col-span-2">
              <input id="edit-address1" value={customer.address1} onChange={(e) => setField("address1", e.target.value)} maxLength={200} autoComplete="off" className={input} {...aria("address1", "edit-address1")} />
            </Field>
            <Field id="address2" label="Apartment, suite, etc." optional error={errors.address2} className="sm:col-span-2">
              <input id="edit-address2" value={customer.address2} onChange={(e) => setField("address2", e.target.value)} maxLength={200} autoComplete="off" className={input} {...aria("address2", "edit-address2")} />
            </Field>
            <Field id="city" label="City" error={errors.city}>
              <input id="edit-city" value={customer.city} onChange={(e) => setField("city", e.target.value)} maxLength={100} autoComplete="off" className={input} {...aria("city", "edit-city")} />
            </Field>
            <Field id="region" label="State / region" optional error={errors.region}>
              <input id="edit-region" value={customer.region} onChange={(e) => setField("region", e.target.value)} maxLength={100} autoComplete="off" className={input} {...aria("region", "edit-region")} />
            </Field>
            <Field id="postalCode" label="Postal code" optional={postcodeOptional} error={errors.postalCode}>
              <input
                id="edit-postalCode"
                value={customer.postalCode}
                onChange={(e) => setField("postalCode", e.target.value)}
                maxLength={20}
                autoComplete="off"
                className={input}
                {...aria("postalCode", "edit-postalCode")}
              />
            </Field>
            <Field id="notes" label="Customer's note" optional error={errors.notes} className="sm:col-span-2">
              <textarea
                id="edit-notes"
                rows={2}
                value={customer.notes}
                onChange={(e) => setField("notes", e.target.value)}
                maxLength={1000}
                className={`${field} resize-y aria-[invalid=true]:border-brand`}
                {...aria("notes", "edit-notes")}
              />
            </Field>
          </div>
        </section>

        <section className="p-5" aria-labelledby="edit-payment-title">
          <h3 id="edit-payment-title" className="sr-only">
            Payment
          </h3>
          <Field id="paymentOptionId" label="Payment method" error={errors.paymentOptionId} className="sm:max-w-sm">
            <select
              id="edit-paymentOptionId"
              value={customer.paymentOptionId}
              onChange={(e) => setField("paymentOptionId", e.target.value)}
              className={input}
              {...aria("paymentOptionId", "edit-paymentOptionId")}
            >
              {!option && <option value="">Choose how they&apos;ll pay</option>}
              {props.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.discountRate > 0 ? ` · ${ratePercent(o.discountRate)} off` : ""}
                  {o.off ? " · turned off" : ""}
                </option>
              ))}
            </select>
          </Field>
        </section>

        <section className="space-y-3 bg-zinc-50/60 p-5" aria-labelledby="edit-summary-title" aria-live="polite">
          <h3 id="edit-summary-title" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            New total
          </h3>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between text-zinc-600">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{moneyCents(priced.subtotalCents)}</dd>
            </div>
            {discount > 0 && option && (
              <div className="flex justify-between text-zinc-600">
                <dt>
                  {option.name} discount ({ratePercent(option.discountRate)})
                </dt>
                <dd className="tabular-nums">−{moneyCents(discount)}</dd>
              </div>
            )}
            <div className="flex justify-between text-zinc-600">
              <dt>Shipping</dt>
              <dd>{priced.shippingCents > 0 ? moneyCents(priced.shippingCents) : "Free"}</dd>
            </div>
            <div className="flex justify-between pt-1 text-base font-bold text-ink">
              <dt>Total</dt>
              <dd className="tabular-nums" data-testid="edit-total">
                {moneyCents(totalCents)}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-zinc-600" data-testid="edit-stock">
            {hoodies} of at most {MAX_HOODIES_PER_ORDER} hoodies · {moves ? `Saving ${moves}.` : "Stock stays as it is."}
          </p>
          {limit && (
            <p className="text-sm font-medium text-brand" data-testid="edit-limit">
              {limit}
            </p>
          )}
          {short.map((s) => (
            <p key={s} className="text-sm font-medium text-amber-800">
              {props.stock[s] === 0 ? `No ${s} left in stock` : `Only ${props.stock[s]} ${s} left in stock`} (when this page loaded): this change needs {take[s]} more.
            </p>
          ))}
          <p className="text-xs text-zinc-500">The server works out the prices, the discount and the stock again when you save.</p>
        </section>

        <div className="space-y-3 p-5">
          {formError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-brand" role="alert" data-testid="edit-error">
              {formError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending || locked} className={btn.primary}>
              {pending ? "Saving…" : "Save changes"}
            </button>
            <button type="button" disabled={pending} onClick={() => setOpen(false)} className={btn.secondary}>
              Discard changes
            </button>
          </div>
          <p className="text-xs text-zinc-500">Saving doesn&apos;t tell the shopper. Send them the updated invoice afterwards, from Chat &amp; payment.</p>
        </div>
      </form>
    </Card>
  );
}

function Field({ id, label, optional, error, className = "", children }: { id: string; label: string; optional?: boolean; error?: string; className?: string; children: ReactNode }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={`edit-${id}`} className={labelClass}>
        {label}
        {optional && <span className="font-normal normal-case tracking-normal text-zinc-400"> (optional)</span>}
      </label>
      {children}
      {error && (
        <p id={`edit-${id}-error`} className="mt-1 text-xs font-medium text-brand">
          {error}
        </p>
      )}
    </div>
  );
}

function LineRow({
  line,
  index,
  error,
  onPick,
  onQty,
  onRemove,
}: {
  line: Line;
  index: number;
  error?: string;
  onPick: (hoodie: number, change: Partial<Pick>) => void;
  onQty: (qty: string) => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  const bundle = line.kind === "bundle" ? BUNDLES.find((b) => b.id === line.bundle) : undefined;
  const addOn = line.kind === "addon" ? ADD_ONS.find((a) => a.id === line.addOn) : undefined;
  const title = bundle?.title ?? addOn?.title ?? (line.kind === "unknown" ? line.title : "Item");
  const unit = bundle?.price ?? addOn?.price ?? null;
  const qty = Number(line.qty);
  const lineTotal = unit !== null && Number.isInteger(qty) && qty >= 1 ? moneyCents(Math.round(unit * 100) * qty) : "—";
  const select = `${compact} h-9 py-1`;

  return (
    <li className="py-4" data-line={index}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="text-xs text-zinc-500">
            {unit !== null ? `${money(unit)} each` : "Not sold any more"}
            {bundle && ` · ${bundle.qty} ${bundle.qty === 1 ? "hoodie" : "hoodies"}`}
          </p>
        </div>
        <button type="button" onClick={onRemove} className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-zinc-500 transition hover:bg-red-50 hover:text-brand" aria-label={`Remove line ${n}: ${title}`}>
          Remove
        </button>
      </div>

      {line.kind === "bundle" && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {line.picks.map((p, j) => (
            <div key={j} role="group" aria-label={`Line ${n}, hoodie ${j + 1}`} className="flex min-w-0 items-center gap-2 rounded-lg bg-zinc-50 px-2.5 py-2">
              <span className="w-16 shrink-0 text-xs font-semibold text-zinc-500">Hoodie {j + 1}</span>
              <select aria-label={`Line ${n}, hoodie ${j + 1} style`} value={p.style} onChange={(e) => onPick(j, { style: e.target.value as Style })} className={`${select} min-w-0 flex-1`}>
                {STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select aria-label={`Line ${n}, hoodie ${j + 1} size`} value={p.size} onChange={(e) => onPick(j, { size: e.target.value as Size })} className={`${select} w-[4.75rem] shrink-0`}>
                {SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor={`edit-qty-${index}`} className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Quantity
          </label>
          <input
            id={`edit-qty-${index}`}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_QTY}
            value={line.qty}
            onChange={(e) => onQty(e.target.value)}
            className={`${compact} h-9 w-20 tabular-nums aria-[invalid=true]:border-brand`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `edit-line-${index}-error` : undefined}
          />
        </div>
        <p className="text-sm font-semibold tabular-nums text-ink">{lineTotal}</p>
      </div>
      {error && (
        <p id={`edit-line-${index}-error`} className="mt-1.5 text-xs font-medium text-brand">
          {error}
        </p>
      )}
    </li>
  );
}
