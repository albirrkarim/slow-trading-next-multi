import type { DynamicTradeMemory, VolatilityPoint } from "@/lib/dynamic";
import { cropVolatility, updatePriceNorm } from "../utils/priceNorm";

interface GenerateInitialPriceNorm {
  symbols: string[];
  dynamicTradeMemory: DynamicTradeMemory;
  volatilityMap: Record<string, VolatilityPoint[]>;
}

/** Seeds backtest price normalization from cached pre-backtest volatility events. */
export function generateInitialPriceNorm({
  symbols,
  dynamicTradeMemory,
  volatilityMap,
}: GenerateInitialPriceNorm) {
  if (!dynamicTradeMemory.priceNormMapOverTime) {
    dynamicTradeMemory.priceNormMapOverTime = {};
  }
  for (const symbol of symbols) {
    dynamicTradeMemory.priceNormMapOverTime[symbol] = [];
  }

  const times = [
    ...new Set(
      Object.values(volatilityMap).flatMap((points) =>
        points.map((point) => point.t),
      ),
    ),
  ].sort((a, b) => a - b);

  for (const currentTimeMs of times) {
    updatePriceNorm({
      currentTimeMs,
      dynamicTradeMemory: {
        priceNormMapOverTime: dynamicTradeMemory.priceNormMapOverTime,
      },
      volatilityPointsMap: cropVolatility(
        currentTimeMs,
        volatilityMap,
        undefined,
        true,
      ),
    });
  }
}
