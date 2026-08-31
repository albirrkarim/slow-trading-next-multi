import type { EntryRecommendation } from "@/lib/brain";
import type { DynamicTradeConfig, DynamicTradeMemory } from "@/lib/dynamic";
import { TradingMode, type IExchange } from "@/lib/exchange";
import type { ExchangeType } from "@/lib/exchange/types";
import lateEntryVPointDrift from "@/lib/trading/execute/late-entry-vpoint-drift";
import type { TradingModelMemory } from "@/lib/trading/models";
import type { SlowTradingCycleProfiler } from "../performance";
import slowTradingMarket from "../market";
import slowTradingPositions from "../positions";
import slowTradingReporting from "../reporting";
import slowTradingWatchReserve from "../watch-reserve";
import slowTradingWorkerCapacity from "../worker-capacity";
import { decideSidewaysExitForStrongCandidates } from "./decision";
import { tradeLog } from "@/lib/trading/helper/log";

/**
 * Applies the sideways-exit worker-freeing rule inside the production cycle.
 */
export async function applyProductionSidewaysExitForStrongCandidates(params: {
  config: DynamicTradeConfig;
  currentTimeMs: number;
  dynamicTradeMemory: DynamicTradeMemory;
  entrySignals: EntryRecommendation[];
  exchange: IExchange;
  exchangeType: ExchangeType;
  marketType: "SPOT" | "FUTURES";
  modelMemoryMap: Record<string, TradingModelMemory>;
  profiler: Pick<SlowTradingCycleProfiler, "time">;
}): Promise<void> {
  const {
    config,
    currentTimeMs,
    dynamicTradeMemory,
    entrySignals,
    exchange,
    exchangeType,
    marketType,
    modelMemoryMap,
    profiler,
  } = params;

  if (
    config.exitSidewaysToFreeWorkersForStrongCandidates !== true ||
    entrySignals.length === 0
  ) {
    return;
  }

  const activePositionInputs = Object.entries(modelMemoryMap).flatMap(
    ([symbol, modelMemory]) =>
      (modelMemory.positions ?? []).map((position) => ({
        position,
        symbol: slowTradingPositions.symbol.normalize(
          position.symbol ?? symbol,
        ),
      })),
  );
  const activePositionSymbols = Array.from(
    new Set(activePositionInputs.map((item) => item.symbol).filter(Boolean)),
  );
  const candidateSymbols = entrySignals
    .map((signal) => slowTradingPositions.symbol.normalize(signal.symbol))
    .filter(Boolean);

  if (activePositionInputs.length === 0) {
    return;
  }

  const latestPriceBySymbol = await profiler.time("cycle.latestPrices", () =>
    slowTradingMarket.price.buildLatestBySymbol({
      exchange,
      marketType,
      symbols: [...activePositionSymbols, ...candidateSymbols],
    }),
  );

  for (const item of activePositionInputs) {
    const latestPrice = latestPriceBySymbol[item.symbol];
    if (typeof latestPrice === "number" && latestPrice > 0) {
      slowTradingReporting.pnl.applyFloatingMetrics(
        item.position,
        latestPrice,
        exchangeType,
      );
    }
  }

  const candidateLateEntryPassedBySymbol = Object.fromEntries(
    entrySignals
      .map((signal) => {
        const symbol = slowTradingPositions.symbol.normalize(signal.symbol);
        const currentPrice = latestPriceBySymbol[symbol];
        if (!symbol) {
          return null;
        }
        if (
          typeof currentPrice !== "number" ||
          !Number.isFinite(currentPrice) ||
          currentPrice <= 0
        ) {
          return [symbol, false] as const;
        }

        const direction =
          config.tradingMode === TradingMode.SPOT
            ? "LONG"
            : signal.l === "T"
              ? "SHORT"
              : "LONG";
        const guard = lateEntryVPointDrift.evaluate({
          currentPrice,
          direction,
          vPointPrice: signal.p,
        });

        return [symbol, !guard.blocked] as const;
      })
      .filter(
        (item): item is readonly [string, boolean] => Array.isArray(item),
      ),
  );

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
    candidateLateEntryPassedBySymbol,
    currentTimeMs,
    enabled: config.exitSidewaysToFreeWorkersForStrongCandidates === true,
    entrySignals,
    openPositions: activePositionInputs.map((item) => ({
      netProfitPercent: item.position.pnl.netPct,
      position: item.position,
      symbol: item.symbol,
    })),
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

  tradeLog.log(
    "[slow-trading] force exiting sideways position",
    sidewaysExitDecision.positionSymbol,
    sidewaysExitDecision.reason,
  );
}
