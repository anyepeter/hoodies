"use client";

import { useState, type FormEvent } from "react";

const field = "w-full rounded-md border bg-white px-4 text-[15px] transition focus:outline-none focus:ring-1 read-only:bg-soft";
const ok = "border-black/25 focus:border-ink focus:ring-ink";
const bad = "border-brand focus:border-brand focus:ring-brand";

const OFFLINE = "We couldn't reach the server. Check your connection and try again.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-.\s]{5,40}$/;

type Field = "name" | "email" | "phone" | "message";
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;

/** The same rules as /api/contact, so most mistakes show before anything is sent. */
function check(v: Values): Errors {
  const e: Errors = {};
  if (v.name.trim().length > 100) e.name = "Keep your name under 100 characters.";
  const email = v.email.trim();
  if (!email) e.email = "Please enter your email.";
  else if (email.length > 254 || !EMAIL_RE.test(email)) e.email = "Please enter a valid email address.";
  const phone = v.phone.trim();
  if (phone && !PHONE_RE.test(phone)) e.phone = "Please enter a valid phone number, or leave it empty.";
  const msg = v.message.trim();
  if (msg.length < 5) e.message = "Please write a little more (at least 5 characters).";
  else if (msg.length > 4000) e.message = "Please keep your message under 4000 characters.";
  return e;
}

export function ContactForm() {
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  const clear = (k: Field) => () => {
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "sending") return;
    // Read the form itself (uncontrolled inputs), so anything typed before the page finished loading counts.
    const data = new FormData(e.currentTarget);
    const get = (k: string) => String(data.get(k) ?? "");
    const values: Values = { name: get("name"), email: get("email"), phone: get("phone"), message: get("message") };
    const website = get("website");
    const found = check(values);
    setErrors(found);
    setFormError(null);
    const first = (["name", "email", "phone", "message"] as Field[]).find((k) => found[k]);
    if (first) {
      document.getElementById(`contact-${first}`)?.focus();
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, website }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; fields?: Errors } | null;
      if (res.ok && body?.ok) {
        setState("sent");
        return;
      }
      if (body?.fields) setErrors(body.fields);
      setFormError(body?.error ?? "Something went wrong on our side. Please try again.");
    } catch {
      setFormError(OFFLINE);
    }
    setState("idle");
  }

  if (state === "sent") {
    return (
      <p className="mt-6 rounded-md bg-soft px-4 py-3 font-semibold" role="status">
        Thanks for contacting us. We&apos;ll get back to you as soon as possible.
      </p>
    );
  }

  const sending = state === "sending";
  const describe = (k: Field) => (errors[k] ? `contact-${k}-error` : undefined);
  const err = (k: Field) =>
    errors[k] ? (
      <span id={`contact-${k}-error`} className="mt-1.5 block text-sm font-medium text-brand">
        {errors[k]}
      </span>
    ) : null;

  return (
    <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={submit} noValidate>
      <div className="block">
        <label className="sr-only" htmlFor="contact-name">
          Name
        </label>
        <input
          id="contact-name"
          name="name"
          className={`${field} ${errors.name ? bad : ok} h-12`}
          placeholder="Name"
          autoComplete="name"
          maxLength={100}
          onChange={clear("name")}
          readOnly={sending}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describe("name")}
        />
        {err("name")}
      </div>
      <div className="block">
        <label className="sr-only" htmlFor="contact-email">
          Email (required)
        </label>
        <input
          id="contact-email"
          name="email"
          className={`${field} ${errors.email ? bad : ok} h-12`}
          placeholder="Email *"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
          onChange={clear("email")}
          readOnly={sending}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describe("email")}
        />
        {err("email")}
      </div>
      <div className="block md:col-span-2">
        <label className="sr-only" htmlFor="contact-phone">
          Phone number
        </label>
        <input
          id="contact-phone"
          name="phone"
          className={`${field} ${errors.phone ? bad : ok} h-12`}
          placeholder="Phone number"
          type="tel"
          autoComplete="tel"
          maxLength={40}
          onChange={clear("phone")}
          readOnly={sending}
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={describe("phone")}
        />
        {err("phone")}
      </div>
      <div className="block md:col-span-2">
        <label className="sr-only" htmlFor="contact-message">
          Comment (required)
        </label>
        <textarea
          id="contact-message"
          name="message"
          className={`${field} ${errors.message ? bad : ok} min-h-[140px] py-3`}
          placeholder="Comment"
          required
          maxLength={4000}
          onChange={clear("message")}
          readOnly={sending}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={describe("message")}
        />
        {err("message")}
      </div>
      {/* Honeypot: hidden from people and screen readers. */}
      <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden>
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      {formError && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm font-medium text-brand md:col-span-2">
          {formError}
        </p>
      )}
      <div>
        <button type="submit" className="btn-brand min-w-[160px] disabled:cursor-wait disabled:opacity-70" disabled={sending}>
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
