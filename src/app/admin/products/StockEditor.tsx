"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { btn, field } from "@/components/admin/ui";
import type { Style } from "@/lib/store";
import { adjustStock, setStock, type StockResult } from "./actions";

/** The stock of one style: an exact number to save, plus quick +5 / −1. */
export function StockEditor({ style, stock }: { style: Style; stock: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(stock));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const [shown, setShown] = useState(stock);
  // When the server's number changes (an order, another tab), show it, unless it's being edited right now.
  if (stock !== shown) {
    setShown(stock);
    if (value === String(shown)) setValue(String(stock));
  }
  const parsed = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(parsed) && parsed >= 0;
  const changed = valid && parsed !== stock;

  const run = (fn: () => Promise<StockResult>) =>
    start(async () => {
      setError(null);
      setSaved(false);
      try {
        const res = await fn();
        if (!res.ok) return setError(res.error);
        setValue(String(res.stock));
        setSaved(true);
        router.refresh();
      } catch {
        setError("We couldn't reach the server. Check your connection and try again.");
      }
    });

  return (
    <div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return setError("Enter a whole number, 0 or more.");
          if (changed) run(() => setStock({ style, stock: parsed }));
        }}
      >
        <label htmlFor={`stock-${style}`} className="sr-only">
          {style} stock
        </label>
        <span className="w-24">
          <input
            id={`stock-${style}`}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
              setSaved(false);
            }}
            className={`${field} h-10 tabular-nums`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `stock-${style}-error` : undefined}
          />
        </span>
        <button type="submit" disabled={pending || !changed} className={btn.primary}>
          {pending ? "Saving…" : "Save"}
        </button>
        <span className="flex gap-1">
          <button type="button" disabled={pending} onClick={() => run(() => adjustStock({ style, delta: 5 }))} className={btn.secondary} aria-label={`Add 5 ${style}`}>
            +5
          </button>
          <button
            type="button"
            disabled={pending || stock <= 0}
            onClick={() => run(() => adjustStock({ style, delta: -1 }))}
            className={btn.secondary}
            aria-label={`Remove 1 ${style}`}
          >
            −1
          </button>
        </span>
      </form>
      {error ? (
        <p id={`stock-${style}-error`} className="mt-2 text-sm font-medium text-brand" role="alert">
          {error}
        </p>
      ) : (
        saved && (
          <p className="mt-2 text-sm text-emerald-700" role="status">
            Saved. The store shows the new number now.
          </p>
        )
      )}
    </div>
  );
}
