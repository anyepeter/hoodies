// The admin's small design system. Every admin page uses these so the panel looks like one product.
// Look: light zinc page, white cards with a hairline border, ink text, the store's red for actions and alerts.
import Link from "next/link";
import type { ReactNode } from "react";

export const btn = {
  primary:
    "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-ink transition hover:border-zinc-400 hover:bg-zinc-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
  danger:
    "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
  ghost: "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-ink",
};

export const field =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-ink shadow-sm transition placeholder:text-zinc-400 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10 disabled:bg-zinc-50";
export const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500";

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-ink">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = "", title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-zinc-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3.5">
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label: l, value, hint, tone = "default", href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "alert" | "good"; href?: string }) {
  const body = (
    <div className={`h-full rounded-xl border bg-white p-4 shadow-sm transition ${href ? "hover:border-zinc-300 hover:shadow" : ""} ${tone === "alert" ? "border-red-200" : "border-zinc-200"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{l}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums tracking-tight ${tone === "alert" ? "text-brand" : tone === "good" ? "text-emerald-700" : "text-ink"}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

const PILL: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  PAID: "bg-sky-50 text-sky-800 ring-sky-200",
  SHIPPED: "bg-violet-50 text-violet-800 ring-violet-200",
  DELIVERED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CANCELLED: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  REFUNDED: "bg-rose-50 text-rose-700 ring-rose-200",
  UNREAD: "bg-red-50 text-brand ring-red-200",
  READ: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  ARCHIVED: "bg-zinc-100 text-zinc-500 ring-zinc-200",
  OPEN: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CLOSED: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  SUBSCRIBED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  UNSUBSCRIBED: "bg-zinc-100 text-zinc-500 ring-zinc-200",
  ACTIVE: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  HIDDEN: "bg-zinc-100 text-zinc-500 ring-zinc-200",
};

/** A status as a coloured pill. Unknown statuses fall back to grey. */
export function StatusPill({ status, children }: { status: string; children?: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${PILL[status] ?? "bg-zinc-100 text-zinc-600 ring-zinc-200"}`}>
      {children ?? status.toLowerCase()}
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-zinc-500">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** A row of filter tabs that are links (?status=PAID), each with an optional count. */
export function Tabs({ items, active }: { items: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <nav className="no-scrollbar -mx-1 mb-4 flex gap-1 overflow-x-auto px-1" aria-label="Filter">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${t.key === active ? "bg-ink text-white" : "text-zinc-600 hover:bg-white hover:text-ink"}`}
        >
          {t.label}
          {typeof t.count === "number" && (
            <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${t.key === active ? "bg-white/20 text-white" : "bg-zinc-200 text-zinc-700"}`}>{t.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** Money in USD for the admin: $1,234.56 */
export const usd = (n: number | string | { toString(): string }) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(typeof n === "object" ? n.toString() : n));

/** "21 Nov 2026, 14:05" in the viewer's time zone is a client concern; on the server we show UTC-ish short dates. */
export const shortDate = (d: Date | string) =>
  new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

export const orderNo = (n: number) => `#${1000 + n}`;
