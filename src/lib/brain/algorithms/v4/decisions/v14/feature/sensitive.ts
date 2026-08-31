import { cropVolatility } from "@/lib/dynamic";
import { windowsMs } from "@/lib/dynamic/utils/nn/data/features/constants";
import type { VolatilityPoint } from "@/lib/dynamic/utils/volatility";

interface CalculateMarketFeaturesProps {
  currentPoint: VolatilityPoint;
  volatilityPointsMap: Record<string, VolatilityPoint[]>;
}

export function calculateSensitiveFeatures({
  currentPoint,
  volatilityPointsMap,
}: CalculateMarketFeaturesProps) {
  const cutOff = currentPoint.t - windowsMs["1d"] * 7;

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
  const cutOffTwoWeek = currentPoint.t - windowsMs["1d"] * 14;

  const croppedVMapMonth = cropVolatility(
    currentPoint.t,
    volatilityPointsMap,
    cutOffTwoWeek
  );

  const totalVPointsMonth = Object.values(croppedVMapMonth).reduce(
    (acc, points) => acc + points.length,
    0
  );

  // C.3 Normalize: week vs month ratio
  const weeklyVolatilityIndex =
    totalVPointsMonth === 0 ? 0 : totalVPoints / totalVPointsMonth;

  // calculate mean level of all coins range 1 week
  const weeklyMeanLevel =
    Object.values(croppedVMap).reduce((acc, points) => {
      const sumLevels = points.reduce((sum, point) => sum + point.lvl, 0);
      return acc + sumLevels;
    }, 0) / (totalVPoints || 1); // avoid division by zero

  // count min max level of all coins range 1 week. except for current coin
  let minLevel = Infinity;
  let maxLevel = -Infinity;

  Object.keys(croppedVMap).forEach((symbol) => {
    if (symbol !== currentPoint.symbol) {
      const points = croppedVMap[symbol];
      points.forEach((point) => {
        if (point.lvl < minLevel) {
          minLevel = point.lvl;
        }
        if (point.lvl > maxLevel) {
          maxLevel = point.lvl;
        }
      });
    }
  });

  return { weeklyVolatilityIndex, weeklyMeanLevel, minLevel, maxLevel };
}
