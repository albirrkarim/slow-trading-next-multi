import {
  assignModelMemory,
  assignVolatility,
} from "@/components/api/production/utils";
import type { EntryRecommendation } from "@/lib/brain";
import dynamic, { type VolatilityPoint } from "@/lib/dynamic";
import { getExchange, TradingMode } from "@/lib/exchange";
import { resolveMarketTypeForTradingMode } from "@/lib/exchange/utils";
import { tradeLog } from "@/lib/trading/helper/log";
import slowTradingBalance from "../balance";
import slowTradingExchangeSync from "../exchange-sync";
import slowTradingMarket from "../market";
import slowTradingMutationQueue from "../mutation-queue";
import slowTradingNotifications from "../notifications";
import slowTradingPerformance, {
  type SlowTradingCyclePerformanceEntry,
} from "../performance";
import slowTradingPositions from "../positions";
import slowTradingShared from "../shared";
import slowTradingSidewaysExit from "../exit-sideways";
import slowTradingSignals from "../signals";
import slowTradingStorage from "../storage";
import slowTradingCycleAccounts from "./accounts";
import slowTradingCycleEntry from "./entry";
import slowTradingCycleFinalize from "./finalize";
import slowTradingCycleMonitoring from "./monitoring";
import slowTradingCyclePlanning from "./planning";
import type {
  RunSlowTradingCycleParams,
  SlowTradingCycleResult,
  SlowTradingCycleRuntime,
} from "./types";

