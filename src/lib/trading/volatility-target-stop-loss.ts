interface ShouldExitParams {
  feeAdjustedNetProfitPercent: number;
  hasHitTargetZone: boolean;
  stopLossPercent?: number;
}

/**
 * Checks the tighter stop loss enabled after an opposite volatility target hit.
 */
function shouldExit({
  feeAdjustedNetProfitPercent,
  hasHitTargetZone,
  stopLossPercent,
}: ShouldExitParams) {
  return (
    hasHitTargetZone &&
    Number.isFinite(stopLossPercent) &&
    stopLossPercent !== undefined &&
    stopLossPercent > 0 &&
    feeAdjustedNetProfitPercent <= -stopLossPercent
  );
}

const volatilityTargetStopLoss = {
  shouldExit,
} as const;

export default volatilityTargetStopLoss;
