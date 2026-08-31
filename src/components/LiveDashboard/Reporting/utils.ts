"use client";

import type { SlowTradingReportRow } from "./types";

export type DailyStat = { day: string; trades: number; wins: number; losses: number };

export type DailyPnlPercentStat = {
  day: string;
  pnlPercentSum: number;
  pnlPercentWinSum: number;
  pnlPercentLossSum: number;
};

export type DailyPnlUsdtStat = {
  day: string;
  pnlUsdtSum: number;
  pnlUsdtWinSum: number;
  pnlUsdtLossSum: number;
};

export type DailyDrawdownStat = {
  day: string;
  drawdownMin: number;
  drawdownAvg: number;
  drawdownMax: number;
};

export type DailyHoldStat = {
  day: string;
  holdMinMs: number;
  holdAvgMs: number;
  holdMaxMs: number;
};

export type MaxUpDistributionBucket = {
  count: number;
  label: string;
  maxPct: number;
  minPct: number;
};

export const DEFAULT_MAX_UP_DISTRIBUTION_INTERVAL_PCT = 0.5;
export const MIN_MAX_UP_DISTRIBUTION_INTERVAL_PCT = 0.1;

/** Normalizes the user-selected Max Up distribution interval. */
export function normalizeMaxUpDistributionInterval(value: number): number {
  return Number.isFinite(value) && value >= MIN_MAX_UP_DISTRIBUTION_INTERVAL_PCT
    ? value
    : DEFAULT_MAX_UP_DISTRIBUTION_INTERVAL_PCT;
}

function getBucketDecimalPlaces(intervalPct: number): number {
  return Math.min(
    6,
    Math.max(0, (String(intervalPct).split(".")[1] ?? "").length),
  );
}

function roundBucketBoundary(value: number, intervalPct: number): number {
  return Number(value.toFixed(getBucketDecimalPlaces(intervalPct)));
}

function formatBucketBoundary(value: number, intervalPct: number): string {
  return roundBucketBoundary(value, intervalPct).toString();
}

function getDistributionBucketIndex(value: number, intervalPct: number): number {
  return Math.floor((value + Number.EPSILON * 100) / intervalPct);
}

/** Counts closed trades by half-open Max Up percentage ranges. */
export function computeMaxUpDistribution(
  history: SlowTradingReportRow[],
  intervalPct: number,
): MaxUpDistributionBucket[] {
  const interval = normalizeMaxUpDistributionInterval(intervalPct);
  const values = history
    .map((item) => item.pnl.maxUpPct)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value >= 0,
    );

  if (values.length === 0) return [];

  const bucketCount =
    getDistributionBucketIndex(Math.max(...values), interval) + 1;
  const buckets = Array.from(
    { length: bucketCount },
    (_, index): MaxUpDistributionBucket => {
      const minPct = roundBucketBoundary(index * interval, interval);
      const maxPct = roundBucketBoundary(minPct + interval, interval);
      return {
        count: 0,
        label:
          `${formatBucketBoundary(minPct, interval)} - ` +
          formatBucketBoundary(maxPct, interval),
        maxPct,
        minPct,
      };
    },
  );

  for (const value of values) {
    buckets[getDistributionBucketIndex(value, interval)].count += 1;
  }

  return buckets;
}

function getDay(row: SlowTradingReportRow): string {
  return new Date(row.closed?.t ?? row.opened.t).toISOString().slice(0, 10);
}

function sortByExitTime(history: SlowTradingReportRow[]): SlowTradingReportRow[] {
  return [...history].sort(
    (a, b) => (a.closed?.t ?? 0) - (b.closed?.t ?? 0),
  );
}

export function formatHoldMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function computeDailyStats(history: SlowTradingReportRow[]): DailyStat[] {
  const map = new Map<string, DailyStat>();

  for (const item of sortByExitTime(history)) {
    const day = getDay(item);
    const current = map.get(day) ?? { day, trades: 0, wins: 0, losses: 0 };
    current.trades += 1;
    const pnl = item.pnl.netUsdt || 0;
    if (pnl > 0) current.wins += 1;
    else current.losses += 1;
    map.set(day, current);
  }

  return Array.from(map.values());
}

