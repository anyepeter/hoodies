/** "▲ 12% vs previous 7 days" in green, "▼ 8% ..." in red, or a quiet note when there's nothing to compare. */
export function Delta({ value, label, empty = "nothing to compare yet" }: { value: number | null; label: string; empty?: string }) {
  if (value === null) return <span className="text-zinc-400">{empty}</span>;
  const rounded = Math.round(value);
  if (rounded === 0) return <span className="text-zinc-500">No change {label}</span>;
  const up = rounded > 0;
  return (
    <span className={up ? "text-emerald-700" : "text-brand"}>
      <span aria-hidden>{up ? "▲" : "▼"}</span> <span className="sr-only">{up ? "Up" : "Down"}</span>
      {Math.abs(rounded).toLocaleString("en-US")}% <span className="text-zinc-500">{label}</span>
    </span>
  );
}
