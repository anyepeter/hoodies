// The periods the admin can look at. Days are UTC calendar days (the admin shows UTC everywhere), and each
// period is compared with the same stretch of time just before it, cut at the same moment ("so far").

export const DAY_MS = 86_400_000;

export const PERIODS = [
  { key: "today", label: "Today", days: 1 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];
export const DEFAULT_PERIOD: PeriodKey = "7d";

export function parsePeriod(v: unknown): PeriodKey {
  return PERIODS.some((p) => p.key === v) ? (v as PeriodKey) : DEFAULT_PERIOD;
}

export function utcMidnight(d: Date, minusDays = 0): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - minusDays));
}

export interface Range {
  key: PeriodKey;
  days: number;
  /** Start of the period (UTC midnight, `days - 1` days ago) up to now. */
  start: Date;
  end: Date;
  /** The previous period, cut at the same point: [start - days, now - days]. */
  prevStart: Date;
  prevEnd: Date;
  compareLabel: string;
  hourly: boolean;
}

export function periodRange(key: PeriodKey, now = new Date()): Range {
  const days = PERIODS.find((p) => p.key === key)!.days;
  const start = utcMidnight(now, days - 1);
  return {
    key,
    days,
    start,
    end: now,
    prevStart: new Date(start.getTime() - days * DAY_MS),
    prevEnd: new Date(now.getTime() - days * DAY_MS),
    compareLabel: key === "today" ? "vs yesterday at this time" : `vs previous ${days} days`,
    hourly: key === "today",
  };
}

/** Percentage change, or null when there is nothing to compare with. */
export function delta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