export function computeDailyHoldStats(
  history: SlowTradingReportRow[],
): DailyHoldStat[] {
  const map = new Map<string, { min: number; max: number; sum: number; count: number }>();

  for (const item of sortByExitTime(history)) {
    const holdMs = (item.closed?.t ?? NaN) - item.opened.t;
    if (!Number.isFinite(holdMs) || holdMs <= 0) continue;

    const day = getDay(item);
    const current = map.get(day) ?? {
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
      sum: 0,
      count: 0,
    };

    current.min = Math.min(current.min, holdMs);
    current.max = Math.max(current.max, holdMs);
    current.sum += holdMs;
    current.count += 1;
    map.set(day, current);
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, value]) => ({
      day,
      holdMinMs: value.count > 0 ? value.min : 0,
      holdAvgMs: value.count > 0 ? value.sum / value.count : 0,
      holdMaxMs: value.count > 0 ? value.max : 0,
    }));
}

export function computeDailyPnlPercentStats(
  history: SlowTradingReportRow[],
): DailyPnlPercentStat[] {
  const map = new Map<string, { sum: number; winSum: number; lossSum: number }>();

  for (const item of sortByExitTime(history)) {
    if (typeof item.pnl.netPct !== "number") continue;

    const day = getDay(item);
    const current = map.get(day) ?? { sum: 0, winSum: 0, lossSum: 0 };
    current.sum += item.pnl.netPct;
    if (item.pnl.netPct >= 0) current.winSum += item.pnl.netPct;
    else current.lossSum += item.pnl.netPct;
    map.set(day, current);
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, value]) => ({
      day,
      pnlPercentSum: value.sum,
      pnlPercentWinSum: value.winSum,
      pnlPercentLossSum: value.lossSum,
    }));
}

export function computeDailyPnlUsdtStats(
  history: SlowTradingReportRow[],
): DailyPnlUsdtStat[] {
  const map = new Map<string, { sum: number; winSum: number; lossSum: number }>();

  for (const item of sortByExitTime(history)) {
    if (typeof item.pnl.netUsdt !== "number") continue;

    const day = getDay(item);
    const current = map.get(day) ?? { sum: 0, winSum: 0, lossSum: 0 };
    current.sum += item.pnl.netUsdt;
    if (item.pnl.netUsdt >= 0) current.winSum += item.pnl.netUsdt;
    else current.lossSum += item.pnl.netUsdt;
    map.set(day, current);
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, value]) => ({
      day,
      pnlUsdtSum: value.sum,
      pnlUsdtWinSum: value.winSum,
      pnlUsdtLossSum: value.lossSum,
    }));
}

export function computeDailyDrawdownStats(
  history: SlowTradingReportRow[],
): DailyDrawdownStat[] {
  const map = new Map<string, { min: number; max: number; sum: number; count: number }>();

  for (const item of sortByExitTime(history)) {
    const dd =
      typeof item.pnl.maxDownPct === "number"
        ? item.pnl.maxDownPct
        : typeof item.pnl.netPct === "number"
          ? Math.min(item.pnl.netPct, 0)
          : null;

    if (dd == null || !Number.isFinite(dd)) {
      continue;
    }

    const day = getDay(item);
    const current = map.get(day) ?? {
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
      sum: 0,
      count: 0,
    };

    current.min = Math.min(current.min, dd);
    current.max = Math.max(current.max, dd);
    current.sum += dd;
    current.count += 1;
    map.set(day, current);
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, value]) => ({
      day,
      drawdownMin: value.count > 0 ? value.min : 0,
      drawdownAvg: value.count > 0 ? value.sum / value.count : 0,
      drawdownMax: value.count > 0 ? value.max : 0,
    }));
}

export function computeBalanceSeries(params: {
  history: SlowTradingReportRow[];
  startingBalanceUSDT: number;
}) {
  const { history, startingBalanceUSDT } = params;
  const daily = computeDailyPnlUsdtStats(history);
  let runningBalance = Number.isFinite(startingBalanceUSDT) ? startingBalanceUSDT : 0;

  return daily.map((row) => {
    runningBalance += row.pnlUsdtSum;
    return {
      day: row.day,
      balance: runningBalance,
    };
  });
}
