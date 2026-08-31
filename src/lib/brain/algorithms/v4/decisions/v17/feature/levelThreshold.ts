import { cropVolatility } from "@/lib/dynamic";
import { windowsMs } from "@/lib/dynamic/utils/nn/data/features/constants";
import type { VolatilityPoint } from "@/lib/dynamic/utils/volatility";

export interface LevelThreshold {
  maxTop: number;

  /**
   * All level top values summed and divided by count
   */
  meanTop: number;

  /**
   * meanTop + meanBottom / 2
   */
  mean: number;

  /**
   * All level bottom values summed and divided by count
   */
  meanBottom: number;

  minBottom: number;
}

/**
 * Calculates level threshold features from volatility map data.
 * Created: 12 December 2025
 * @param cropedVMap
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
    const cutOff = currentTimeMs - windowsMs["1d"] * 10;
    const c = cropVolatility(currentTimeMs, croppedVMap, cutOff);

    // produce the threshold
    const thres = levelThresholdFeature(c);

    meanTop.push(thres.maxTop);
    mean.push(thres.mean);
    meanBottom.push(thres.minBottom);

    const cutOffA = currentTimeMs - windowsMs["1d"] * 1;
    const d = cropVolatility(currentTimeMs, croppedVMap, cutOffA);

    // // produce the threshold
    const thresD = levelThresholdFeature(d);

    maxTop.push(thresD.maxTop);
    minBottom.push(thresD.minBottom);
  }

  // const thresd = levelThresholdFeature(croppedVMap);

  // maxTop.push(thresd.maxTop);
  // minBottom.push(thresd.minBottom);

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
