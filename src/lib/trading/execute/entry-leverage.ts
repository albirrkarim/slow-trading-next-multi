import type { EntryRecommendation } from "@/lib/brain/algorithms/type-execute";
import { mapScaleValue } from "@/lib/brain/algorithms/v4/decisions/v12/classifier/utils";
import { TradingMode } from "@/lib/exchange/types";

interface ResolveEntryLeverageConfig {
  exactLeverage?: number;
  maxLeverage?: number;
}

/**
 * Resolves the leverage shared by backtest and production futures entries.
 *
 * BOTH:LEVERAGE_CALCULATION
 */
export function resolveEntryLeverage(params: {
  entrySignal: EntryRecommendation;
  tradingMode: TradingMode;
  config?: ResolveEntryLeverageConfig;
}) {
  if (params.tradingMode !== TradingMode.FUTURES) {
    return 1;
  }

  const exactLeverage = params.config?.exactLeverage;

  if (
    typeof exactLeverage === "number" &&
    Number.isFinite(exactLeverage) &&
    exactLeverage > 0
  ) {
    return Math.max(1, Math.floor(exactLeverage));
  }

  // tradeLog.log("RESOLVE LEVERAGE");
  // tradeLog.log(params);

  // hardcodes
  const leverageFromProbability = Math.floor(
    mapScaleValue(0.3, 1, params.entrySignal.amountProbab, 3, 4),
  );

  let leverage = leverageFromProbability;
  const engineMaxLeverage = params.entrySignal.maxLeverage;
  const configMaxLeverage = params.config?.maxLeverage;

  // Cap by engine
  if (
    Number.isFinite(engineMaxLeverage) &&
    engineMaxLeverage > 0 &&
    engineMaxLeverage < leverage
  ) {
    leverage = engineMaxLeverage;
  }

  // Cap by human
  if (
    typeof configMaxLeverage === "number" &&
    Number.isFinite(configMaxLeverage) &&
    configMaxLeverage > 0 &&
    configMaxLeverage < leverage
  ) {
    leverage = configMaxLeverage;
  }

  return Math.max(1, Math.floor(leverage));
}
