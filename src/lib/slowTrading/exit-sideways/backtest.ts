import type { EntryRecommendation } from "@/lib/brain";
import type { DynamicTradeMemory } from "@/lib/dynamic";
import type { BacktestConfigDynamic } from "@/lib/dynamic/type-backtest";
import type { VolatilityPoint } from "@/lib/dynamic/utils/volatility";
import { computeClosedPositionMetrics } from "@/lib/trading/pnl";
import type { TradingModelMemory } from "@/lib/trading/models";
import slowTradingWatchReserve from "../watch-reserve";
import slowTradingWorkerCapacity from "../worker-capacity";
import { decideSidewaysExitForStrongCandidates } from "./decision";

/**
 * Applies the sideways-exit worker-freeing rule inside the backtest loop.
 */
export function applyBacktestSidewaysExitForStrongCandidates(params: {
  config: BacktestConfigDynamic;
  currentTimeMs: number;
  dynamicTradeMemory: DynamicTradeMemory;
  entrySignals: EntryRecommendation[];
  modelMemoryMap: Record<string, TradingModelMemory>;
  volatilityMap: Record<string, VolatilityPoint[]>;
}): void {
  const {
    config,
    currentTimeMs,
    dynamicTradeMemory,
    entrySignals,
    modelMemoryMap,
    volatilityMap,
  } = params;

  if (
    config.exitSidewaysToFreeWorkersForStrongCandidates !== true ||
    entrySignals.length === 0
  ) {
    return;
  }

  const activePositionInputs = Object.entries(modelMemoryMap).flatMap(
    ([symbol, modelMemory]) =>
      (modelMemory.positions ?? []).map((position) => {
        const currentPrice = volatilityMap[symbol]?.at(-1)?.p;
        const metrics =
          typeof currentPrice === "number" && currentPrice > 0
            ? computeClosedPositionMetrics(position, currentPrice, 0.002)
            : null;

        return {
          netProfitPercent: metrics?.netProfitPercent,
          position,
          symbol,
        };
      }),
  );

  if (activePositionInputs.length === 0) {
    return;
  }

  const spendableUsdt =
    slowTradingWatchReserve.balance.getSpendableQuoteAssetValue({
      quoteAsset: dynamicTradeMemory.quoteAsset,
      reservedQuoteAsset: dynamicTradeMemory.reservedQuoteAsset,
    });
  const workerCapacity = slowTradingWorkerCapacity.calculate({
    activePositions: activePositionInputs.map((item) => item.position),
    config,
    spendableUsdt,
  });
  const sidewaysExitDecision = decideSidewaysExitForStrongCandidates({
    availableWorkers: workerCapacity.availableWorkers,
    currentTimeMs,
    enabled: config.exitSidewaysToFreeWorkersForStrongCandidates === true,
    entrySignals,
    openPositions: activePositionInputs,
  });

  if (!sidewaysExitDecision.shouldExit || !sidewaysExitDecision.position) {
    return;
  }

  // BOTH:EXIT_SIDEWAYS_TO_ENTRY_STRONG_CANDIDATES
  sidewaysExitDecision.position.control = {
    ...sidewaysExitDecision.position.control,
    forceExit: {
      reason:
        `BOTH:EXIT_SIDEWAYS_TO_ENTRY_STRONG_CANDIDATES | ` +
        `${sidewaysExitDecision.reason}`,
    },
  };
}
