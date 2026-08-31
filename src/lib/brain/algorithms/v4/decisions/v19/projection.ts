import { VOLATILITY_THRESHOLD } from "@/lib/brain/constants";
import type { Kline } from "@/lib/exchange/platform/tokocrypto";
import type { VolatilityPoint } from "@lib/dynamic/utils/volatility";

function getLevelDirection(level: number) {
  if (level > 0) return 1;
  if (level < 0) return -1;
  return 0;
}

/**
 * Projects when a vPoint reaches its next absolute level using the latest kline.
 */
export function projectNextLevelFromLatestKline({
  currentPoint,
  latestKline,
}: {
  currentPoint: VolatilityPoint;
  latestKline?: Kline;
}) {
  if (!latestKline) return null;

  const direction = getLevelDirection(currentPoint.lvl);
  const latestTime = latestKline[0];
  const latestPrice = Number.parseFloat(latestKline[4]);

  if (
    direction === 0 ||
    !Number.isFinite(latestPrice) ||
    latestPrice <= 0 ||
    !Number.isFinite(latestTime)
  ) {
    return null;
  }

  const elapsedMs = latestTime - currentPoint.t;
  if (elapsedMs <= 0) return null;

  // PROD:DECISION_V19_DIRECTION_CHECK
  const movedPct =
    direction > 0
      ? ((latestPrice - currentPoint.p) / currentPoint.p) * 100
      : ((currentPoint.p - latestPrice) / currentPoint.p) * 100;

  if (!Number.isFinite(movedPct) || movedPct <= 0) {
    return null;
  }

  // PROD:DECISION_V19_LEVEL_PROJECTION
  const pctLikelynessToNextLevel = Math.min(
    100,
    (movedPct / VOLATILITY_THRESHOLD) * 100,
  );

  if (movedPct >= VOLATILITY_THRESHOLD) {
    return {
      estimatedEntryAt: latestTime,
      pctLikelynessToNextLevel,
      transitionMs: latestTime - currentPoint.t,
    };
  }

  const remainingPct = VOLATILITY_THRESHOLD - movedPct;
  const velocityPctPerMs = movedPct / elapsedMs;
  if (!Number.isFinite(velocityPctPerMs) || velocityPctPerMs <= 0) {
    return null;
  }

  const remainingMs = remainingPct / velocityPctPerMs;
  const estimatedEntryAt = latestTime + remainingMs;

  return {
    estimatedEntryAt,
    pctLikelynessToNextLevel,
    transitionMs: estimatedEntryAt - currentPoint.t,
  };
}
