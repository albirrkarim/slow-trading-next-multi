import { countGrowthOvertime, DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION } from "@/lib/dynamic";
import { MINIMAL_USDT_TO_TRADE } from "@/lib/trading/constants";
import { TRADE_MESSAGE } from "@/lib/trading/message";
import type {
  DecisionEngineProps,
  EntryRecommendation,
} from "@lib/brain/algorithms/type-execute";
import { getRecommendationsV15 } from "./recommendations";
import { getInvestmentAmount, updatePriceNorm } from "./runtime";


/**
 * decisionEngineV14 - Moscow
 * Created: 14 Jan 2026
 * Updated: 14 Jan 2026
 *
 * Based on volatilityPointsMap we try to recommend the position that we should buy it
 *
 * Return TradeHistoryVolatility[] its recommendation for buy, and we must buy it
 *
 * New Feature:
 * - Always ensure profit in the month
 */
export function decisionEngineV15({
  currentTimeMs,
  volatilityPointsMap,
  modelMemoryMap,
  dynamicTradeMemory = DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION,
  backtestPack,
}: DecisionEngineProps): EntryRecommendation[] {
  updatePriceNorm({
    currentTimeMs,
    dynamicTradeMemory: {
      priceNormMapOverTime: dynamicTradeMemory.priceNormMapOverTime,
    },
    volatilityPointsMap,
    backtestPack,
  });

  const entry: EntryRecommendation[] = getRecommendationsV15({
    volatilityPointsMap,
    priceNormMapOverTime: dynamicTradeMemory.priceNormMapOverTime,
    modelMemoryMap,
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

  entry.forEach((e) => {
    const amountUSDT = Math.floor(investAmount * e.amountProbab);
    e.investAmount = amountUSDT
  });

  entry.forEach((e) => {
    e.message = TRADE_MESSAGE.buy.COMMON;
  });

  return entry;
}

/**
 * Map scale1CurrentValue proportionally into scale2's range.
 */
export function mapScaleValue(
  scale1Min: number,
  scale1Max: number,
  scale1CurrentValue: number,
  scale2Min: number,
  scale2Max: number
): number {
  if (scale1Max === scale1Min) return scale2Min; // avoid division by zero

  const ratio = (scale1CurrentValue - scale1Min) / (scale1Max - scale1Min);
  const scaled = scale2Min + ratio * (scale2Max - scale2Min);

  return scaled;
}
