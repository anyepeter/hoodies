"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-brand h-11 rounded-xl px-5 text-[14px]">
      Print / Save as PDF
    </button>
  );
}
