/*
 * Visitors and page views per day (or per hour for "Today") as plain CSS bars: no chart library.
 * Each column is the page views (light) with the visitors drawn over it (brand red), on one shared scale.
 * Hovering a column shows its numbers; screen readers get a one-line summary.
 */
export function SeriesChart({ data }: { data: { key: string; label: string; views: number; visitors: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.views));
  const totalViews = data.reduce((s, d) => s + d.views, 0);
  const peak = data.reduce((best, d) => (d.visitors > best.visitors ? d : best), data[0] ?? { label: "", visitors: 0, views: 0, key: "" });
  const ticks = data.length > 1 ? [data[0]!, data[Math.floor((data.length - 1) / 2)]!, data[data.length - 1]!] : data;

  return (
    <figure className="px-5 pb-4 pt-4">
      <figcaption className="sr-only">
        {totalViews === 0 ? "No page views in this period." : `${totalViews} page views in this period. Busiest: ${peak.label} with ${peak.visitors} visitors.`}
      </figcaption>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand" aria-hidden /> Visitors
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-zinc-200" aria-hidden /> Page views
        </span>
        <span className="ml-auto tabular-nums">max {max.toLocaleString("en-US")}</span>
      </div>
      <div className="relative h-40 border-b border-zinc-200" aria-hidden>
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-zinc-100" />
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-zinc-100" />
        <div className="relative flex h-full items-end gap-px">
          {data.map((d) => (
            <div key={d.key} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${d.label}: ${d.visitors} visitors, ${d.views} page views`}>
              <div className="relative w-full rounded-t-[2px] bg-zinc-200 transition group-hover:bg-zinc-300" style={{ height: `${(d.views / max) * 100}%`, minHeight: d.views ? 2 : 0 }}>
                <div className="absolute inset-x-0 bottom-0 rounded-t-[2px] bg-brand" style={{ height: d.views ? `${(d.visitors / d.views) * 100}%` : 0, minHeight: d.visitors ? 2 : 0 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-zinc-500">
        {ticks.map((t, i) => (
          <span key={`${t.key}-${i}`}>{t.label}</span>
        ))}
      </div>
    </figure>
  );
}
