import type { VolatilityPoint } from "@/lib/dynamic";
import coinCapitalEfficiency from "@/lib/devBacktest/coins/capital-efficiency";

export interface ThresholdEntry {
  direction: "LONG" | "SHORT";
  point: VolatilityPoint;
  symbol: string;
}

export interface MonthlyEntryCount {
  count: number;
  monthStart: number;
}

export interface ThresholdAnalysis {
  averageEntriesPerMonth: number;
  entries: ThresholdEntry[];
  exceededSequenceCount: number;
  maximumEntriesPerMonth: number;
  minimumEntriesPerMonth: number;
  monthlyEntries: MonthlyEntryCount[];
}

export interface CoinMonthlyMetrics {
  entrySequenceCount: number | null;
  entrySignalsPerMonth: number | null;
  holdDurationAvgMs: number | null;
  holdDurationMaxMs: number | null;
  holdDurationMinMs: number | null;
  vPointsPerMonth: number | null;
}

function monthStartUtc(time: number) {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function nextMonthUtc(time: number) {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

function getFiniteTimeBounds(volatilityMap: Record<string, VolatilityPoint[]>) {
  let minTime: number | null = null;
  let maxTime: number | null = null;
  for (const points of Object.values(volatilityMap)) {
    for (const point of points) {
      if (!Number.isFinite(point.t)) continue;
      if (minTime === null || point.t < minTime) minTime = point.t;
      if (maxTime === null || point.t > maxTime) maxTime = point.t;
    }
  }
  return { maxTime, minTime };
}

/**
 * Selects one entry per directional level sequence and aggregates it by month.
 * A sequence resets at level zero or a defensive sign change.
 */
export function analyzeThresholdEntries({
  maximumLevel,
  minimumLevel,
  volatilityMap,
}: {
  maximumLevel: number;
  minimumLevel: number;
  volatilityMap: Record<string, VolatilityPoint[]>;
}): ThresholdAnalysis {
  const entries: ThresholdEntry[] = [];
  let exceededSequenceCount = 0;

  for (const [symbol, rawPoints] of Object.entries(volatilityMap)) {
    const points = rawPoints.slice().sort((left, right) => left.t - right.t);
    let direction = 0;
    let entered = false;
    let exceeded = false;

    const finishSequence = () => {
      if (exceeded) exceededSequenceCount += 1;
      direction = 0;
      entered = false;
      exceeded = false;
    };

    for (const point of points) {
      const pointDirection = Math.sign(point.lvl);
      if (pointDirection === 0) {
        finishSequence();
        continue;
      }
      if (direction !== 0 && pointDirection !== direction) {
        finishSequence();
      }
      if (direction === 0) direction = pointDirection;

      const absoluteLevel = Math.abs(point.lvl);
      if (absoluteLevel > maximumLevel) exceeded = true;
      if (
        !entered &&
        absoluteLevel >= minimumLevel &&
        absoluteLevel <= maximumLevel
      ) {
        entries.push({
          direction: point.lvl > 0 ? "SHORT" : "LONG",
          point,
          symbol,
        });
        entered = true;
      }
    }

    finishSequence();
  }

  entries.sort((left, right) => left.point.t - right.point.t);
  const monthlyEntries: MonthlyEntryCount[] = [];
  const { maxTime, minTime } = getFiniteTimeBounds(volatilityMap);
  if (minTime !== null && maxTime !== null) {
    const firstMonth = monthStartUtc(minTime);
    const lastMonth = monthStartUtc(maxTime);
    const counts = new Map<number, number>();
    for (const entry of entries) {
      const month = monthStartUtc(entry.point.t);
      counts.set(month, (counts.get(month) ?? 0) + 1);
    }
    for (
      let monthStart = firstMonth;
      monthStart <= lastMonth;
      monthStart = nextMonthUtc(monthStart)
    ) {
      monthlyEntries.push({
        count: counts.get(monthStart) ?? 0,
        monthStart,
      });
    }
  }

  const monthlyCounts = monthlyEntries.map((month) => month.count);
  const totalEntries = monthlyCounts.reduce((sum, count) => sum + count, 0);
  let maximumEntriesPerMonth = 0;
  let minimumEntriesPerMonth = 0;
  for (const [index, count] of monthlyCounts.entries()) {
    if (index === 0 || count > maximumEntriesPerMonth) {
      maximumEntriesPerMonth = count;
    }
    if (index === 0 || count < minimumEntriesPerMonth) {
      minimumEntriesPerMonth = count;
    }
  }

  return {
    averageEntriesPerMonth:
      monthlyCounts.length > 0 ? totalEntries / monthlyCounts.length : 0,
    entries,
    exceededSequenceCount,
    maximumEntriesPerMonth,
    minimumEntriesPerMonth,
    monthlyEntries,
  };
}

/** Computes threshold entries and total vPoint frequency per calendar month. */
export function calculateCoinMonthlyMetrics({
  maximumLevel,
  minimumLevel,
  points,
  symbol,
}: {
  maximumLevel: number;
  minimumLevel: number;
  points: VolatilityPoint[];
  symbol: string;
}): CoinMonthlyMetrics {
  if (points.length === 0) {
    return {
      entrySequenceCount: null,
      entrySignalsPerMonth: null,
      holdDurationAvgMs: null,
      holdDurationMaxMs: null,
      holdDurationMinMs: null,
      vPointsPerMonth: null,
    };
  }
  const analysis = analyzeThresholdEntries({
    maximumLevel,
    minimumLevel,
    volatilityMap: { [symbol]: points },
  });
  const { maxTime } = getFiniteTimeBounds({ [symbol]: points });
  const periodEnd = maxTime ?? 0;
  const lockIntervals = coinCapitalEfficiency.buildLockIntervals({
    maximumLevel,
    minimumLevel,
    periodEnd,
    points,
    symbol,
  });
  const holdDurations = lockIntervals.map(
    (interval) => interval.end - interval.start,
  );
  const holdDurationTotal = holdDurations.reduce(
    (total, duration) => total + duration,
    0,
  );
  let holdDurationMaxMs: number | null = null;
  let holdDurationMinMs: number | null = null;
  for (const duration of holdDurations) {
    if (holdDurationMaxMs === null || duration > holdDurationMaxMs) {
      holdDurationMaxMs = duration;
    }
    if (holdDurationMinMs === null || duration < holdDurationMinMs) {
      holdDurationMinMs = duration;
    }
  }
  const monthCount = analysis.monthlyEntries.length;

  return {
    entrySequenceCount: lockIntervals.length,
    entrySignalsPerMonth:
      monthCount > 0 ? analysis.entries.length / monthCount : null,
    holdDurationAvgMs:
      holdDurations.length > 0 ? holdDurationTotal / holdDurations.length : null,
    holdDurationMaxMs,
    holdDurationMinMs,
    vPointsPerMonth: monthCount > 0 ? points.length / monthCount : null,
  };
}
