"use client";

import Link from "next/link";
import { useState } from "react";
import { Wave } from "@/components/Wave";
import { FOOTER_LINKS, STORE_NAME } from "@/lib/store";

export function Footer() {
  const [done, setDone] = useState(false);
  return (
    <footer className="mt-auto">
      <Wave />
      <div className="bg-brand text-white">
        <section className="mx-auto max-w-[700px] px-6 pb-14 pt-10 text-center">
          <h2 className="text-[28px] font-bold leading-tight md:text-[34px]">Subscribe to our emails</h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-white/85">Be the first to know about new collections and exclusive offers.</p>
          {done ? (
            <p className="mt-8 font-semibold" role="status">
              Thanks for subscribing
            </p>
          ) : (
            <form
              className="mx-auto mt-8 flex max-w-[360px] flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                setDone(true);
              }}
            >
              <label className="sr-only" htmlFor="newsletter-email">
                Email
              </label>
              <input
                id="newsletter-email"
                type="email"
                required
                placeholder="Email"
                autoComplete="email"
                className="h-12 rounded-md border border-white/90 bg-transparent px-4 text-[15px] text-white placeholder:text-white/80 focus:outline-none focus:ring-2 focus:ring-white"
              />
              <button type="submit" className="h-12 rounded-md bg-white text-[15px] font-semibold text-brand transition-transform hover:scale-[1.02] active:scale-[0.98]">
                Sign up
              </button>
            </form>
          )}
        </section>

        <div className="border-t border-white/15">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-center gap-x-2 gap-y-2 px-6 py-6 text-[11px] text-white/80">
            <span>© 2026, {STORE_NAME}</span>
            {FOOTER_LINKS.map((l) => (
              <span key={l.href} className="flex items-center gap-2">
                <span aria-hidden>·</span>
                <Link href={l.href} className="hover:underline">
                  {l.label}
                </Link>
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
