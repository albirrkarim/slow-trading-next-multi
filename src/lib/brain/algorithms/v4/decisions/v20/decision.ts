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

import { getInvestmentAmount } from "../v18/runtime";
import { getRecommendationsV20Sync } from "./recommendations";

export function decisionEngineV20({
  currentTimeMs,
  volatilityPointsMap,
  modelMemoryMap,
  dynamicTradeMemory = DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION,
  minActionableAbsoluteLevel,
}: DecisionEngineProps): EntryRecommendation[] {
  // BTEST:DECISION_V20_LEVEL_GATE
  const entry = getRecommendationsV20Sync({
    minActionableAbsoluteLevel,
    volatilityPointsMap,
  });
  if (entry.length === 0) {
    return [];
  }

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

  for (const recommendation of entry) {
    recommendation.investAmount = Math.floor(
      investAmount * recommendation.amountProbab,
    );
    recommendation.message = TRADE_MESSAGE.buy.COMMON;
  }

  return entry;
}
