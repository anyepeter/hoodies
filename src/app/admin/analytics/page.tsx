import type { Metadata } from "next";
import Link from "next/link";
import { BarList } from "@/components/admin/dashboard/BarList";
import { Delta } from "@/components/admin/dashboard/Delta";
import { SeriesChart } from "@/components/admin/dashboard/SeriesChart";
import { Card, EmptyState, Kpi, PageHeader, Tabs, shortDate } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/admin-session";
import { ago, deviceLabel } from "@/lib/analytics/format";
import { DEFAULT_PERIOD, PERIODS, delta, parsePeriod, periodRange, type PeriodKey } from "@/lib/analytics/period";
import { loadReport } from "@/lib/analytics/report";
import { BOT_REASON_LABEL, CROWD_MAX_VIEWS, CROWD_MIN, DEFAULT_TRAFFIC, loadTraffic, parseTraffic, type BotReason, type TrafficMode } from "@/lib/analytics/traffic";
import { countryFlag, countryName, formatDuration, visitorLabel } from "@/lib/visitor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analytics" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AnalyticsPage({ searchParams }: { searchParams: SP }) {
  await requireAdminPage();
  const sp = await searchParams;
  const period = parsePeriod(sp.p);
  const mode = parseTraffic(sp.t);
  const range = periodRange(period);
  const traffic = await loadTraffic();
  const r = await loadReport(range, mode, traffic.botIds);

  const href = (next: { p?: PeriodKey; t?: TrafficMode }) => {
    const q = new URLSearchParams();
    const p = next.p ?? period;
    const t = next.t ?? mode;
    if (p !== DEFAULT_PERIOD) q.set("p", p);
    if (t !== DEFAULT_TRAFFIC) q.set("t", t);
    const s = q.toString();
    return s ? `/admin/analytics?${s}` : "/admin/analytics";
  };

  const perVisitor = r.visitors ? r.views / r.visitors : 0;
  const prevPerVisitor = r.prev.visitors ? r.prev.views / r.prev.visitors : 0;
  const periodWord = period === "today" ? "today" : `in the last ${range.days} days`;
  const nothingYet = traffic.total === 0;

  return (
    <>
      <PageHeader title="Analytics" subtitle={`Who visits the store, where from, and what they look at. Days are in UTC.`} />

      <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <Tabs active={period} items={PERIODS.map((p) => ({ key: p.key, label: p.label, href: href({ p: p.key }) }))} />
        <div className="mb-4 inline-flex w-fit rounded-lg border border-zinc-200 bg-white p-0.5 text-sm" role="group" aria-label="Which visitors to count">
          {(
            [
              ["people", "Real people", traffic.people],
              ["all", "All traffic", traffic.total],
            ] as const
          ).map(([key, text, n]) => (
            <Link
              key={key}
              href={href({ t: key })}
              aria-current={mode === key ? "page" : undefined}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 font-medium transition ${mode === key ? "bg-ink text-white" : "text-zinc-600 hover:text-ink"}`}
            >
              {text}
              <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${mode === key ? "bg-white/20" : "bg-zinc-100 text-zinc-700"}`}>{n.toLocaleString("en-US")}</span>
            </Link>
          ))}
        </div>
      </div>

      <details className="mb-6 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
        <summary className="cursor-pointer font-medium text-ink">
          How &ldquo;Real people&rdquo; works{traffic.bots > 0 ? ` (${traffic.bots.toLocaleString("en-US")} visitor${traffic.bots === 1 ? "" : "s"} left out)` : ""}
        </summary>
        <div className="mt-3 space-y-2 leading-relaxed">
          <p>Crawlers that say who they are (Googlebot, uptime checkers, scripts) are never recorded. Bots that pretend to be a normal browser are, so &ldquo;Real people&rdquo; leaves out a visitor only when they never gave an email and never spent a single measured second on a page, and also:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-ink">{BOT_REASON_LABEL["not-a-browser"]}</strong>: their user agent isn&apos;t a web browser at all.
            </li>
            <li>
              <strong className="text-ink">{BOT_REASON_LABEL["no-page"]}</strong>: they have no page view (only a direct call to the tracking API does that).
            </li>
            <li>
              <strong className="text-ink">{BOT_REASON_LABEL.crowd}</strong>: {CROWD_MIN} or more visitors share the exact same user agent, none of them ever spent time on a page, and this one saw at most {CROWD_MAX_VIEWS} pages.
            </li>
          </ul>
          <p>
            Anyone who left an email or read a page counts as a person, whatever else is true. When in doubt, a visitor is counted. Switch to &ldquo;All traffic&rdquo; to see everyone.
            {traffic.bots > 0 &&
              ` Left out now: ${(Object.keys(traffic.byReason) as BotReason[])
                .filter((k) => traffic.byReason[k] > 0)
                .map((k) => `${traffic.byReason[k]} ${BOT_REASON_LABEL[k].toLowerCase()}`)
                .join(", ")}.`}
          </p>
        </div>
      </details>

      {nothingYet ? (
        <EmptyState title="No visitors yet">Page views appear here as soon as someone browses the store. Your own visits to the admin are never counted.</EmptyState>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Visitors" value={r.visitors.toLocaleString("en-US")} hint={<Delta value={delta(r.visitors, r.prev.visitors)} label={range.compareLabel} />} />
            <Kpi label="Page views" value={r.views.toLocaleString("en-US")} hint={<Delta value={delta(r.views, r.prev.views)} label={range.compareLabel} />} />
            <Kpi
              label="Avg time on page"
              value={formatDuration(r.avgMs) ?? "—"}
              hint={r.avgMs === null ? "no timed views yet" : <Delta value={r.prev.avgMs === null ? null : delta(r.avgMs, r.prev.avgMs)} label={range.compareLabel} />}
            />
            <Kpi
              label="Views per visitor"
              value={r.visitors ? perVisitor.toFixed(1) : "—"}
              hint={<Delta value={r.visitors && prevPerVisitor ? delta(perVisitor, prevPerVisitor) : null} label={range.compareLabel} />}
            />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card
              className="lg:col-span-2"
              title={period === "today" ? "Today, hour by hour" : `Last ${range.days} days`}
              actions={<span className="text-xs text-zinc-500">{r.newVisitors.toLocaleString("en-US")} new visitors</span>}
            >
              <SeriesChart data={r.series} />
            </Card>
            <Card
              title={
                <span className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2" aria-hidden>
                    {r.live.length > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" />}
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${r.live.length > 0 ? "bg-emerald-500" : "bg-zinc-300"}`} />
                  </span>
                  Live now
                </span>
              }
              actions={<span className="text-xs text-zinc-500">last 5 minutes</span>}
            >
              <div className="px-5 pt-4">
                <p className="text-3xl font-bold tabular-nums tracking-tight text-ink">{r.live.length >= 50 ? "50+" : r.live.length}</p>
                <p className="text-xs text-zinc-500">{r.live.length === 1 ? "visitor on the store" : "visitors on the store"}</p>
              </div>
              {r.live.length === 0 ? (
                <p className="px-5 pb-5 pt-3 text-sm text-zinc-500">Nobody right now.</p>
              ) : (
                <ul className="mt-3 divide-y divide-zinc-100 border-t border-zinc-100">
                  {r.live.slice(0, 8).map((v) => (
                    <li key={v.id} className="flex items-center gap-3 px-5 py-2 text-sm">
                      <span title={countryName(v.countryCode) ?? "Unknown country"}>{countryFlag(v.countryCode)}</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink" title={v.path}>
                        {v.path}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500">{deviceLabel(v.device)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="Top pages" actions={<span className="text-xs text-zinc-500">views</span>}>
              <BarList
                empty={`No page views ${periodWord}.`}
                rows={r.topPages.map((p) => ({
                  key: p.path,
                  label: <span className="font-mono text-xs" title={p.path}>{p.path}</span>,
                  value: p.views,
                  detail: `${p.visitors} visitor${p.visitors === 1 ? "" : "s"}${p.avgMs ? ` · ${formatDuration(p.avgMs)}` : ""}`,
                }))}
              />
            </Card>
            <Card title="Countries" actions={<span className="text-xs text-zinc-500">visitors</span>}>
              <BarList
                empty={`No visitors ${periodWord}.`}
                rows={r.countries.map((c) => ({
                  key: c.code ?? "unknown",
                  label: (
                    <>
                      <span className="mr-2" aria-hidden>
                        {countryFlag(c.code)}
                      </span>
                      {countryName(c.code) ?? "Unknown"}
                    </>
                  ),
                  value: c.visitors,
                }))}
              />
            </Card>
            <Card title="Devices" actions={<span className="text-xs text-zinc-500">visitors</span>}>
              <BarList empty={`No visitors ${periodWord}.`} rows={r.devices.map((d) => ({ key: d.device ?? "unknown", label: deviceLabel(d.device), value: d.visitors }))} />
            </Card>
            <Card title="Referrers" actions={<span className="text-xs text-zinc-500">visitors</span>}>
              <BarList
                empty={`No visitors arrived from another site ${periodWord}. Typed addresses, bookmarks and most apps send no referrer.`}
                rows={r.referrers.map((x) => ({ key: x.host, label: x.host, value: x.visitors, detail: `${x.views} visit${x.views === 1 ? "" : "s"}` }))}
              />
            </Card>
          </div>

          <Card title="Recent visitors" actions={<span className="text-xs text-zinc-500">active {periodWord}</span>}>
            {r.recent.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-zinc-500">No visitors {periodWord}.</p>
            ) : (
              <>
                {/* Phones: one card per visitor */}
                <ul className="divide-y divide-zinc-100 md:hidden">
                  {r.recent.map((v) => (
                    <li key={v.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{v.email ?? visitorLabel(v.id)}</p>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {countryFlag(v.countryCode)} {countryName(v.countryCode) ?? "Unknown"}
                            {v.city ? `, ${v.city}` : ""} · {deviceLabel(v.device)}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-zinc-500">{ago(v.lastSeenAt)}</span>
                      </div>
                      <p className="mt-1.5 text-xs text-zinc-500">
                        {v.views} page{v.views === 1 ? "" : "s"}
                        {formatDuration(v.ms) ? ` · ${formatDuration(v.ms)}` : ""} · first seen {ago(v.firstSeenAt)}
                        {v.referrer ? ` · via ${v.referrer}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
                {/* Tablets and up: a table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
                        <th className="px-5 py-2.5 font-semibold">Visitor</th>
                        <th className="px-3 py-2.5 font-semibold">Where</th>
                        <th className="px-3 py-2.5 font-semibold">Device</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Pages</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Time</th>
                        <th className="px-3 py-2.5 font-semibold">First seen</th>
                        <th className="px-5 py-2.5 font-semibold">Last seen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {r.recent.map((v) => (
                        <tr key={v.id} className="hover:bg-zinc-50">
                          <td className="max-w-[220px] px-5 py-2.5">
                            <p className="truncate font-medium text-ink">{v.email ?? visitorLabel(v.id)}</p>
                            {v.referrer && <p className="truncate text-xs text-zinc-500">via {v.referrer}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-zinc-600">
                            <span className="mr-1.5" aria-hidden>
                              {countryFlag(v.countryCode)}
                            </span>
                            {countryName(v.countryCode) ?? "Unknown"}
                            {v.city && <span className="block text-xs text-zinc-400">{v.city}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-zinc-600">{deviceLabel(v.device)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-ink">{v.views}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-ink">{formatDuration(v.ms) ?? <span className="text-zinc-400">—</span>}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-zinc-500" title={shortDate(v.firstSeenAt)}>
                            {ago(v.firstSeenAt)}
                          </td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-xs text-zinc-500" title={shortDate(v.lastSeenAt)}>
                            {ago(v.lastSeenAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </>
  );
}
