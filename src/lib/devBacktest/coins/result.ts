import type { VolatilityPoint } from "@/lib/dynamic";
import { computeMeanWaitingTimes } from "@/lib/dynamic/utils/volatility/mean";
import type { CoinFinderRange, CoinFinderResult } from "./types";
import coinVPointHealth from "./health";

const VPOINT_CLOSE_DISTANCE_MS = 20 * 60 * 1000;

/** Computes the table metrics for one symbol's cached volatility points. */
export function summarizeCoinVolatility({
  cached,
  marketCapUSD,
  points,
  range,
  symbol,
}: {
  cached: boolean;
  marketCapUSD: number | null;
  points: VolatilityPoint[];
  range: CoinFinderRange;
  symbol: string;
}): CoinFinderResult {
  let maxTop: number | null = null;
  let maxTopT: number | null = null;
  let maxBottom: number | null = null;
  let maxBottomT: number | null = null;
  let vPointPctCount = 0;
  let vPointPctMax: number | null = null;
  let vPointPctMaxT: number | null = null;
  let vPointPctMin: number | null = null;
  let vPointPctTotal = 0;
  for (const point of points) {
    if (Number.isFinite(point.lvl)) {
      if (point.l === "T" && (maxTop === null || point.lvl > maxTop)) {
        // BTEST:COIN_FINDER_LEVEL_EXTREME_DATE
        maxTop = point.lvl;
        maxTopT = Number.isFinite(point.t) && point.t > 0 ? point.t : null;
      }
      if (point.l === "B" && (maxBottom === null || point.lvl < maxBottom)) {
        // BTEST:COIN_FINDER_LEVEL_EXTREME_DATE
        maxBottom = point.lvl;
        maxBottomT = Number.isFinite(point.t) && point.t > 0 ? point.t : null;
      }
    }
    if (Number.isFinite(point.pct)) {
      vPointPctCount += 1;
      vPointPctTotal += point.pct;
      if (vPointPctMax === null || point.pct > vPointPctMax) {
        // BTEST:COIN_FINDER_MAX_VPOINT_PCT_DATE
        vPointPctMax = point.pct;
        vPointPctMaxT =
          Number.isFinite(point.t) && point.t > 0 ? point.t : null;
      }
      if (vPointPctMin === null || point.pct < vPointPctMin) {
        vPointPctMin = point.pct;
      }
    }
  }
  const times = points
    .map((point) => point.t)
    .filter((time) => Number.isFinite(time) && time > 0)
    .sort((left, right) => left - right);
  let transitionCount = 0;
  let transitionTotal = 0;
  let transitionMaxMs: number | null = null;
  let transitionMinMs: number | null = null;
  let vPointCloseDistanceOccurrences = 0;
  for (let index = 1; index < times.length; index += 1) {
    const duration = times[index] - times[index - 1];
    transitionCount += 1;
    transitionTotal += duration;
    if (duration < VPOINT_CLOSE_DISTANCE_MS) {
      vPointCloseDistanceOccurrences += 1;
    }
    if (transitionMaxMs === null || duration > transitionMaxMs) {
      transitionMaxMs = duration;
    }
    if (transitionMinMs === null || duration < transitionMinMs) {
      transitionMinMs = duration;
    }
  }

  const health = coinVPointHealth.calculate(points);
  const waitingTimes = computeMeanWaitingTimes(points);
  const levelFrequency = points.reduce<Record<string, number>>(
    (frequency, point) => {
      if (!Number.isFinite(point.lvl)) return frequency;
      const key = String(point.lvl);
      frequency[key] = (frequency[key] ?? 0) + 1;
      return frequency;
    },
    {},
  );

  return {
    avgBottomToTopMs: waitingTimes.bottomToTop.meanMs,
    avgTopToBottomMs: waitingTimes.topToBottom.meanMs,
    cached,
    correlationScore: null,
    correlations: {},
    entrySequenceCount: null,
    entrySignalsPerMonth: null,
    firstSeen: times[0] ?? null,
    healthReasons: health.reasons,
    healthScore: health.score,
    holdDurationAvgMs: null,
    holdDurationMaxMs: null,
    holdDurationMinMs: null,
    maxBottom,
    maxBottomT,
    maxBottomToTopMs: waitingTimes.bottomToTop.maxMs,
    maxLevelAbsolute:
      maxTop === null && maxBottom === null
        ? null
        : Math.max(maxTop ?? 0, Math.abs(maxBottom ?? 0)),
    maxTop,
    maxTopT,
    maxTopToBottomMs: waitingTimes.topToBottom.maxMs,
    marketCapUSD,
    levelFrequency,
    pointCount: points.length,
    vPointCloseDistanceOccurrences,
    vPointPctAvg:
      vPointPctCount > 0 ? vPointPctTotal / vPointPctCount : null,
    vPointPctMax,
    vPointPctMaxT,
    vPointPctMin,
    vPointsPerMonth: null,
    vPointTransitionAvgMs:
      transitionCount > 0 ? transitionTotal / transitionCount : null,
    vPointTransitionMaxMs: transitionMaxMs,
    vPointTransitionMinMs: transitionMinMs,
    range,
    symbol,
  };
}
