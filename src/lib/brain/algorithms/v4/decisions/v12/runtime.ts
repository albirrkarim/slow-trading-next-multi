import { type DynamicTradeMemory } from "@/lib/dynamic";

export { updatePriceNorm } from "@/lib/dynamic/utils/priceNorm";
export type { DynamicTradeMemorySimple } from "@/lib/dynamic/utils/priceNorm";

import { type GrowthOvertimeDetail } from "@/lib/dynamic/backtest-volatility/type";
import { MINIMAL_USDT_TO_TRADE } from "@/lib/trading/constants";

interface GetInvestmentAmountProps {
  dynamicTradeMemory: DynamicTradeMemory;
  currentBalance: GrowthOvertimeDetail;
  allocationPercent: number;
  recommendedPositionsLength: number;
}

export function getInvestmentAmount({
  dynamicTradeMemory,
  currentBalance,
  allocationPercent,
  recommendedPositionsLength,
}: GetInvestmentAmountProps) {
  const commonSpent = currentBalance.currentBaseAssetLabeled["common"];
  let quoteAssetToTrade = currentBalance.currentAsset - commonSpent;

  if (quoteAssetToTrade <= MINIMAL_USDT_TO_TRADE) {
    quoteAssetToTrade = 0;
  }

  quoteAssetToTrade = Math.min(
    dynamicTradeMemory.quoteAsset,
    Math.max(
      dynamicTradeMemory.startingBalanceUSDT * allocationPercent,
      quoteAssetToTrade * allocationPercent
    )
  );

  // Spread accros recommendation
  if (quoteAssetToTrade > 0) {
    quoteAssetToTrade = quoteAssetToTrade / recommendedPositionsLength;
  }

  return quoteAssetToTrade;
}
