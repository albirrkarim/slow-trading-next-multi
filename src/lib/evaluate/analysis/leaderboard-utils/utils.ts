import moment from "moment-timezone";
import type { GrowthOvertimeDetail } from "../../../dynamic/backtest-volatility/type";
import { MINIMAL_USDT_TO_TRADE } from "@/lib/trading/constants";
import type { TimeInfo } from "./type-dynamic-report";
import { tradeLog } from "@/lib/trading/helper/log";

/**
 * Calculates both the average and maximum portfolio drawdown
 * 
 * drawdown = (currentAsset - currentAssetFloating) / currentAsset;
 *
 * @returns { avg: number; max: number }
 */
export function getMaxPortofolioDrawdown(data: GrowthOvertimeDetail[]): {
  avg: number;
  max: number;
} {
  if (!data.length) return { avg: 0, max: 0 };

  let maxDrawdown = 0;
  let totalDrawdown = 0;
  let count = 0;

  for (const point of data) {
    const { currentAsset, currentAssetFloating, timeMsHuman } = point;

    const drawdown = (currentAsset - currentAssetFloating) / currentAsset;

    totalDrawdown += drawdown;
    count++;

    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      tradeLog.log({ currentAsset, currentAssetFloating });
      tradeLog.log(`Max asset dd ${drawdown.toFixed(2)} `, timeMsHuman);
      tradeLog.log("\n\n");
    }
  }

  const avgDrawdown = count > 0 ? totalDrawdown / count : 0;

  return { avg: avgDrawdown, max: maxDrawdown };
}

/**
 * Calculates both the average and maximum asset drawdown of open positions
 *
 * drawdown = (openBase - openBaseFloating) / openBase;
 *
 * @returns { avg: number; max: number }
 */
export function getMaxFloatingDrawdown(data: GrowthOvertimeDetail[]): {
  avg: number;
  max: number;
} {
  if (!data.length) return { avg: 0, max: 0 };

  let maxDrawdown = 0;
  let totalDrawdown = 0;
  let count = 0;

  for (const point of data) {
    const { currentAsset, currentAssetFloating, currentBalance, timeMsHuman } =
      point;

    const openBase = currentAsset - currentBalance;

    if (openBase <= 0) continue;

    const openBaseFloating = currentAssetFloating - currentBalance;

    const drawdown = (openBase - openBaseFloating) / openBase;

    totalDrawdown += drawdown;
    count++;

    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      tradeLog.log({ openBase, openBaseFloating });
      tradeLog.log(`Max dd ${drawdown.toFixed(2)} `, timeMsHuman);
      tradeLog.log("\n\n");
    }
  }

  const avgDrawdown = count > 0 ? totalDrawdown / count : 0;

  return { avg: avgDrawdown, max: maxDrawdown };
}

/**
 * Calculates how long the account stays at zero balance.
 * Returns durations (ms): min, avg, max
 */
export function getEmptyBalanceStats(
  growthOvertime: GrowthOvertimeDetail[]
): TimeInfo {
  if (!growthOvertime.length) {
    return { min: 0, avg: 0, max: 0 };
  }

  const emptyDurations: number[] = [];
  let emptyStart: number | null = null;

  for (let i = 0; i < growthOvertime.length; i++) {
    const { timeMs, currentBalance } = growthOvertime[i];
    const nextTime = growthOvertime[i + 1]?.timeMs ?? timeMs;

    if (currentBalance <= MINIMAL_USDT_TO_TRADE && emptyStart === null) {
      // start of empty period
      emptyStart = timeMs;
    }

    if (currentBalance > MINIMAL_USDT_TO_TRADE && emptyStart !== null) {
      // end of empty period
      emptyDurations.push(timeMs - emptyStart);
      emptyStart = null;
    }

    // if it ends still empty
    if (i === growthOvertime.length - 1 && emptyStart !== null) {
      emptyDurations.push(nextTime - emptyStart);
    }
  }

  if (!emptyDurations.length) {
    return { min: 0, avg: 0, max: 0 };
  }

  const min = Math.min(...emptyDurations);
  const max = Math.max(...emptyDurations);
  const avg = emptyDurations.reduce((a, b) => a + b, 0) / emptyDurations.length;

  return {
    min,
    minHuman: moment.duration(min, "milliseconds").humanize(),
    avg,
    avgHuman: moment.duration(avg, "milliseconds").humanize(),
    max,
    maxHuman: moment.duration(max, "milliseconds").humanize(),
  };
}

// export function calculateEqualityScore(
//   tradeCounts: Record<string, number>
// ): number {
//   const values = Object.values(tradeCounts);
//   if (values.length === 0) return 1;

//   const mean = values.reduce((a, b) => a + b, 0) / values.length;
//   if (mean === 0) return 1;

//   const variance =
//     values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
//   const stdDev = Math.sqrt(variance);

//   const cv = stdDev / mean;
//   const score = 1 - cv;

//   // Clamp between 0–1
//   return Math.max(0, Math.min(1, score));
// }

/**
 * Calculates an "equality score" (0–1) describing how evenly distributed
 * numeric values are within an object.
 *
 * The function measures variation using the Coefficient of Variation (CV),
 * which is the ratio of the standard deviation to the mean.
 *
 * Instead of `1 - cv` (which can collapse to 0 when cv > 1),
 * this version applies an exponential decay function `exp(-cv)` to produce
 * a smooth score that never hard-clamps to zero but still penalizes inequality.
 *
 * Interpretation:
 * - 1.0 → perfectly equal distribution (all values identical)
 * - ~0.5 → moderately unbalanced
 * - <0.2 → very unbalanced distribution
 *
 * @example
 * ```js
 * const trades = {
 *   AAVE: 26,
 *   ADA: 22,
 *   ETH: 24,
 *   HBAR: 151,
 *   LINK: 10,
 *   SOL: 20,
 *   SUI: 184,
 *   XLM: 10,
 *   XRP: 26
 * };
 *
 * const score = calculateEqualityScore(trades);
 * console.log(score); // ≈ 0.31 (uneven distribution)
 * ```
 *
 * @param {Record<string, number>} tradeCounts - A map of item identifiers to numeric values (e.g., trade counts)
 * @returns {number} A normalized equality score between 0 and 1
 */
export function calculateEqualityScore(
  tradeCounts: Record<string, number>
): number {
  const values = Object.values(tradeCounts);
  if (values.length === 0) return 1;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 1;

  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  const cv = stdDev / mean;

  // Smooth exponential curve (never hard zero)
  const score = Math.exp(-cv);

  // Clamp to [0, 1] just for safety
  return Math.max(0, Math.min(1, score));
}
