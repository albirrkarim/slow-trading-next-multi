import {
  countGrowthOvertime,
  DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION,
} from "@/lib/dynamic";
import { MINIMAL_USDT_TO_TRADE } from "@/lib/trading/constants";
import { TRADE_MESSAGE } from "@/lib/trading/message";
import type {
  DecisionEngineProps,
  EntryRecommendation,
} from "@lib/brain/algorithms/type-execute";
import { getRecommendationsV19Sync } from "./recommendations";
import { getInvestmentAmount, updatePriceNorm } from "../v18/runtime";

export function decisionEngineV19({
  currentTimeMs,
  volatilityPointsMap,
  modelMemoryMap,
  dynamicTradeMemory = DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION,
  backtestPack,
  minActionableAbsoluteLevel,
}: DecisionEngineProps): EntryRecommendation[] {
  // PROD:DECISION_V19_ENTRY_SIZING
  // Keep the same price-normalization preparation used by v18 so
  // backtest and production recommendations share the same feature inputs.
  updatePriceNorm({
    currentTimeMs,
    dynamicTradeMemory: {
      priceNormMapOverTime: dynamicTradeMemory.priceNormMapOverTime,
    },
    volatilityPointsMap,
    backtestPack,
  });

  // PROD:DECISION_V19_WAIT_OR_ENTER
  // Ask v19 for the single best timing-aware entry candidate. It may
  // return nothing when a projected candidate should reach the configured
  // entry level soon and exit faster than the current immediate candidates.
  const entry: EntryRecommendation[] = getRecommendationsV19Sync({
    volatilityPointsMap,
    priceNormMapOverTime: dynamicTradeMemory.priceNormMapOverTime,
    modelMemoryMap,
    minActionableAbsoluteLevel,
  });

  const currentBalance = countGrowthOvertime({
    timeMs: currentTimeMs,
    dynamicTradeMemory,
    modelMemoryMap,
    volatilityMap: volatilityPointsMap,
  });

  const investAmount = getInvestmentAmount({
    dynamicTradeMemory,
    currentBalance,
    allocationPercent: 1,
    recommendedPositionsLength: entry.length,
  });

  if (investAmount < MINIMAL_USDT_TO_TRADE) {
    return [];
  }

  // PROD:DECISION_V19_ENTRY_SIZING
  // v19 changes candidate timing/selection only, not the recommendation
  // probability sizing.
  entry.forEach((e) => {
    const amountUSDT = Math.floor(investAmount * e.amountProbab);
    e.investAmount = amountUSDT;
  });

  entry.forEach((e) => {
    e.message = TRADE_MESSAGE.buy.COMMON;
  });

  return entry;
}