/** Execute one serialized SLOW cycle and persist its active-mode result. */
async function executeSlowTradingCycle(
  params?: RunSlowTradingCycleParams,
): Promise<SlowTradingCycleResult> {
  // A. Load the current active mode and runtime controls.
  const cycleStartedAt = Date.now();
  const performanceEntries: SlowTradingCyclePerformanceEntry[] = [];
  const profiler = slowTradingPerformance.cycle.createProfiler({
    now: params?.performance?.now,
    onSection: (entry) => {
      performanceEntries.push(entry);
      params?.performance?.onSection?.(entry);
    },
  });
  // PROD:CYCLE_PERFORMANCE_SECTION_DURATION
  const storage = await profiler.time("storage.load", () =>
    slowTradingStorage.data.load({
      account: params?.account,
      modeScope: "active",
    }),
  );

  return slowTradingStorage.account.runWithExchangeAccount(storage, async () =>
    profiler.time("cycle.total", async () => {
      const activeMode = slowTradingStorage.mode.getActive(storage);
      const modeState = slowTradingStorage.mode.ensureTradeSettings(
        storage.modes[activeMode],
        storage.config.symbols,
      );
      storage.modes[activeMode] = modeState;

      const planning = await slowTradingCyclePlanning.prepare({
        activeMode,
        cycleStartedAt,
        modeState,
        performanceEntries,
        profiler,
        request: params,
        storage,
      });
      if (planning.completed) {
        return planning.completed;
      }
      const plan = planning.plan;

      // A.1 Prepare the mode balance context before signal generation.
      const isSandbox = activeMode === "sandbox";
      if (isSandbox) {
        slowTradingBalance.sandbox.ensureBalance(
          modeState,
          storage.runtime.sandboxInitialBalanceUSDT,
        );
      }

      const signalBuildResult = plan.shouldAutoEnter
        ? await profiler.time("signals.build", () =>
            slowTradingSignals.build({
              storage,
              bypass: plan.bypass,
              forceEntrySymbols: Array.from(plan.forcedEntrySymbols),
              symbols: plan.stageSymbols ?? undefined,
              performance: profiler,
            }),
          )
        : null;
      const rawEntrySignals =
        signalBuildResult?.entrySignals ?? ([] as EntryRecommendation[]);

      // B. Restore runtime memory and market context for execution.
      const tradeSettings =
        signalBuildResult?.tradeSettings ??
        slowTradingShared.clone(modeState.tradeSettings);
      if (plan.forcedExitSymbols.size > 0) {
        for (const tradeSetting of tradeSettings) {
          const symbol = String(tradeSetting.symbol || "")
            .trim()
            .toUpperCase();
          if (
            plan.forcedExitSymbols.has(symbol) &&
            (tradeSetting.model_memory.positions?.length ?? 0) > 0
          ) {
            tradeSetting.model_memory.forceSell = true;
          }
        }
      }

      if (plan.shouldAutoEnter && plan.forcedEntrySymbols.size > 0) {
        for (const tradeSetting of tradeSettings) {
          const symbol = String(tradeSetting.symbol || "")
            .trim()
            .toUpperCase();
          if (
            plan.forcedEntrySymbols.has(symbol) &&
            (tradeSetting.model_memory.positions?.length ?? 0) === 0
          ) {
            tradeSetting.model_memory.justBuy = true;
          }
        }
      }

      const symbols = Array.from(
        new Set([
          ...(signalBuildResult?.symbols ??
            plan.stageSymbols ??
            slowTradingShared.symbols.buildExecution(storage.config.symbols)),
          ...plan.forcedExitSymbols,
        ]),
      );
      const modelMemoryMap = signalBuildResult?.modelMemoryMap ?? {};
      if (!signalBuildResult) {
        const modelMemoryRes = await profiler.time(
          "cycle.assignModelMemory",
          () => assignModelMemory(modelMemoryMap, tradeSettings),
        );
        if (typeof modelMemoryRes.error === "string") {
          throw new Error(modelMemoryRes.error);
        }

        await profiler.time("cycle.assignVolatility", () =>
          assignVolatility(
            modelMemoryMap,
            symbols,
            storage.config.exchangeType,
            storage.config.tradingMode,
            storage.config.minActionableAbsoluteLevel,
          ),
        );
      }

      const dynamicTradeMemory = {
        ...slowTradingShared.clone(dynamic.defaults.tradingMemory),
        ...slowTradingShared.clone(modeState.dynamicTradeMemory),
      };
      const exchangeType = storage.config.exchangeType;
      const tradingMode = storage.config.tradingMode;
      const marketType = resolveMarketTypeForTradingMode(tradingMode);
      const exchange = getExchange(exchangeType, {
        defaultTradingMode: tradingMode,
      });

      let currentTimeMs = Date.now();
      const firstSymbol = symbols[0];
      const firstKlines = firstSymbol
        ? await profiler.time("cycle.currentTimeKlines", () =>
            exchange.getKlines({
              symbol: `${firstSymbol}_USDT`,
              interval: "5m",
              marketType,
              simpleTime: "10minute",
            }),
          )
        : [];
      const firstKline = firstKlines.at(-1);
      if (firstKline) {
        currentTimeMs = firstKline[0];
      }

      // B.1 Refresh the quote balance according to live or sandbox execution mode.
      if (isSandbox) {
        if (!dynamicTradeMemory.startingBalanceUSDT) {
          dynamicTradeMemory.startingBalanceUSDT =
            storage.runtime.sandboxInitialBalanceUSDT;
        }
        if (!dynamicTradeMemory.quoteAsset) {
          dynamicTradeMemory.quoteAsset =
            storage.runtime.sandboxInitialBalanceUSDT;
        }
      } else {
        const realQuote = await profiler.time("cycle.balanceRefresh", () =>
          exchange.getBalance("USDT_USDT"),
        );
        if (realQuote == null) {
          throw new Error("Can't fetch real balance!");
        }

        const available = realQuote.quoteAsset - dynamicTradeMemory.safeHaven;
        dynamicTradeMemory.quoteAsset = available;
        if (!dynamicTradeMemory.startingBalanceUSDT) {
          dynamicTradeMemory.startingBalanceUSDT = available;
        }
      }

      if (!isSandbox && tradingMode !== TradingMode.SPOT) {
        const selectedSymbols = new Set(symbols);
        const activePositionSymbols = slowTradingPositions.active
          .withTradeSymbols(tradeSettings)
          .map((position) =>
            slowTradingPositions.symbol.normalize(position.symbol),
          )
          .filter((symbol) => selectedSymbols.has(symbol))
          .filter(Boolean);

        if (activePositionSymbols.length > 0) {
          try {
            const [exchangePositions, latestPriceBySymbol] =
              await profiler.time("cycle.exchangePositionSync", () =>
                Promise.all([
                  exchange.getPositions(),
                  slowTradingMarket.price.buildLatestBySymbol({
                    exchange,
                    marketType,
                    symbols: activePositionSymbols,
                  }),
                ]),
              );
            const syncResult = slowTradingExchangeSync.positions.syncLiveOpen({
              currentTimeMs,
              exchangePositions,
              latestPriceBySymbol,
              modeState: { ...modeState, tradeSettings },
            });
            slowTradingBalance.reserve.subtract(
              dynamicTradeMemory,
              syncResult.releasedReserveUSDT,
            );

            if (syncResult.adjustedCount > 0 || syncResult.closedCount > 0) {
              tradeLog.log(
                "[slow-trading] synced live exchange positions",
                syncResult,
              );
            }
          } catch (error) {
            void slowTradingNotifications.operationalError
              .notify({
                source: "slow-trading:sync-exchange-positions",
                error,
                details: {
                  tradingMode,
                  exchangeType,
                },
              })
              .catch((notificationError) => {
                tradeLog.error(
                  "[slow-trading] failed to notify exchange sync error",
                  notificationError,
                );
              });
          }
        }
      }

      const modelConfig = slowTradingMarket.modelConfig.pick(storage);
      const executionModeState = { ...modeState, tradeSettings };

      // C. Filter entry signals according to trading mode and open-position safety.
      let entrySignals = rawEntrySignals;
      if (
        tradingMode === TradingMode.SPOT &&
        plan.forcedEntrySymbols.size === 0
      ) {
        entrySignals = entrySignals.filter((item) => item.l === "B");
      }
      entrySignals = slowTradingSignals.filter.withoutOpenPositions(
        executionModeState,
        entrySignals,
      );
      entrySignals = slowTradingSignals.filter.actionableVolatilityLevel(
        entrySignals,
        storage.config.minActionableAbsoluteLevel,
      );
      entrySignals = slowTradingSignals.filter.unusedVolatilityPointId(
        executionModeState,
        entrySignals,
        modelMemoryMap,
      );

      const volatilityPointsMap: Record<string, VolatilityPoint[]> = {};
      for (const symbol of Object.keys(modelMemoryMap)) {
        volatilityPointsMap[symbol] =
          modelMemoryMap[symbol].volatility?.lastVolatility ?? [];
      }

      if (plan.shouldCaptureEntry) {
        await slowTradingSidewaysExit.production.apply({
          config: storage.config,
          currentTimeMs,
          dynamicTradeMemory,
          entrySignals,
          exchange,
          exchangeType,
          marketType,
          modelMemoryMap,
          profiler,
        });
      }

      // D. Recompute the price-norm state used for dynamic sizing decisions.
      if (plan.shouldCaptureEntry) {
        await profiler.time("cycle.priceNorm", () =>
          dynamic.priceNorm.generateInitial({
            currentTimeMs,
            symbols,
            startTime: currentTimeMs,
            dynamicTradeMemory,
            useCache: true,
            exchangeType,
            volatilityMap: volatilityPointsMap,
          }),
        );
      }

      const runtime: SlowTradingCycleRuntime = {
        ...plan,
        activeMode,
        currentTimeMs,
        cycleStartedAt,
        dynamicTradeMemory,
        entrySignals,
        exchange,
        exchangeType,
        isSandbox,
        marketType,
        modelConfig,
        modelMemoryMap,
        modeState,
        performanceEntries,
        profiler,
        reports: [],
        skippedEntrySignals: [],
        storage,
        symbols,
        tradeSettings,
        tradingMode,
        volatilityPointsMap,
      };

      await slowTradingCycleEntry.execute(runtime);
      await slowTradingCycleMonitoring.execute(runtime);
      return slowTradingCycleFinalize.execute(runtime);
    }),
  );
}

/**
 * Queues a SLOW cycle so runner and manual API mutations cannot overwrite each
 * other's balance, position, cache, or mode-state persistence.
 */
export function runSlowTradingCycle(params?: RunSlowTradingCycleParams) {
  return slowTradingMutationQueue.runExclusive(() =>
    params?.account
      ? executeSlowTradingCycle(params)
      : slowTradingCycleAccounts.execute({
          executeOne: executeSlowTradingCycle,
          request: params,
        }),
  );
}

/** Grouped cycle API for executing SLOW trading service work. */
const slowTradingCycle = {
  run: runSlowTradingCycle,
  runSlowTradingCycle,
} as const;

export default slowTradingCycle;
export { slowTradingCycle };
export type { RunSlowTradingCycleParams, SlowTradingCycleResult } from "./types";
