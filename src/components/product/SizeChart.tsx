"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon, RulerIcon } from "@/components/icons";
import { SIZE_CHART } from "@/lib/store";

const COLS = [
  ["chest", "Chest", "circumference"],
  ["shoulder", "Shoulder", "width"],
  ["sleeve", "Sleeve", "length"],
  ["body", "Body", "length"],
] as const;

/**
 * The original shows its size guide as a picture of a table: tiny on a phone, unreadable to screen
 * readers, inches only. This is the same numbers as a real table, with a cm switch.
 */
export function SizeChart({ highlight }: { highlight?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [unit, setUnit] = useState<"in" | "cm">("in");

  useEffect(() => {
    const d = dialog.current;
    const close = (e: MouseEvent) => e.target === d && d?.close();
    d?.addEventListener("click", close);
    return () => d?.removeEventListener("click", close);
  }, []);

  const value = (n: number) => (unit === "in" ? n.toFixed(2) : String(Math.round(n * 2.54)));

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="inline-flex items-center gap-2 text-[15px] font-semibold text-ink transition hover:text-brand">
        <RulerIcon className="h-5 w-5" />
        <span className="underline underline-offset-4">Sizing chart</span>
      </button>
      <dialog ref={dialog} className="sheet m-auto w-[min(94vw,560px)] rounded-3xl bg-white p-0 shadow-2xl backdrop:bg-ink/60 backdrop:backdrop-blur-sm">
        <div className="p-5 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[24px] font-bold tracking-tight">Size guide</h2>
              <p className="mt-1 text-[13px] text-ink/60">Garment measurements. Compare with a hoodie you already own for the closest fit.</p>
            </div>
            <button type="button" onClick={() => dialog.current?.close()} className="-mr-2 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-black/5" aria-label="Close size guide">
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5 inline-flex rounded-full bg-soft p-1 text-[13px] font-semibold" role="group" aria-label="Units">
            {(["in", "cm"] as const).map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={unit === u}
                onClick={() => setUnit(u)}
                className={`rounded-full px-4 py-1.5 transition ${unit === u ? "bg-ink text-white shadow" : "text-ink/60 hover:text-ink"}`}
              >
                {u === "in" ? "Inches" : "Centimetres"}
              </button>
            ))}
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-black/10">
            <table className="w-full text-center text-[13px] tabular-nums md:text-[14px]">
              <thead className="bg-soft text-[12px]">
                <tr>
                  <th scope="col" className="py-3 pl-3 pr-1 text-left font-bold">Size</th>
                  {COLS.map(([key, label, sub]) => (
                    <th key={key} scope="col" className="px-1 py-3 font-bold md:px-2">
                      {label}
                      <span className="block text-[10px] font-normal text-ink/50">{sub}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {SIZE_CHART.map((row) => (
                  <tr key={row.size} className={row.size === highlight ? "bg-brand/[0.06]" : ""}>
                    <th scope="row" className="py-3 pl-3 pr-1 text-left font-bold text-brand">{row.size}</th>
                    {COLS.map(([key]) => (
                      <td key={key} className="px-1 py-3 md:px-2">{value(row[key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] text-ink/50">Measurements in {unit === "in" ? "inches" : "centimetres"}. The hoodie is unisex.</p>
        </div>
      </dialog>
    </>
  );
}
