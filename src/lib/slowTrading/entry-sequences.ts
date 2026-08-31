import type { EntryRecommendation } from "@/lib/brain/algorithms/type-execute";
import type { DynamicTradeConfig, VolatilityPoint } from "@/lib/dynamic";
import { TradingMode } from "@/lib/exchange/types";
import { resolveEntryLeverage } from "@/lib/trading/execute/entry-leverage";
import {
  adjustEntryMarginForSlowConfig,
  getSlowWatchReserveRequiredMarginMultiplier,
  roundUsdt,
} from "./watch-reserve";

export interface SlowEntrySequenceCount {
  long: number;
  short: number;
  symbol: string;
  total: number;
}

export interface SlowWorkerNeededPoint {
  t: number;
  v: number;
}

export interface SlowWorkerNeededEstimate {
  metrics: {
    avg: number;
    max: number;
    min: number;
  };
  points: SlowWorkerNeededPoint[];
}

export interface SlowEntrySequenceInterval {
  endTimeMs: number;
  entrySignal: EntryRecommendation;
  label: EntryRecommendation["l"];
  startTimeMs: number;
  symbol: string;
}

export interface SlowSystemCapacitySequence {
  effectiveCapitalUsdt: number;
  endTimeMs: number;
  entryLevel: number;
  entryMarginUsdt: number;
  leverage: number;
  maxProfitUsdt: number;
  maxProfitPct: number;
  startTimeMs: number;
  symbol: string;
  volume24h?: number;
  workerCostUsdt: number;
}

export interface SlowSystemCapacityEstimate {
  capitalPoints: SlowWorkerNeededPoint[];
  metrics: {
    avgWorkers: number;
    maxEffectiveCapitalUsdt: number;
    maxProfitPct: number;
    maxProfitUsdt: number;
    maxWorkers: number;
    minWorkers: number;
    sequenceCount: number;
    totalEntryMarginUsdt: number;
    totalWorkerCostUsdt: number;
  };
  sequences: SlowSystemCapacitySequence[];
  workerPoints: SlowWorkerNeededPoint[];
}

