import { windowsMs } from "@/lib/dynamic/utils/nn/data/features/constants";
import { type VolatilityPoint } from "@/lib/dynamic/utils/volatility";
import { meanLevelThresholdFeature } from "./levelThreshold";
import type { PriceNorm } from "@/lib/dynamic";
import { cropVolatility } from "@/lib/dynamic";
import moment from "moment-timezone";

// ============================================================================
// A. Helper Functions - Target Coin
// ============================================================================

interface ExtractTargetCoinFeaturesProps {
  currentPoint: VolatilityPoint;
  symbol: string;
  cutOff: number;
  priceNormMapOverTime: Record<string, PriceNorm[]>;
  volatilityPointsMap: Record<string, VolatilityPoint[]>;
}

export function extractTargetCoinFeatures({
  currentPoint,
  symbol,
  cutOff,
  priceNormMapOverTime,
  volatilityPointsMap,
}: ExtractTargetCoinFeaturesProps) {
  // A.1 Current Price Norm
  const currentPriceNorm = priceNormMapOverTime[symbol].at(-1) ?? {
    t: currentPoint.t,
    n: 0,
    x: 0,
    c: 0,
  };

  // A.2 Down Ratio
  const priceNorms = priceNormMapOverTime[symbol].filter(
    (e) => e.t > cutOff && e.t <= currentPoint.t
  );
  const downRatio = getSharpDownRatio(priceNorms);

  // A.3 Velocity Down Time
  const beforeLast = volatilityPointsMap[symbol]
    .filter((e) => e.t < currentPoint.t)
    .at(-1);

  const velocityMove = beforeLast ? currentPoint.t - beforeLast.t : 0;

  // A.4 Mean Level
  const meanLevel =
    volatilityPointsMap[symbol].reduce((acc, cur) => acc + cur.lvl, 0) /
    volatilityPointsMap[symbol].length;

  return {
    currentPriceNorm: currentPriceNorm.c,
    downRatio,
    velocityMove,
    velocityMoveHuman: moment.duration(velocityMove, "milliseconds").humanize(),
    meanLevel,
    priceNormsLength: priceNorms.length,
  };
}

// ============================================================================
// B. Helper Functions - BTC
// ============================================================================

interface ExtractBTCFeaturesProps {
  btcPriceNorm: PriceNorm;
  cutOff: number;
  currentPoint: VolatilityPoint;
  priceNormMapOverTime: Record<string, PriceNorm[]>;
  volatilityPointsMap: Record<string, VolatilityPoint[]>;
}

export function extractBTCFeatures({
  btcPriceNorm,
  cutOff,
  currentPoint,
  priceNormMapOverTime,
  volatilityPointsMap,
}: ExtractBTCFeaturesProps) {
  // B.1 BTC Down Ratio
  const btcPriceNorms = priceNormMapOverTime["BTC"].filter(
    (e) => e.t > cutOff && e.t <= currentPoint.t
  );
  const downRatio = getSharpDownRatio(btcPriceNorms);

  const lastBTCVolatilityPoint = volatilityPointsMap["BTC"].at(-1) || null;

  return {
    downRatio,
    currentPriceNorm: btcPriceNorm.c,
    lastBTCVolatilityPoint,
  };
}

// ============================================================================
// C. Helper Functions - Market-Wide
// ============================================================================

interface CalculateMarketFeaturesProps {
  currentPoint: VolatilityPoint;
  volatilityPointsMap: Record<string, VolatilityPoint[]>;
}

export function calculateMarketFeatures({
  currentPoint,
  volatilityPointsMap,
}: CalculateMarketFeaturesProps) {
  const cutOff = currentPoint.t - windowsMs["1d"] * 15;

  // C.1 Count VPoints in last 2 weeks
  const croppedVMap = cropVolatility(
    currentPoint.t,
    volatilityPointsMap,
    cutOff
  );
  const totalVPoints = Object.values(croppedVMap).reduce(
    (acc, points) => acc + points.length,
    0
  );

  // C.2 Count VPoints in range now - 1 month
  const cutOffOneMonth = currentPoint.t - windowsMs["1m"];
  const croppedVMapMonth = cropVolatility(
    currentPoint.t,
    volatilityPointsMap,
    cutOffOneMonth
  );
  const totalVPointsMonth = Object.values(croppedVMapMonth).reduce(
    (acc, points) => acc + points.length,
    0
  );

  // C.3 Normalize: week vs month ratio
  const globalVolatilityIndex =
    totalVPointsMonth === 0 ? 0 : totalVPoints / totalVPointsMonth;

  // calculate mean level of all coins range 1 week
  const meanLevel =
    Object.values(croppedVMap).reduce((acc, points) => {
      const sumLevels = points.reduce((sum, point) => sum + point.lvl, 0);
      return acc + sumLevels;
    }, 0) / (totalVPoints || 1); // avoid division by zero

  // C.4 Level Thresholds
  const levelThreshold = meanLevelThresholdFeature(croppedVMap);

  return { globalVolatilityIndex, meanLevel, levelThreshold };
}

/**
 * Calculate a "sharp down ratio" between 0–1.
 *
 * Combines frequency and magnitude of downward movements.
 *
 * - 0 → mostly up or flat
 * - 1 → fast or steep downward trend
 */
export function getSharpDownRatio(data: PriceNorm[]): number {
  if (!data || data.length < 2) return 0;

  let totalMoveMagnitude = 0;
  let downMoveMagnitude = 0;

  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];

    const diff = curr.c - prev.c;
    const absDiff = Math.abs(diff);

    if (absDiff === 0) continue; // ignore flats

    totalMoveMagnitude += absDiff;

    // Weight downs heavier if they are sharp
    if (diff < 0) {
      // You can tune the "sharpness" by squaring or cubing the drop
      downMoveMagnitude += absDiff * (absDiff > 0.05 ? 1.5 : 1);
    }
  }

  if (totalMoveMagnitude === 0) return 0;

  // Normalize: 0–1
  return Math.min(1, downMoveMagnitude / totalMoveMagnitude);
}
