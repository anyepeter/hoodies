"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useCart, type CartLine } from "@/components/cart/CartProvider";
import { customerSchema } from "@/lib/orders/checkout-schema";
import { COUNTRIES, isCountryCode, needsPostcode } from "@/lib/orders/countries";
import { MAX_LINES, MAX_QTY, moneyCents, priceCart, type PricedCart } from "@/lib/orders/pricing";
import { HOODIE } from "@/lib/store";

type PaymentOption = { id: string; name: string; instructions: string };

const FIELDS = ["name", "email", "phone", "country", "address1", "address2", "city", "region", "postalCode", "notes", "paymentOptionId"] as const;
type Field = (typeof FIELDS)[number];
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;

const NETWORK_ERROR = "We couldn't reach the server. Check your connection and try again.";
const input =
  "h-12 w-full rounded-xl border bg-white px-4 text-[15px] text-ink transition placeholder:text-ink/35 focus:outline-none focus:ring-2 disabled:bg-soft aria-[invalid=true]:border-brand aria-[invalid=true]:focus:ring-brand/20 border-black/15 focus:border-ink focus:ring-ink/10";

/** The browser's region ("en-US" → "US") as a first guess for the country. */
function guessCountry(): string {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    return region && isCountryCode(region) ? region : "";
  } catch {
    return "";
  }
}

function validate(values: Values): Errors {
  const result = customerSchema.safeParse(values);
  if (result.success) return {};
  const errors: Errors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as Field | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

/** Problems with the cart itself, which the form can't fix. */
function cartProblem(cart: PricedCart): string | null {
  if (cart.lines.length === 0) return "Your cart is empty.";
  if (cart.lines.length > MAX_LINES) return `That's too many different items for one order (at most ${MAX_LINES}).`;
  const tooMany = cart.lines.find((l) => l.quantity > MAX_QTY);
  if (tooMany) return `At most ${MAX_QTY} of one item per order. Lower the quantity of ${tooMany.shortTitle}.`;
  return null;
}

export function CheckoutForm({ paymentOptions }: { paymentOptions: PaymentOption[] }) {
  const { lines, ready } = useCart();
  const [placed, setPlaced] = useState(false);

  if (placed) {
    return (
      <Shell>
        <div className="py-24 text-center" role="status">
          <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-[3px] border-brand/20 border-t-brand" aria-hidden />
          <p className="mt-5 text-[18px] font-bold">Order placed. Opening your order…</p>
        </div>
      </Shell>
    );
  }
  if (!ready) return <CheckoutSkeleton />;
  if (lines.length === 0) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-16 text-center">
          <p className="text-[24px] font-bold tracking-tight">Your cart is empty</p>
          <p className="mt-2 text-[15px] text-ink/60">Nothing to check out yet. The red clouds are waiting, with free worldwide shipping on every order.</p>
          <Link href={`/products/${HOODIE.handle}`} className="btn-brand mt-8 h-14 rounded-2xl px-8 text-[16px]">
            Shop the hoodie
          </Link>
        </div>
      </Shell>
    );
  }
  return <CheckoutBody lines={lines} paymentOptions={paymentOptions} onPlaced={() => setPlaced(true)} />;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="mx-auto max-w-[1100px] px-4 pb-16 pt-6 md:px-8 md:pt-10">
      <h1 className="text-[30px] font-bold tracking-tight md:text-[38px]">Checkout</h1>
      {children}
    </section>
  );
}

function CheckoutSkeleton() {
  return (
    <Shell>
      <div className="mt-6 grid gap-8 md:grid-cols-[1fr_380px]" aria-hidden>
        <div className="space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-soft" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-soft" />
      </div>
    </Shell>
  );
}

