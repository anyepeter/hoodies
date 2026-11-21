"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Wave } from "@/components/Wave";
import { FOOTER_LINKS, STORE_NAME } from "@/lib/store";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OFFLINE = "We couldn't reach the server. Check your connection and try again.";

export function Footer() {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function subscribe(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "sending") return;
    // Read the form itself (not React state) so text typed before the page finished loading still counts.
    const data = new FormData(e.currentTarget);
    const value = String(data.get("email") ?? "").trim();
    const website = String(data.get("website") ?? "");
    if (!EMAIL_RE.test(value) || value.length > 254) {
      setError("Please enter a valid email address.");
      return;
    }
    setError(null);
    setState("sending");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, website, source: "footer" }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && body?.ok) {
        setState("done");
        return;
      }
      setError(body?.error ?? "Something went wrong on our side. Please try again.");
    } catch {
      setError(OFFLINE);
    }
    setState("idle");
  }

  return (
    <footer className="mt-auto">
      <Wave />
      <div className="bg-brand text-white">
        <section className="mx-auto max-w-[700px] px-6 pb-14 pt-10 text-center">
          <h2 className="text-[28px] font-bold leading-tight md:text-[34px]">Subscribe to our emails</h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-white/85">Be the first to know about new collections and exclusive offers.</p>
          {state === "done" ? (
            <p className="mt-8 font-semibold" role="status">
              Thanks for subscribing
            </p>
          ) : (
            <form className="mx-auto mt-8 flex max-w-[360px] flex-col gap-3" onSubmit={subscribe} noValidate>
              <label className="sr-only" htmlFor="newsletter-email">
                Email
              </label>
              <input
                id="newsletter-email"
                name="email"
                type="email"
                required
                maxLength={254}
                placeholder="Email"
                autoComplete="email"
                onChange={() => error && setError(null)}
                readOnly={state === "sending"}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "newsletter-error" : undefined}
                className={`h-12 rounded-md border bg-transparent px-4 text-[15px] text-white placeholder:text-white/80 focus:outline-none focus:ring-2 focus:ring-white read-only:opacity-70 ${error ? "border-white border-2" : "border-white/90"}`}
              />
              {/* Honeypot: hidden from people and screen readers; bots that fill every field get a quiet "thanks". */}
              <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden>
                <label htmlFor="newsletter-website">Website</label>
                <input id="newsletter-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
              </div>
              {error && (
                <p id="newsletter-error" role="alert" className="rounded-md bg-white px-3 py-2 text-left text-sm font-medium text-brand">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={state === "sending"}
                className="h-12 rounded-md bg-white text-[15px] font-semibold text-brand transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-wait disabled:opacity-80 disabled:hover:scale-100"
              >
                {state === "sending" ? "Signing up…" : "Sign up"}
              </button>
            </form>
          )}
        </section>

        <div className="border-t border-white/15">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-center gap-x-2 gap-y-2 px-6 pb-28 pt-6 text-[11px] text-white/80">
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
