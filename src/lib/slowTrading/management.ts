import { FILES } from "@/components/storage";
import type { VolatilityPoint } from "@/lib/dynamic";
import { getExchange } from "@/lib/exchange";
import { resolveMarketTypeForTradingMode } from "@/lib/exchange/utils";
import { tradeLog } from "@/lib/trading/helper/log";
import slowTradingAutoRemoveSymbols from "./auto-remove-symbols";
import slowTradingMarket from "./market";
import slowTradingMutationQueue from "./mutation-queue";
import slowTradingNotifications from "./notifications";
import slowTradingPerformance, {
  type SlowTradingCyclePerformanceEntry,
  type SlowTradingCyclePerformanceObserver,
} from "./performance";
import slowTradingStageRun from "./stage-run";
import slowTradingStorage from "./storage";
import type { SlowTradingMode } from "./types";

interface RunSlowTradingManagementParams {
  ignoreRunnerEnabled?: boolean;
  performance?: SlowTradingCyclePerformanceObserver;
}

interface CoinManagementEvaluation {
  latestMarketCapBySymbol: Record<string, number>;
  latestPriceBySymbol: Record<string, number>;
  modelMemoryMap: Record<string, any>;
  volatilityPointsBySymbol: Record<string, VolatilityPoint[]>;
}

/** Builds market data and reads persisted volatility without holding the mutation queue. */
async function evaluateCoinManagement(
  params: RunSlowTradingManagementParams | undefined,
) {
  const startedAt = Date.now();
  const performanceEntries: SlowTradingCyclePerformanceEntry[] = [];
  const profiler = slowTradingPerformance.cycle.createProfiler({
    now: params?.performance?.now,
    onSection: (entry) => {
      performanceEntries.push(entry);
      params?.performance?.onSection?.(entry);
    },
  });
  const storage = await profiler.time("storage.load", () =>
    slowTradingStorage.data.load({ modeScope: "active" }),
  );
  const activeMode = slowTradingStorage.mode.getActive(storage);
  const symbols = Array.from(
    new Set(
      storage.config.symbols
        .map((symbol) => String(symbol || "").trim().toUpperCase())
        .filter(Boolean),
    ),
  );

  if (!storage.runtime.runnerEnabled && !params?.ignoreRunnerEnabled) {
    return {
      activeMode,
      performanceEntries,
      skipped: true as const,
      startedAt,
      symbols,
    };
  }

  const evaluation: CoinManagementEvaluation = {
    latestMarketCapBySymbol: {},
    latestPriceBySymbol: {},
    modelMemoryMap: {},
    volatilityPointsBySymbol: {},
  };

  await slowTradingStorage.account.runWithExchangeAccount(storage, async () => {
    const exchange = getExchange(storage.config.exchangeType, {
      defaultTradingMode: storage.config.tradingMode,
    });
    const marketType = resolveMarketTypeForTradingMode(
      storage.config.tradingMode,
    );
    const [
      latestPriceBySymbol,
      latestMarketCapBySymbol,
      volatilityPointsBySymbol,
    ] = await Promise.all([
      (storage.runtime.autoRemoveSymbolMinPrice ?? 0) > 0
        ? profiler.time("management.prices", () =>
            slowTradingMarket.price.buildLatestBySymbol({
              exchange,
              marketType,
              symbols,
            }),
          )
        : Promise.resolve({}),
      (storage.runtime.autoRemoveSymbolMinMarketCapUSD ?? 0) > 0
        ? profiler.time("management.marketCaps", () =>
            slowTradingMarket.marketCap.buildLatestBySymbol(symbols),
          )
        : Promise.resolve({}),
      (storage.runtime.autoRemoveSymbolAbsLevel ?? 0) > 0 ||
      (storage.runtime.autoRemoveSymbolMinVPointPct ?? 0) > 0
        ? profiler.time("management.volatilityStorage", async () =>
            Object.fromEntries(
              await Promise.all(
                symbols.map(async (symbol) => [
                  symbol,
                  await FILES.slow.volatilityPoints.get(
                    storage.config.exchangeType,
                    symbol,
                  ),
                ]),
              ),
            ),
          )
        : Promise.resolve({}),
    ]);

    evaluation.latestPriceBySymbol = latestPriceBySymbol;
    evaluation.latestMarketCapBySymbol = latestMarketCapBySymbol;
    evaluation.volatilityPointsBySymbol = volatilityPointsBySymbol;
    evaluation.modelMemoryMap = Object.fromEntries(
      Object.entries(volatilityPointsBySymbol).map(([symbol, points]) => [
        symbol,
        { volatility: { lastVolatility: points } },
      ]),
    );
  });

  return {
    activeMode,
    evaluation,
    performanceEntries,
    skipped: false as const,
    startedAt,
    symbols,
  };
}

