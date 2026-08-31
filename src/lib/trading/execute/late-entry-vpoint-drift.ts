import { VOLATILITY_THRESHOLD } from "@/lib/brain/constants";

const LOW_VOLATILITY_THRESHOLD_CUTOFF = 5;
const LOW_VOLATILITY_MAX_PROFIT_DRIFT_PCT = 0.5;
const DEFAULT_MAX_PROFIT_DRIFT_PCT = 1;

interface LateEntryVPointDriftParams {
  currentPrice: number;
  direction: "LONG" | "SHORT";
  vPointPrice: number;
}

/** Resolves the allowed profitable drift for the active volatility mode. */
function resolveMaxProfitDriftPct(
  volatilityThreshold = VOLATILITY_THRESHOLD,
): number {
  return volatilityThreshold < LOW_VOLATILITY_THRESHOLD_CUTOFF
    ? LOW_VOLATILITY_MAX_PROFIT_DRIFT_PCT
    : DEFAULT_MAX_PROFIT_DRIFT_PCT;
}

/**
 * Calculates how far price has already moved profitably from the signal vPoint.
 * Adverse movement is returned as a negative percentage and is never blocked.
 */
function calculateProfitDriftPct({
  currentPrice,
  direction,
  vPointPrice,
}: LateEntryVPointDriftParams): number | undefined {
  if (
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(vPointPrice) ||
    currentPrice <= 0 ||
    vPointPrice <= 0
  ) {
    return undefined;
  }

  const priceChange =
    direction === "LONG"
      ? currentPrice - vPointPrice
      : vPointPrice - currentPrice;

  return (priceChange / vPointPrice) * 100;
}

/** Evaluates the production late-entry guard against its volatility-based limit. */
function evaluate(
  params: LateEntryVPointDriftParams,
  volatilityThreshold = VOLATILITY_THRESHOLD,
) {
  const maxProfitDriftPct =
    resolveMaxProfitDriftPct(volatilityThreshold);
  const profitDriftPct = calculateProfitDriftPct(params);
  const blocked =
    profitDriftPct !== undefined && profitDriftPct > maxProfitDriftPct;

  return {
    blocked,
    maxProfitDriftPct,
    profitDriftPct,
    reason: blocked
      ? `[LATE_ENTRY_VPOINT_PRICE_DRIFT_PCT] Entry skipped because ${params.direction} price ` +
        `already drifted ${profitDriftPct.toFixed(2)}% in the profit direction ` +
        `from vPoint ${params.vPointPrice} to current ${params.currentPrice}; ` +
        `maximum ${maxProfitDriftPct.toFixed(2)}%`
      : undefined,
  };
}

const lateEntryVPointDrift = {
  calculateProfitDriftPct,
  evaluate,
  maxProfitDriftPct: resolveMaxProfitDriftPct(),
  resolveMaxProfitDriftPct,
};

export default lateEntryVPointDrift;
