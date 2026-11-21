// Small display helpers shared by the insights pages (analytics, dashboard, messages, subscribers).

/** "just now", "5m ago", "3h ago", "2d ago", then a short UTC date. */
export function ago(d: Date | string, now = Date.now()): string {
  const t = new Date(d).getTime();
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** One line of a message for a list: whitespace collapsed, cut at `max` characters. */
export function preview(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max).trimEnd()}…`;
}

export const DEVICE_LABEL: Record<string, string> = { mobile: "Phone", tablet: "Tablet", desktop: "Desktop" };
export const deviceLabel = (d: string | null | undefined) => (d ? (DEVICE_LABEL[d] ?? d) : "Unknown");
