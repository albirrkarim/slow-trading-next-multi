import { cropVolatility } from "@/lib/dynamic";
import { windowsMs } from "@/lib/dynamic/utils/nn/data/features/constants";
import type { VolatilityPoint } from "@/lib/dynamic/utils/volatility";

export interface LevelThreshold {
  /**
   * The maximum level value labeled as 'TOP'.
   */
  maxTop: number;

  /**
   * All level top values summed and divided by count (Average of 'TOP' levels)
   */
  meanTop: number;

  /**
   * The midpoint between meanTop and meanBottom (meanTop + meanBottom / 2)
   */
  mean: number;

  /**
   * All level bottom values summed and divided by count (Average of 'BOTTOM' levels)
   */
  meanBottom: number;

  /**
   * The minimum level value labeled as 'BOTTOM'.
   */
  minBottom: number;
}

/**
 * Calculates snapshot level threshold statistics from a cropped volatility map.
 * This function processes the last volatility point for each symbol to determine
 * current market level thresholds (tops and bottoms).
 *
 * Created: 12 December 2025
 *
 * @param cropedVMap - A map of symbol to volatility points, typically cropped to a specific time range.
 * @returns A LevelThreshold object containing statistics about the current volatility levels.
 */
export function levelThresholdFeature(
  cropedVMap: Record<string, VolatilityPoint[]>
): LevelThreshold {
  const tops: number[] = [];
  const bottoms: number[] = [];

  for (const symbol in cropedVMap) {
    const last = cropedVMap[symbol].at(-1);

    if (last) {
      if (last.l == "T") {
        tops.push(last.lvl);
      } else {
        bottoms.push(last.lvl);
      }
    }
  }

  const maxTop = tops.length > 0 ? Math.max(...tops) : 0;
  const minBottom = bottoms.length > 0 ? Math.min(...bottoms) : 0;

  const meanTop =
    tops.length > 0 ? tops.reduce((a, b) => a + b, 0) / tops.length : 0;

  const meanBottom =
    bottoms.length > 0
      ? bottoms.reduce((a, b) => a + b, 0) / bottoms.length
      : 0;

  const mean = (meanTop + meanBottom) / 2;

  return {
    maxTop,
    meanTop,
    mean,
    meanBottom,
    minBottom,
  };
}

/**
 * Calculates the mean level threshold features over time.
 * This function iterates through unique timestamps in the volatility map,
 * computes level thresholds for historical windows (10-day for means, 1-day for extremes),
 * and aggregates them to provide a smoothed or averaged view of market level thresholds.
 *
 * @param croppedVMap - A map of symbol to volatility points.
 * @returns A LevelThreshold object containing aggregated statistics over the analyzed time period.
 */
export function meanLevelThresholdFeature(
  croppedVMap: Record<string, VolatilityPoint[]>
): LevelThreshold {
  const times = [
    ...new Set(
      Object.values(croppedVMap) // get arrays for each key
        .flat() // flatten them
        .map((item) => item.t) // extract `time`
    ),
  ].sort((a, b) => a - b);

  const maxTop: number[] = [];
  const meanTop: number[] = [];
  const mean: number[] = [];
  const meanBottom: number[] = [];
  const minBottom: number[] = [];

  for (const currentTimeMs of times) {
    // A. to produce the mean top and mean bottom we use close to now - 10 days
    const cutOffLong = currentTimeMs - windowsMs["1d"] * 10;
    const vLong = cropVolatility(currentTimeMs, croppedVMap, cutOffLong);
    const thresMinimal = levelThresholdFeature(vLong);

    meanTop.push(thresMinimal.maxTop);
    mean.push(thresMinimal.mean);
    meanBottom.push(thresMinimal.minBottom);

    // B. to produce the threshold for the max top and min bottom we use close to now
    const cutOffShort = currentTimeMs - windowsMs["1d"] * 1;
    const vShort = cropVolatility(currentTimeMs, croppedVMap, cutOffShort);
    const thresMaximal = levelThresholdFeature(vShort);

    maxTop.push(thresMaximal.maxTop);
    minBottom.push(thresMaximal.minBottom);
  }

  // C. return the aggregated values
  const levelThreshold = {
    maxTop: Math.max(...maxTop),
    meanTop:
      meanTop.length > 0
        ? meanTop.reduce((a, b) => a + b, 0) / meanTop.length
        : 0,
    mean: mean.length > 0 ? mean.reduce((a, b) => a + b, 0) / mean.length : 0,
    meanBottom:
      meanBottom.length > 0
        ? meanBottom.reduce((a, b) => a + b, 0) / meanBottom.length
        : 0,
    minBottom: Math.min(...minBottom),
  };
  return levelThreshold;
}
