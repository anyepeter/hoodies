"use client";

import { useState } from "react";

const field = "w-full rounded-md border border-black/25 bg-white px-4 text-[15px] transition focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink";

/** Demo form: it says thanks but sends nothing anywhere. */
export function ContactForm() {
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <p className="mt-6 rounded-md bg-soft px-4 py-3 font-semibold" role="status">
        Thanks for contacting us. We&apos;ll get back to you as soon as possible.
      </p>
    );
  }
  return (
    <form
      className="mt-6 grid gap-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
    >
      <label className="block">
        <span className="sr-only">Name</span>
        <input className={`${field} h-12`} placeholder="Name" autoComplete="name" />
      </label>
      <label className="block">
        <span className="sr-only">Email</span>
        <input className={`${field} h-12`} placeholder="Email *" type="email" required autoComplete="email" />
      </label>
      <label className="block md:col-span-2">
        <span className="sr-only">Phone number</span>
        <input className={`${field} h-12`} placeholder="Phone number" type="tel" autoComplete="tel" />
      </label>
      <label className="block md:col-span-2">
        <span className="sr-only">Comment</span>
        <textarea className={`${field} min-h-[140px] py-3`} placeholder="Comment" />
      </label>
      <div>
        <button type="submit" className="btn-brand min-w-[160px]">
          Send
        </button>
      </div>
    </form>
  );
}
