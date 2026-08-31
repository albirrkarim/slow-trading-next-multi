import type { GrowthOvertimeDetail } from "../../../dynamic/backtest-volatility/type";

/**
 * Result metrics for held capital & turnover for a series.
 */
export interface HeldCapitalMetrics {
  /**
   * Time-weighted held ratio (fraction 0..1).
   * - Represents the fraction of tradable portfolio that is held as base asset,
   *   averaged over time where each sample is weighted by its duration.
   * - 0 = never holding base asset; 1 = always fully held as base asset.
   */
  hrTimeWeighted: number;

  /**
   * Turnover normalized per day (fraction/day).
   * - How much absolute base-asset value changes per day relative to average tradable asset.
   * - Example: 0.5 means ~50% of portfolio value moves per day (on average).
   * - Range: [0, +inf). Typically small numbers like 0..2.
   */
  turnoverPerDay: number;

  /**
   * Held-ratio score (0..1).
   * - Inverted HR for "goodness": hrScore = 1 - hrTimeWeighted (clamped 0..1).
   * - Higher is better: 1 = ideal (very little held capital), 0 = all capital stuck.
   */
  hrScore: number;

  /**
   * Turnover score (0..1).
   * - Normalized against a `turnoverCap` parameter such that:
   *   trScore = clamp(turnoverPerDay / turnoverCap, 0, 1).
   * - Higher is better (faster turnover) up to the cap.
   */
  trScore: number;

  /**
   * Combined weighted score (0..1).
   * - Weighted average of hrScore and trScore with user-provided weights.
   * - Higher = better (less stuck capital, more healthy turnover).
   */
  score: number;

  /**
   * Meta information for diagnostics.
   */
  meta: {
    /**
     * Total time covered by the series in milliseconds (end - start).
     */
    totalTimeMs: number;

    /**
     * Average tradable asset used as denominator (USDT).
     * - tradable = currentAsset (balance + baseAsset)
     */
    avgTradableAsset: number;

    /**
     * Number of samples used to compute the metric.
     */
    samples: number;
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EPS = 1e-9;

function clamp01(v: number): number {
  if (!isFinite(v) || Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * Computes capital efficiency metrics for a trading strategy.
 *
 * This function measures:
 * 1. **Held Ratio (HR)**: Time-weighted fraction of capital stuck in positions (lower is better)
 * 2. **Turnover**: How quickly capital moves in/out of positions (higher is better)
 * 3. **Combined Score**: Weighted metric balancing HR and turnover (0-1, higher is better)
 *
 * Good strategies have:
 * - Low held ratio (capital not stuck too long)
 * - Moderate-to-high turnover (capital actively deployed)
 *
 * Uses total currentBaseAsset (locked in trades) relative to currentAsset (balance + positions).
 * Ignores currentSafeHaven entirely for this metric.
 *
 * @param {GrowthOvertimeDetail[]} series - Portfolio growth history over time (will be sorted by timeMs).
 * @param {Object} [opts] - Optional configuration.
 * @param {Object} [opts.weights] - Score weights { hr: 0.5, tr: 0.5 } default.
 * @param {number} [opts.turnoverCap=1.0] - Turnover normalization cap (fraction/day, default 1.0 = 100%/day).
 * @returns {HeldCapitalMetrics} Object containing HR, turnover, scores, and metadata.
 *
 * @example
 * const metrics = computeOverallCapitalEfficiency(growthData, {
 *   weights: { hr: 0.6, tr: 0.4 },
 *   turnoverCap: 0.5
 * });
 * console.log(`Capital Efficiency Score: ${(metrics.score * 100).toFixed(1)}%`);
 * console.log(`Avg Held Ratio: ${(metrics.hrTimeWeighted * 100).toFixed(1)}%`);
 * console.log(`Turnover/Day: ${metrics.turnoverPerDay.toFixed(3)}`);
 */
export function computeOverallCapitalEfficiency(
  series: GrowthOvertimeDetail[],
  opts?: {
    weights?: { hr?: number; tr?: number };
    turnoverCap?: number;
  }
): HeldCapitalMetrics {
  const weights = { hr: 0.5, tr: 0.5, ...(opts?.weights ?? {}) };
  const turnoverCap = opts?.turnoverCap ?? 1.0;

  if (!series || series.length === 0) {
    return {
      hrTimeWeighted: 0,
      turnoverPerDay: 0,
      hrScore: 1,
      trScore: 0,
      score: weights.hr * 1 + weights.tr * 0,
      meta: { totalTimeMs: 0, avgTradableAsset: 0, samples: 0 },
    };
  }

  // Sort chronologically
  const s = [...series].sort((a, b) => a.timeMs - b.timeMs);
  const n = s.length;
  const tStart = s[0].timeMs;
  const tEnd = s[n - 1].timeMs;
  const totalTime = Math.max(1, tEnd - tStart);

  let accumRatioTime = 0; // sum of (held ratio * dt)
  let accumAbsDeltaBase = 0; // sum of |delta base|
  let tradableAssetSum = 0;

  for (let i = 0; i < n; i++) {
    const cur = s[i];
    const next = s[i + 1];

    // tradable = all active trading capital (balance + positions)
    const tradableAsset = Math.max(EPS, cur.currentAsset ?? 0);
    tradableAssetSum += tradableAsset;

    // fraction of that capital currently locked in positions
    const curBase = Math.max(0, cur.currentBaseAsset ?? 0);
    const ratio = Math.min(1, curBase / tradableAsset);

    // duration to next sample
    const dt = i < n - 1 ? Math.max(1, next.timeMs - cur.timeMs) : 0;
    if (dt > 0) accumRatioTime += ratio * dt;

    // accumulate absolute base-asset changes for turnover calculation
    if (i < n - 1) {
      const nextBase = Math.max(0, next.currentBaseAsset ?? 0);
      accumAbsDeltaBase += Math.abs(nextBase - curBase);
    }
  }

  const avgTradableAsset = Math.max(EPS, tradableAssetSum / n);
  const hrTimeWeighted = accumRatioTime / totalTime;
  const turnoverPerDay =
    ((accumAbsDeltaBase / totalTime) * MS_PER_DAY) / avgTradableAsset;

  const hrScore = clamp01(1 - hrTimeWeighted);
  const trScore = clamp01(turnoverPerDay / Math.max(EPS, turnoverCap));
  const combined = clamp01(hrScore * weights.hr + trScore * weights.tr);

  return {
    hrTimeWeighted,
    turnoverPerDay,
    hrScore,
    trScore,
    score: combined,
    meta: { totalTimeMs: totalTime, avgTradableAsset, samples: n },
  };
}
