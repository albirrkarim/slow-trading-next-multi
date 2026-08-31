import { timeMsToReadable } from "@/lib/datasets/utils";
import { type Kline } from "@/lib/exchange/platform/tokocrypto";
import type { GrowthOvertimeDetail } from "../../../dynamic/backtest-volatility/type";

export interface BearRange {
  start: number; // timestamp (ms)
  startHuman: string;
  end: number; // timestamp (ms)
  endHuman: string;
  peakPrice: number;
  troughPrice: number;
  drawdownPct: number;
}

interface DetectBearOptions {
  threshold?: number; // drawdown threshold (default: 0.2 = 20%)
  minDurationMs?: number; // optional minimum duration for a valid bear
}

/**
 * Detects bear market periods from historical candlestick (kline) data.
 *
 * A bear market is identified when the price drops by a specified threshold percentage
 * (default 20%) from a local peak and remains below until recovery.
 *
 * Algorithm:
 * 1. Track running peak price
 * 2. Detect drawdown >= threshold from peak
 * 3. Find trough (lowest point) during drawdown
 * 4. End bear period when price recovers above original peak
 *
 * @param {Kline[]} klines - Array of candlestick data [time, open, high, low, close, volume, ...].
 * @param {DetectBearOptions} [options={}] - Configuration options.
 * @param {number} [options.threshold=0.2] - Drawdown threshold (0.2 = 20%).
 * @param {number} [options.minDurationMs=0] - Minimum duration for valid bear market (ms).
 * @returns {BearRange[]} Array of detected bear market periods with timestamps and metrics.
 *
 * @example
 * const klines = await fetchKlines({ symbol: "BTC_USDT", interval: "1d" });
 * const bears = detectBearMarkets(klines, { threshold: 0.25, minDurationMs: 7 * 24 * 60 * 60 * 1000 });
 * console.log(`Found ${bears.length} bear markets`);
 * bears.forEach(b => {
 *   console.log(`${b.startHuman} to ${b.endHuman}: -${(b.drawdownPct * 100).toFixed(1)}%`);
 * });
 */
export function detectBearMarkets(
  klines: Kline[],
  options: DetectBearOptions = {}
): BearRange[] {
  const { threshold = 0.2, minDurationMs = 0 } = options;

  if (!klines || klines.length === 0) return [];

  const closes = klines.map((k) => parseFloat(k[4]));
  const times = klines.map((k) => k[0]);

  const bears: BearRange[] = [];
  let peakIdx = 0;

  for (let i = 1; i < closes.length; i++) {
    // New high → reset peak
    if (closes[i] > closes[peakIdx]) {
      peakIdx = i;
    } else {
      const drawdown = (closes[peakIdx] - closes[i]) / closes[peakIdx];
      if (drawdown >= threshold) {
        const start = times[peakIdx];
        const peakPrice = closes[peakIdx];

        // Find trough
        let troughIdx = i;
        for (let j = i + 1; j < closes.length; j++) {
          if (closes[j] < closes[troughIdx]) {
            troughIdx = j;
          } else if (closes[j] > closes[peakIdx]) {
            // recovery above prior peak
            break;
          }
        }

        const end = times[troughIdx];
        const troughPrice = closes[troughIdx];
        const drawdownPct = (peakPrice - troughPrice) / peakPrice;
        const duration = end - start;

        if (duration >= minDurationMs) {
          bears.push({
            start,
            startHuman: timeMsToReadable(start),
            end,
            endHuman: timeMsToReadable(end),
            peakPrice,
            troughPrice,
            drawdownPct,
          });
        }

        // skip ahead
        i = troughIdx;
        peakIdx = i + 1;
      }
    }
  }

  return bears;
}

/**
 * Calculates the bearMarketProofRatio.
 * Higher ratio → better performance in bear markets.
 *
 * For each bear range we compute:
 *   avgAsset = mean(currentAsset) over the range
 *   avgFloating = mean(currentAssetFloating) over the range
 *   drawdown = (avgAsset - avgFloating) / avgAsset
 *
 * Final result = mean(drawdown across bear ranges)
 */
/**
 * Calculates a bear market resilience ratio for a trading strategy.
 *
 * This metric measures how well a strategy maintains capital during bear markets.
 * It compares the average portfolio value during bear periods vs non-bear periods.
 *
 * Formula:
 *   ratio = avgBalanceDuringBear / avgBalanceOutsideBear
 *
 * - Ratio = 1.0: Strategy maintains same value during bears (perfect resilience)
 * - Ratio > 1.0: Strategy actually gains during bears (exceptional)
 * - Ratio < 1.0: Strategy loses value during bears (typical)
 * - Ratio = 0: No data or undefined
 *
 * @param {GrowthOvertimeDetail[]} growthOvertime - Portfolio growth data over time.
 * @param {BearRange[]} bears - Array of detected bear market periods.
 * @returns {number} Bear-proof ratio (0 = undefined, 1 = resilient, <1 = vulnerable, >1 = exceptional).
 *
 * @example
 * const growthData = backtestResult.growthOvertime;
 * const bears = detectBearMarkets(klines);
 * const ratio = getBearMarketProofRatio(growthData, bears);
 * console.log(`Bear resilience: ${(ratio * 100).toFixed(1)}%`);
 * // "Bear resilience: 85.3%" means strategy kept 85.3% of non-bear performance
 */
export function getBearMarketProofRatio(
  growthOvertime: GrowthOvertimeDetail[],
  bearRanges: BearRange[]
): number {
  if (!growthOvertime.length || !bearRanges.length) return 0;

  let totalDrawdown = 0;
  let rangesCounted = 0;

  for (const { start, end } of bearRanges) {
    // find records inside this bear range
    const records = growthOvertime.filter(
      (e) => e.timeMs >= start && e.timeMs <= end
    );

    if (!records.length) continue;

    // compute averages
    let sumAsset = 0;
    let sumFloating = 0;
    for (const r of records) {
      sumAsset += r.currentAsset ?? 0;
      sumFloating += r.currentAssetFloating ?? 0;
    }
    const avgAsset = sumAsset / records.length;
    const avgFloating = sumFloating / records.length;

    if (avgAsset <= 0) continue; // skip invalid ranges

    const drawdown = (avgAsset - avgFloating) / avgAsset;
    totalDrawdown += drawdown;
    rangesCounted++;
  }

  return rangesCounted > 0 ? (1 - totalDrawdown / rangesCounted) * 100 : 0;
}