function normalizeSymbol(value: string | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function signalKey(point: Pick<VolatilityPoint, "id" | "lvl" | "t">) {
  const id = String(point.id ?? "").trim();
  return id ? `id:${id}` : `point:${point.t}:${point.lvl}`;
}

/** Crops each coin's vPoints to the selected dashboard time range. */
function cropVolatilityMapToRange({
  endTimeMs,
  startTimeMs,
  volatilityMap,
}: {
  endTimeMs?: number;
  startTimeMs?: number;
  volatilityMap: Record<string, VolatilityPoint[]>;
}) {
  return Object.fromEntries(
    Object.entries(volatilityMap).map(([symbol, points]) => [
      symbol,
      points.filter(
        (point) =>
          (startTimeMs === undefined || point.t >= startTimeMs) &&
          (endTimeMs === undefined || point.t <= endTimeMs),
      ),
    ]),
  );
}

function buildSignalsBySymbol(entrySignals: EntryRecommendation[]) {
  const signalsBySymbol = new Map<
    string,
    Map<string, EntryRecommendation>
  >();

  for (const signal of entrySignals) {
    const symbol = normalizeSymbol(signal.symbol);
    if (!symbol) continue;
    const signals = signalsBySymbol.get(symbol) ?? new Map();
    signals.set(signalKey(signal), signal);
    signalsBySymbol.set(symbol, signals);
  }

  return signalsBySymbol;
}

/**
 * Converts selected-engine entry sequences into active worker intervals.
 */
function collectEntrySequenceIntervals({
  entrySignals,
  fallbackEndTimeMs,
  volatilityMap,
}: {
  entrySignals: EntryRecommendation[];
  fallbackEndTimeMs?: number;
  volatilityMap: Record<string, VolatilityPoint[]>;
}): SlowEntrySequenceInterval[] {
  const signalsBySymbol = buildSignalsBySymbol(entrySignals);
  const intervals: SlowEntrySequenceInterval[] = [];

  for (const [rawSymbol, rawPoints] of Object.entries(volatilityMap)) {
    const symbol = normalizeSymbol(rawSymbol);
    const signals = signalsBySymbol.get(symbol) ?? new Map();
    const points = rawPoints.slice().sort((left, right) => left.t - right.t);
    let direction = 0;
    let sequenceSignal: EntryRecommendation | null = null;

    const finishSequence = (endTimeMs?: number) => {
      if (sequenceSignal) {
        intervals.push({
          endTimeMs: Math.max(
            sequenceSignal.t,
            endTimeMs ?? fallbackEndTimeMs ?? sequenceSignal.t,
          ),
          entrySignal: sequenceSignal,
          label: sequenceSignal.l,
          startTimeMs: sequenceSignal.t,
          symbol,
        });
      }

      direction = 0;
      sequenceSignal = null;
    };

    for (const point of points) {
      const pointDirection = Math.sign(point.lvl);
      if (pointDirection === 0) {
        finishSequence(point.t);
        continue;
      }
      if (direction !== 0 && pointDirection !== direction) {
        finishSequence(point.t);
      }
      if (direction === 0) direction = pointDirection;

      if (!sequenceSignal) {
        sequenceSignal = signals.get(signalKey(point)) ?? null;
      }
    }
    finishSequence(fallbackEndTimeMs ?? points.at(-1)?.t);
  }

  return intervals;
}

/**
 * Counts at most one selected-engine entry per directional vPoint sequence.
 * A level-zero point or defensive sign change releases the sequence.
 */
function countEntrySequences({
  entrySignals,
  volatilityMap,
}: {
  entrySignals: EntryRecommendation[];
  volatilityMap: Record<string, VolatilityPoint[]>;
}): SlowEntrySequenceCount[] {
  const intervals = collectEntrySequenceIntervals({
    entrySignals,
    volatilityMap,
  });
  const resultBySymbol = new Map<string, SlowEntrySequenceCount>();
  const result: SlowEntrySequenceCount[] = [];

  for (const rawSymbol of Object.keys(volatilityMap)) {
    const symbol = normalizeSymbol(rawSymbol);
    const item = { long: 0, short: 0, symbol, total: 0 };
    resultBySymbol.set(symbol, item);
    result.push(item);
  }

  for (const interval of intervals) {
    const item = resultBySymbol.get(interval.symbol);
    if (!item) continue;
    if (interval.label === "B") item.long += 1;
    if (interval.label === "T") item.short += 1;
    item.total = item.long + item.short;
  }

  return result.sort(
    (left, right) => right.total - left.total || left.symbol.localeCompare(right.symbol),
  );
}

function makeEmptyWorkerNeededEstimate(): SlowWorkerNeededEstimate {
  return {
    metrics: { avg: 0, max: 0, min: 0 },
    points: [],
  };
}

function pushWorkerNeededPoint(
  points: SlowWorkerNeededPoint[],
  point: SlowWorkerNeededPoint,
) {
  const last = points.at(-1);
  if (last?.t === point.t) {
    last.v = point.v;
    return;
  }

  points.push(point);
}

function makeEmptySystemCapacityEstimate(): SlowSystemCapacityEstimate {
  return {
    capitalPoints: [],
    metrics: {
      avgWorkers: 0,
      maxEffectiveCapitalUsdt: 0,
      maxProfitPct: 0,
      maxProfitUsdt: 0,
      maxWorkers: 0,
      minWorkers: 0,
      sequenceCount: 0,
      totalEntryMarginUsdt: 0,
      totalWorkerCostUsdt: 0,
    },
    sequences: [],
    workerPoints: [],
  };
}

/**
 * Estimates how many entry workers are needed over time by overlapping the
 * selected-engine entry sequence intervals in the current dashboard range.
 */
function estimateWorkerNeeded({
  endTimeMs,
  entrySignals,
  startTimeMs,
  volatilityMap,
}: {
  endTimeMs?: number;
  entrySignals: EntryRecommendation[];
  startTimeMs?: number;
  volatilityMap: Record<string, VolatilityPoint[]>;
}): SlowWorkerNeededEstimate {
  const allPoints = Object.values(volatilityMap).flat();
  const rangeStart = startTimeMs ?? Math.min(...allPoints.map((point) => point.t));
  const rangeEnd = endTimeMs ?? Math.max(...allPoints.map((point) => point.t));

  if (
    !Number.isFinite(rangeStart) ||
    !Number.isFinite(rangeEnd) ||
    rangeEnd < rangeStart
  ) {
    return makeEmptyWorkerNeededEstimate();
  }

  const eventDeltaByTime = new Map<number, number>();
  const intervals = collectEntrySequenceIntervals({
    entrySignals,
    fallbackEndTimeMs: rangeEnd,
    volatilityMap,
  });

  for (const interval of intervals) {
    const start = Math.max(rangeStart, interval.startTimeMs);
    const end = Math.min(rangeEnd, interval.endTimeMs);
    if (start > rangeEnd || end < rangeStart || end <= start) continue;

    eventDeltaByTime.set(start, (eventDeltaByTime.get(start) ?? 0) + 1);
    eventDeltaByTime.set(end, (eventDeltaByTime.get(end) ?? 0) - 1);
  }

  const eventTimes = Array.from(eventDeltaByTime.keys()).sort((left, right) => left - right);
  const points: SlowWorkerNeededPoint[] = [];
  let activeWorkers = 0;
  let area = 0;
  let max = 0;
  let min = Number.POSITIVE_INFINITY;
  let previousTime = rangeStart;

  pushWorkerNeededPoint(points, { t: rangeStart, v: 0 });

  for (const eventTime of eventTimes) {
    if (eventTime > previousTime) {
      area += activeWorkers * (eventTime - previousTime);
      min = Math.min(min, activeWorkers);
      max = Math.max(max, activeWorkers);
      previousTime = eventTime;
    }

    activeWorkers += eventDeltaByTime.get(eventTime) ?? 0;
    if (eventTime < rangeEnd || rangeStart === rangeEnd) {
      min = Math.min(min, activeWorkers);
      max = Math.max(max, activeWorkers);
    }
    pushWorkerNeededPoint(points, { t: eventTime, v: activeWorkers });
  }

  if (rangeEnd > previousTime) {
    area += activeWorkers * (rangeEnd - previousTime);
    min = Math.min(min, activeWorkers);
    max = Math.max(max, activeWorkers);
  }
  pushWorkerNeededPoint(points, { t: rangeEnd, v: activeWorkers });

  return {
    metrics: {
      avg: rangeEnd > rangeStart ? area / (rangeEnd - rangeStart) : max,
      max,
      min: Number.isFinite(min) ? min : 0,
    },
    points,
  };
}

function getVolume24hForSymbol(
  volume24hBySymbol: Record<string, number> | undefined,
  symbol: string,
) {
  const volume = volume24hBySymbol?.[normalizeSymbol(symbol)];
  return typeof volume === "number" && Number.isFinite(volume) && volume > 0
    ? volume
    : undefined;
}

function getVolumeBudgetUsdt(params: {
  config: DynamicTradeConfig;
  volume24h?: number;
}) {
  const pct = params.config.maxEntryBased24HourVolPct ?? 0.2;
  if (
    Number.isFinite(pct) &&
    pct > 0 &&
    Number.isFinite(params.volume24h) &&
    params.volume24h !== undefined &&
    params.volume24h > 0
  ) {
    return roundUsdt(params.volume24h * (pct / 100));
  }

  const maxEntryMargin = params.config.maxEntryMargin ?? 0;
  return Number.isFinite(maxEntryMargin) && maxEntryMargin > 0
    ? roundUsdt(maxEntryMargin)
    : 0;
}

function isIntervalEligibleForTradingMode({
  config,
  interval,
}: {
  config: DynamicTradeConfig;
  interval: SlowEntrySequenceInterval;
}) {
  return !(config.tradingMode === TradingMode.SPOT && interval.label === "T");
}

function buildCapitalEventSeries({
  endTimeMs,
  intervals,
  startTimeMs,
  valueKey,
}: {
  endTimeMs: number;
  intervals: SlowSystemCapacitySequence[];
  startTimeMs: number;
  valueKey: "effectiveCapitalUsdt" | "workerCostUsdt";
}): SlowWorkerNeededPoint[] {
  const eventDeltaByTime = new Map<number, number>();

  for (const interval of intervals) {
    const start = Math.max(startTimeMs, interval.startTimeMs);
    const end = Math.min(endTimeMs, interval.endTimeMs);
    if (start > endTimeMs || end < startTimeMs || end <= start) continue;

    const value = interval[valueKey];
    eventDeltaByTime.set(start, (eventDeltaByTime.get(start) ?? 0) + value);
    eventDeltaByTime.set(end, (eventDeltaByTime.get(end) ?? 0) - value);
  }

  const eventTimes = Array.from(eventDeltaByTime.keys()).sort(
    (left, right) => left - right,
  );
  const points: SlowWorkerNeededPoint[] = [];
  let activeValue = 0;
  pushWorkerNeededPoint(points, { t: startTimeMs, v: 0 });

  for (const eventTime of eventTimes) {
    activeValue = roundUsdt(activeValue + (eventDeltaByTime.get(eventTime) ?? 0));
    pushWorkerNeededPoint(points, { t: eventTime, v: activeValue });
  }

  pushWorkerNeededPoint(points, { t: endTimeMs, v: activeValue });

  return points;
}

/**
 * Estimates maximum effective capital needed to capture all active vPoint
 * entry sequences in the visible range with the current SLOW entry settings.
 */
function estimateSystemMaximalCapacity({
  config,
  endTimeMs,
  entrySignals,
  startTimeMs,
  volatilityMap,
  volume24hBySymbol,
}: {
  config: DynamicTradeConfig;
  endTimeMs?: number;
  entrySignals: EntryRecommendation[];
  startTimeMs?: number;
  volatilityMap: Record<string, VolatilityPoint[]>;
  volume24hBySymbol?: Record<string, number>;
}): SlowSystemCapacityEstimate {
  const allPoints = Object.values(volatilityMap).flat();
  const rangeStart = startTimeMs ?? Math.min(...allPoints.map((point) => point.t));
  const rangeEnd = endTimeMs ?? Math.max(...allPoints.map((point) => point.t));

  if (
    !Number.isFinite(rangeStart) ||
    !Number.isFinite(rangeEnd) ||
    rangeEnd < rangeStart
  ) {
    return makeEmptySystemCapacityEstimate();
  }

  const workerNeeded = estimateWorkerNeeded({
    endTimeMs: rangeEnd,
    entrySignals,
    startTimeMs: rangeStart,
    volatilityMap,
  });
  const watchEnabled = config.enableWatchLogic !== false;
  const reserveLevels = watchEnabled ? config.watchReserveLevels ?? 2 : 0;
  const pctAlloc = config.watchReservePctAlloc ?? 2;
  const hasReserve =
    watchEnabled && reserveLevels > 0 && Number.isFinite(pctAlloc) && pctAlloc > 0;
  const requiredMultiplier = hasReserve
    ? getSlowWatchReserveRequiredMarginMultiplier({
        reserveLevels,
        pctAlloc,
      })
    : 1;
  const takeProfitPct = config.modelConfig?.takeProfitPercent ?? 0;
  const intervals = collectEntrySequenceIntervals({
    entrySignals,
    fallbackEndTimeMs: rangeEnd,
    volatilityMap,
  });
  const sequences: SlowSystemCapacitySequence[] = [];

  for (const interval of intervals) {
    if (!isIntervalEligibleForTradingMode({ config, interval })) continue;

    const volume24h = getVolume24hForSymbol(volume24hBySymbol, interval.symbol);
    const volumeBudgetUsdt = getVolumeBudgetUsdt({ config, volume24h });
    if (volumeBudgetUsdt <= 0) continue;

    const entryMarginUsdt = adjustEntryMarginForSlowConfig({
      desiredMarginUsdt: volumeBudgetUsdt,
      spendableUsdt: volumeBudgetUsdt,
      enableWatchLogic: watchEnabled,
      reserveLevels,
      pctAlloc,
      maxEntryBased24HourVolPct: config.maxEntryBased24HourVolPct ?? 0.2,
      volume24h,
      maxEntryMarginPct: config.maxEntryMarginPct ?? 0,
      maxEntryMargin: config.maxEntryMargin ?? 0,
    });
    if (entryMarginUsdt <= 0) continue;

    const leverage = resolveEntryLeverage({
      config,
      tradingMode: config.tradingMode,
      entrySignal: {
        ...interval.entrySignal,
        maxLeverage: Number.MAX_SAFE_INTEGER,
      },
    });
    const workerCostUsdt = roundUsdt(entryMarginUsdt * requiredMultiplier);
    const effectiveCapitalUsdt = roundUsdt(
      entryMarginUsdt * (requiredMultiplier + (hasReserve ? 1 : 0)),
    );
    const maxProfitPct =
      Number.isFinite(takeProfitPct) && takeProfitPct > 0
        ? takeProfitPct * leverage
        : 0;
    const maxProfitUsdt = roundUsdt(entryMarginUsdt * (maxProfitPct / 100));

    sequences.push({
      effectiveCapitalUsdt,
      endTimeMs: interval.endTimeMs,
      entryLevel: interval.entrySignal.lvl ?? 0,
      entryMarginUsdt,
      leverage,
      maxProfitPct,
      maxProfitUsdt,
      startTimeMs: interval.startTimeMs,
      symbol: interval.symbol,
      volume24h,
      workerCostUsdt,
    });
  }

  const capitalPoints = buildCapitalEventSeries({
    endTimeMs: rangeEnd,
    intervals: sequences,
    startTimeMs: rangeStart,
    valueKey: "effectiveCapitalUsdt",
  });
  const maxEffectiveCapitalUsdt = Math.max(
    0,
    ...capitalPoints.map((point) => point.v),
  );
  const maxProfitUsdt = roundUsdt(
    sequences.reduce((total, sequence) => total + sequence.maxProfitUsdt, 0),
  );

  return {
    capitalPoints,
    metrics: {
      avgWorkers: workerNeeded.metrics.avg,
      maxEffectiveCapitalUsdt,
      maxProfitPct:
        maxEffectiveCapitalUsdt > 0
          ? roundUsdt((maxProfitUsdt / maxEffectiveCapitalUsdt) * 100)
          : 0,
      maxProfitUsdt,
      maxWorkers: workerNeeded.metrics.max,
      minWorkers: workerNeeded.metrics.min,
      sequenceCount: sequences.length,
      totalEntryMarginUsdt: roundUsdt(
        sequences.reduce((total, sequence) => total + sequence.entryMarginUsdt, 0),
      ),
      totalWorkerCostUsdt: roundUsdt(
        sequences.reduce((total, sequence) => total + sequence.workerCostUsdt, 0),
      ),
    },
    sequences,
    workerPoints: workerNeeded.points,
  };
}

const slowEntrySequences = {
  count: countEntrySequences,
  intervals: {
    collect: collectEntrySequenceIntervals,
  },
  systemCapacity: {
    estimate: estimateSystemMaximalCapacity,
  },
  workerNeeded: {
    estimate: estimateWorkerNeeded,
  },
  range: {
    crop: cropVolatilityMapToRange,
  },
};

export default slowEntrySequences;