/** Runs one independent Coin Management pass and briefly serializes its commit. */
async function run(params?: RunSlowTradingManagementParams) {
  // PROD:MANAGEMENT_STAGE
  const prepared = await evaluateCoinManagement(params);
  if (prepared.skipped) {
    return {
      mode: prepared.activeMode as SlowTradingMode,
      removedSymbols: [] as string[],
      skipped: true,
      stage: "management" as const,
      symbols: prepared.symbols,
    };
  }

  const committed = await slowTradingMutationQueue.runExclusive(async () => {
    const now = params?.performance?.now ?? Date.now;
    const commitStartedAt = now();
    const latestStorage = await slowTradingStorage.data.load({
      modeScope: "all",
    });
    const activeMode = slowTradingStorage.mode.getActive(latestStorage);
    const evaluation = prepared.evaluation;
    const removedByAbsLevel = slowTradingAutoRemoveSymbols.find.byAbsLevel({
      configuredSymbols: latestStorage.config.symbols,
      thresholdAbsLevel: latestStorage.runtime.autoRemoveSymbolAbsLevel,
      modelMemoryMap: evaluation.modelMemoryMap,
    });
    const removedByMinPrice = slowTradingAutoRemoveSymbols.find.byMinPrice({
      configuredSymbols: latestStorage.config.symbols,
      latestPriceBySymbol: evaluation.latestPriceBySymbol,
      minimumPrice: latestStorage.runtime.autoRemoveSymbolMinPrice,
    });
    const removedByMarketCap =
      slowTradingAutoRemoveSymbols.find.byMarketCap({
        configuredSymbols: latestStorage.config.symbols,
        marketCapUSDBySymbol: evaluation.latestMarketCapBySymbol,
        minimumMarketCapUSD:
          latestStorage.runtime.autoRemoveSymbolMinMarketCapUSD,
      });
    // PROD:AUTO_REMOVE_COIN_BY_VPOINT_PCT
    const removedByVPointPct =
      slowTradingAutoRemoveSymbols.find.byVPointPct({
        configuredSymbols: latestStorage.config.symbols,
        minimumVPointPct:
          latestStorage.runtime.autoRemoveSymbolMinVPointPct,
        volatilityPointsBySymbol: evaluation.volatilityPointsBySymbol,
      });
    const removedSymbols = Array.from(
      new Set([
        ...removedByAbsLevel,
        ...removedByMinPrice,
        ...removedByMarketCap,
        ...removedByVPointPct,
      ]),
    );

    const updatedStorage =
      removedSymbols.length > 0
        ? await slowTradingStorage.data.update({
            symbols: slowTradingAutoRemoveSymbols.remove.fromConfig(
              latestStorage.config.symbols,
              removedSymbols,
            ),
          })
        : latestStorage;
    const modeState = updatedStorage.modes[activeMode];
    const summary =
      `${activeMode} management cycle removed ${removedSymbols.length} symbol(s)`;
    const commitFinishedAt = now();
    const commitPerformance = {
      durationMs: Math.max(0, commitFinishedAt - commitStartedAt),
      finishedAt: commitFinishedAt,
      section: "management.commit" as const,
      startedAt: commitStartedAt,
    };
    prepared.performanceEntries.push(commitPerformance);
    params?.performance?.onSection?.(commitPerformance);
    const runStats = slowTradingStageRun.recordCompleted({
      cycleStartedAt: prepared.startedAt,
      modeState,
      performanceEntries: prepared.performanceEntries,
      reports: 0,
      stage: "management",
      summary,
      symbols: prepared.symbols.length,
    });
    await slowTradingStorage.mode.saveState(activeMode, modeState, {
      account: updatedStorage.account.slug,
    });

    const removedByAbsLevelSet = new Set(removedByAbsLevel);
    const removedByMarketCapSet = new Set(removedByMarketCap);
    const removedByMinPriceSet = new Set(removedByMinPrice);
    const removedByVPointPctSet = new Set(removedByVPointPct);
    const actions = removedSymbols.map((symbol) => {
      const reasons: string[] = [];
      const sources: string[] = [];

      if (removedByAbsLevelSet.has(symbol)) {
        const latestPoint = evaluation.modelMemoryMap[
          symbol
        ]?.volatility?.lastVolatility?.at(-1);
        reasons.push(
          `Latest vPoint absolute level ${Math.abs(latestPoint?.lvl ?? 0)} ` +
            `reached threshold ${updatedStorage.runtime.autoRemoveSymbolAbsLevel}.`,
        );
        sources.push("auto-remove-abs-level");
      }
      if (removedByMinPriceSet.has(symbol)) {
        reasons.push(
          `Latest price ${evaluation.latestPriceBySymbol[symbol]} USDT ` +
            `fell below minimum ${updatedStorage.runtime.autoRemoveSymbolMinPrice} USDT.`,
        );
        sources.push("auto-remove-min-price");
      }
      if (removedByMarketCapSet.has(symbol)) {
        reasons.push(
          `Latest market cap ${evaluation.latestMarketCapBySymbol[symbol]} USD ` +
            `fell below minimum ${updatedStorage.runtime.autoRemoveSymbolMinMarketCapUSD} USD.`,
        );
        sources.push("auto-remove-market-cap");
      }
      if (removedByVPointPctSet.has(symbol)) {
        const highestPoint =
          slowTradingAutoRemoveSymbols.vPoint.findHighestPct(
            evaluation.volatilityPointsBySymbol[symbol] ?? [],
          );
        reasons.push(
          `Stored vPoint ${highestPoint?.id ?? "unknown"} movement ` +
            `${highestPoint?.pct ?? "unknown"}% reached threshold ` +
            `${updatedStorage.runtime.autoRemoveSymbolMinVPointPct}%.`,
        );
        sources.push("auto-remove-vpoint-pct");
      }

      return {
        action: "remove" as const,
        reason: reasons.join(" "),
        source: `slow-trading.${activeMode}-cycle.coin-management:${sources.join("+")}`,
        symbol,
        t: runStats.t,
      };
    });

    return {
      actions,
      activeMode,
      notification: updatedStorage.runtime.notification,
      removedByAbsLevel,
      removedByMarketCap,
      removedByMinPrice,
      removedByVPointPct,
      removedSymbols,
      runStats,
    };
  });

  if (committed.removedSymbols.length > 0) {
    tradeLog.log("[slow-trading] auto removed configured symbols", {
      removedByAbsLevel: committed.removedByAbsLevel,
      removedByMarketCap: committed.removedByMarketCap,
      removedByMinPrice: committed.removedByMinPrice,
      removedByVPointPct: committed.removedByVPointPct,
      removedSymbols: committed.removedSymbols,
    });

    await Promise.all(
      committed.actions.map((action) =>
        slowTradingStorage.logs.appendManagement({
          action: action.action,
          reason: action.reason,
          source: action.source,
          symbol: action.symbol,
          timestamp: action.t,
        }),
      ),
    ).catch((error) => {
      tradeLog.error(
        "[slow-trading] failed to persist management-action log",
        error,
      );
    });

    await slowTradingNotifications.managementAction
      .notify({
        actions: committed.actions,
        notification: committed.notification,
      })
      .catch((error) => {
        tradeLog.error(
          "[slow-trading] failed to send management-action notification",
          error,
        );
      });
  }

  return {
    mode: committed.activeMode as SlowTradingMode,
    removedSymbols: committed.removedSymbols,
    skipped: false,
    stage: "management" as const,
    symbols: prepared.symbols,
  };
}

const slowTradingManagement = {
  run,
} as const;

export default slowTradingManagement;
export { slowTradingManagement };