function CheckoutBody({ lines, paymentOptions, onPlaced }: { lines: CartLine[]; paymentOptions: PaymentOption[]; onPlaced: () => void }) {
  const router = useRouter();
  const { clear, remove, setOpen } = useCart();
  const cart = useMemo(() => priceCart(lines.map((l) => ({ key: l.key, qty: l.qty }))), [lines]);
  const problem = cartProblem(cart);

  // Mounted only in the browser (after the cart has loaded), so reading the browser's language here is safe.
  const [values, setValues] = useState<Values>(() => ({
    name: "",
    email: "",
    phone: "",
    country: guessCountry(),
    address1: "",
    address2: "",
    city: "",
    region: "",
    postalCode: "",
    notes: "",
    paymentOptionId: paymentOptions[0]?.id ?? "",
  }));
  const [website, setWebsite] = useState(""); // honeypot
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<{ text: string; stock?: boolean } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const set = (field: Field, value: string) => {
    const next = { ...values, [field]: value };
    setValues(next);
    // After the first try, errors update as people type; before it, nobody is scolded mid-word.
    if (submitted) setErrors(validate(next));
    else if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSubmitted(true);
    setFormError(null);
    const found = validate(values);
    setErrors(found);
    const first = FIELDS.find((f) => found[f]);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    if (problem) {
      setFormError({ text: problem });
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, website, lines: cart.lines.map((l) => ({ key: l.key, qty: l.quantity })) }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; token?: string; error?: string } | null;
      if (!res.ok || !data?.ok || !data.token) {
        setFormError({ text: data?.error ?? "Something went wrong on our side. Please try again.", stock: res.status === 409 });
        setSending(false);
        return;
      }
      onPlaced();
      router.replace(`/order/${data.token}`);
      clear();
    } catch {
      setFormError({ text: NETWORK_ERROR });
      setSending(false);
    }
  };

  const selected = paymentOptions.find((o) => o.id === values.paymentOptionId);
  const total = moneyCents(cart.totalCents);
  const postcodeOptional = isCountryCode(values.country) && !needsPostcode(values.country);
  const err = (f: Field) => ({ "aria-invalid": Boolean(errors[f]), "aria-describedby": errors[f] ? `${f}-error` : undefined });

  return (
    <Shell>
      <form ref={formRef} onSubmit={submit} noValidate className="mt-6 grid items-start gap-8 md:grid-cols-[1fr_380px] md:gap-12">
        <div className="order-2 min-w-0 space-y-8 md:order-none">
          <FormSection title="Contact">
            <FormField id="name" label="Full name" error={errors.name}>
              <input
                id="name"
                name="name"
                autoComplete="name"
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                maxLength={100}
                className={input}
                {...err("name")}
              />
            </FormField>
            <FormField id="email" label="Email" error={errors.email} hint="Where we can reach you about this order.">
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={values.email}
                onChange={(e) => set("email", e.target.value)}
                maxLength={254}
                className={input}
                {...err("email")}
              />
            </FormField>
            <FormField id="phone" label="Phone" optional error={errors.phone}>
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={values.phone}
                onChange={(e) => set("phone", e.target.value)}
                maxLength={30}
                className={input}
                {...err("phone")}
              />
            </FormField>
          </FormSection>

          <FormSection title="Shipping address">
            <FormField id="country" label="Country" error={errors.country}>
              <select
                id="country"
                name="country"
                autoComplete="country"
                value={values.country}
                onChange={(e) => set("country", e.target.value)}
                className={`${input} select pr-8`}
                {...err("country")}
              >
                <option value="">Choose your country</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="address1" label="Address" error={errors.address1}>
              <input
                id="address1"
                name="address1"
                autoComplete="address-line1"
                placeholder="Street and house number"
                value={values.address1}
                onChange={(e) => set("address1", e.target.value)}
                maxLength={200}
                className={input}
                {...err("address1")}
              />
            </FormField>
            <FormField id="address2" label="Apartment, suite, etc." optional error={errors.address2}>
              <input
                id="address2"
                name="address2"
                autoComplete="address-line2"
                value={values.address2}
                onChange={(e) => set("address2", e.target.value)}
                maxLength={200}
                className={input}
                {...err("address2")}
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="city" label="City" error={errors.city}>
                <input
                  id="city"
                  name="city"
                  autoComplete="address-level2"
                  value={values.city}
                  onChange={(e) => set("city", e.target.value)}
                  maxLength={100}
                  className={input}
                  {...err("city")}
                />
              </FormField>
              <FormField id="region" label="State / region" optional error={errors.region}>
                <input
                  id="region"
                  name="region"
                  autoComplete="address-level1"
                  value={values.region}
                  onChange={(e) => set("region", e.target.value)}
                  maxLength={100}
                  className={input}
                  {...err("region")}
                />
              </FormField>
            </div>
            <FormField id="postalCode" label="Postal code" optional={postcodeOptional} error={errors.postalCode}>
              <input
                id="postalCode"
                name="postalCode"
                autoComplete="postal-code"
                value={values.postalCode}
                onChange={(e) => set("postalCode", e.target.value)}
                maxLength={20}
                className={`${input} sm:max-w-[220px]`}
                {...err("postalCode")}
              />
            </FormField>
            <FormField id="notes" label="Notes for us" optional error={errors.notes}>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                value={values.notes}
                onChange={(e) => set("notes", e.target.value)}
                maxLength={1000}
                className={`${input} h-auto py-3`}
                placeholder="Delivery instructions, a gift message…"
                {...err("notes")}
              />
            </FormField>
          </FormSection>

          <FormSection title="Payment">
            {paymentOptions.length === 0 ? (
              <p className="rounded-xl bg-soft px-4 py-3 text-[14px]" role="alert">
                Payments aren&apos;t set up right now, so orders can&apos;t be placed. Please try again later or contact us.
              </p>
            ) : (
              <fieldset aria-describedby={errors.paymentOptionId ? "paymentOptionId-error" : undefined}>
                <legend className="sr-only">How you&apos;ll pay</legend>
                <div className="space-y-2">
                  {paymentOptions.map((o) => {
                    const on = o.id === values.paymentOptionId;
                    return (
                      <label
                        key={o.id}
                        className={`block cursor-pointer rounded-xl border-2 p-4 transition ${on ? "border-brand bg-brand/[0.03]" : "border-black/10 hover:border-black/25"}`}
                      >
                        <span className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="paymentOptionId"
                            value={o.id}
                            checked={on}
                            onChange={() => set("paymentOptionId", o.id)}
                            className="h-[18px] w-[18px] accent-brand"
                          />
                          <span className="text-[15px] font-semibold">{o.name}</span>
                        </span>
                        {on && (
                          <span className="mt-2 block whitespace-pre-line pl-[30px] text-[13px] leading-relaxed text-ink/65">
                            {o.instructions.replaceAll("{total}", total).replaceAll("{order}", "your order number")}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                {errors.paymentOptionId && (
                  <p id="paymentOptionId-error" className="mt-2 text-[13px] font-semibold text-brand">
                    {errors.paymentOptionId}
                  </p>
                )}
              </fieldset>
            )}
            <p className="text-[13px] text-ink/60">
              No card is taken here. After you place the order you get the exact details to pay {selected ? `by ${selected.name}` : ""}, and we ship as soon as the payment arrives.
            </p>
          </FormSection>

          {/* Honeypot: hidden from people and screen readers; bots fill every field. */}
          <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden>
            <label htmlFor="website">Website</label>
            <input id="website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
        </div>

        {/* Phones: summary on top, button after the form (display: contents lets the two take their own places).
            Desktop: both in one sticky column on the right. */}
        <aside className="contents md:sticky md:top-24 md:block md:space-y-4">
          <div className="order-1 md:order-none">
            <Summary cart={cart} onEdit={() => setOpen(true)} onRemoveInvalid={() => cart.invalid.forEach(remove)} />
          </div>
          <div className="order-3 space-y-4 md:order-none">
            {formError && (
              <div className="rounded-xl border border-brand/30 bg-brand/[0.05] px-4 py-3 text-[14px] font-semibold text-brand" role="alert">
                {formError.text}
                {formError.stock && (
                  <button type="button" onClick={() => setOpen(true)} className="mt-1 block text-[13px] underline underline-offset-2">
                    Edit your cart
                  </button>
                )}
              </div>
            )}
            {submitted && Object.keys(errors).some((k) => errors[k as Field]) && !formError && (
              <p className="text-[13px] font-semibold text-brand" role="alert">
                Some details are missing or wrong. They&apos;re marked in red.
              </p>
            )}

            <button
              type="submit"
              disabled={sending || paymentOptions.length === 0}
              className="btn-brand h-14 w-full rounded-2xl text-[16px] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
            >
              {sending ? "Placing your order…" : `Place order · ${total}`}
            </button>
            <p className="text-center text-[12px] leading-relaxed text-ink/55">This store is a design preview: your order is recorded but nothing is charged or shipped.</p>
          </div>
        </aside>
      </form>
    </Shell>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-[18px] font-bold tracking-tight">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function FormField({ id, label, optional, hint, error, children }: { id: string; label: string; optional?: boolean; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold">
        {label} {optional && <span className="font-normal text-ink/45">(optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[13px] font-semibold text-brand">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-[12px] text-ink/50">{hint}</p>
      )}
    </div>
  );
}

function Summary({ cart, onEdit, onRemoveInvalid }: { cart: PricedCart; onEdit: () => void; onRemoveInvalid: () => void }) {
  return (
    <div className="rounded-2xl bg-soft p-4 md:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-bold">Order summary</h2>
        <button type="button" onClick={onEdit} className="text-[13px] font-semibold text-ink/60 underline-offset-2 transition hover:text-ink hover:underline">
          Edit cart
        </button>
      </div>
      <ul className="mt-3 divide-y divide-black/5">
        {cart.lines.map((l) => (
          <li key={l.key} className="flex gap-3 py-3">
            <span className="relative shrink-0">
              <Image src={l.image} alt="" width={56} height={56} className={`h-14 w-14 rounded-xl bg-white ${l.kind === "addon" ? "object-contain p-1" : "object-cover"}`} />
              <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] font-bold text-white tabular-nums">
                {l.quantity}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold leading-snug">{l.title}</span>
              {l.detail && <span className="block text-[12px] text-ink/55">{l.detail}</span>}
            </span>
            <span className="text-right text-[14px]">
              <b>{moneyCents(l.lineCents)}</b>
              {l.unitCompareAtCents !== null && <s className="block text-[11px] text-ink/40">{moneyCents(l.unitCompareAtCents * l.quantity)}</s>}
            </span>
          </li>
        ))}
      </ul>
      {cart.invalid.length > 0 && (
        <p className="mt-2 rounded-xl bg-white px-3 py-2 text-[13px]" role="alert">
          {cart.invalid.length === 1 ? "One item in your cart isn't sold any more" : `${cart.invalid.length} items in your cart aren't sold any more`} and will be left out.{" "}
          <button type="button" onClick={onRemoveInvalid} className="font-semibold underline underline-offset-2">
            Remove
          </button>
        </p>
      )}
      <dl className="mt-3 space-y-1.5 border-t border-black/5 pt-3 text-[14px]">
        <div className="flex justify-between">
          <dt className="text-ink/65">Subtotal</dt>
          <dd>{moneyCents(cart.subtotalCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink/65">Shipping</dt>
          <dd className="font-semibold">Free</dd>
        </div>
        {cart.savingCents > 0 && (
          <div className="flex justify-between font-semibold text-brand">
            <dt>You save</dt>
            <dd>{moneyCents(cart.savingCents)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between border-t border-black/5 pt-2">
          <dt className="text-[15px] font-semibold">Total</dt>
          <dd className="text-[22px] font-bold tracking-tight">{moneyCents(cart.totalCents)}</dd>
        </div>
      </dl>
      <p className="mt-1 text-[12px] text-ink/50">Taxes included. Prices in US dollars.</p>
    </div>
  );
}
