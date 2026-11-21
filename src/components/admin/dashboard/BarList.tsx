import type { ReactNode } from "react";

/** A ranked list with a proportional bar behind each row (top pages, countries...). Pure CSS. */
export function BarList({ rows, empty }: { rows: { key: string; label: ReactNode; value: number; detail?: ReactNode }[]; empty: string }) {
  if (rows.length === 0) return <p className="px-5 py-8 text-center text-sm text-zinc-500">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1.5 p-3">
      {rows.map((r) => (
        <li key={r.key} className="relative overflow-hidden rounded-md">
          <span className="absolute inset-y-0 left-0 rounded-md bg-brand/10" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} aria-hidden />
          <span className="relative flex items-center justify-between gap-3 px-2.5 py-1.5 text-sm">
            <span className="min-w-0 truncate text-ink">{r.label}</span>
            <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
              {r.detail && <span className="hidden text-xs text-zinc-500 sm:inline">{r.detail}</span>}
              <span className="font-semibold text-ink">{r.value.toLocaleString("en-US")}</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
