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

  // C. Spread accros recommendation
  if (quoteAssetToTrade > 0) {
    if (quoteAssetToTrade > 1000) {
      // CORRELATION PENALTY
      // If we are betting BIG (>1000 USDT), we must be careful about "Cluster Risk".
      // If we have 3 signals, we don't just divide by 3. We divide by 3^Factor to keep cash reserve.

      // Factor 0.5 means we penalized it by sqrt(N) * more
      // Original: Money / N
      // New: Money / (N * N^0.5) = Money / N^1.5
      const CORRELATION_FACTOR_PENALTY = 0.5;

      const penalty = Math.pow(
        recommendedPositionsLength,
        1 + CORRELATION_FACTOR_PENALTY
      );
      quoteAssetToTrade = quoteAssetToTrade / penalty;
    } else {
      quoteAssetToTrade = quoteAssetToTrade / recommendedPositionsLength;
    }
  }

  return quoteAssetToTrade;
}
