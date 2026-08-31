import {
  assignModelMemory,
  assignVolatility,
} from "@/components/api/production/utils";
import brain, { type EntryRecommendation } from "@/lib/brain";
import dynamic, { type VolatilityPoint } from "@/lib/dynamic";
import { VOLATILITY_THRESHOLD } from "@/lib/brain/constants";
import { getExchange, TradingMode } from "@/lib/exchange";
import exchangeFundingRate from "@/lib/exchange/funding-rate";
import { resolveMarketTypeForTradingMode } from "@/lib/exchange/utils";
import trading, { type TradingReturn } from "@/lib/trading";
import blackSwan from "@/lib/trading/black-swan";
import type { Position } from "@/lib/trading/models";
import slowTradingReporting from "./reporting";
import slowTradingStorage from "./storage";
import slowTradingWatchReserve from "./watch-reserve";
import type { SlowTradingMode, SlowTradingModeState } from "./types";
import slowTradingBalance from "./balance";
import slowTradingCache from "./cache";
import slowTradingExchangeSync from "./exchange-sync";
import slowTradingMarket from "./market";
import slowTradingNotifications from "./notifications";
import slowTradingPerformance, {
  type SlowTradingCyclePerformanceEntry,
  type SlowTradingCyclePerformanceObserver,
} from "./performance";
import slowTradingMarketVolume from "./market-volume";
import slowTradingPositions from "./positions";
import slowTradingSignals from "./signals";
import slowTradingShared, {
  type SlowTradingSkippedEntrySignal,
} from "./shared";
import slowTradingSidewaysExit from "./exit-sideways";
import slowTradingAutoRemoveSymbols from "./auto-remove-symbols";
import { tradeLog } from "@/lib/trading/helper/log";
import slowTradingStages, { type SlowTradingStage } from "./stages";
import slowTradingMutationQueue from "./mutation-queue";
import slowTradingStageRun from "./stage-run";
import slowTradingBlackSwan from "./black-swan";
import slowTradingDailyPnlLimit, {
  type DailyPnlLimitEvaluation,
} from "./daily-pnl-limit";

/** Reads only today's archived trades and evaluates the navbar-style daily PnL stop. */
async function evaluateCurrentDailyPnlLimit(params: {
  currentTimeMs: number;
  includePendingArchive?: boolean;
  mode: SlowTradingMode;
  modeState: SlowTradingModeState;
  thresholdUsdt: number;
}): Promise<DailyPnlLimitEvaluation> {
  const period = slowTradingDailyPnlLimit.period.getCurrentUtc(
    params.currentTimeMs,
  );
  // PROD:MULTI_ACCOUNT_COMBINED_DAILY_PNL
  // History files are shared, so always recompute from every account instead of
  // trusting an account-scoped cache from a previous cycle.
  const archived = (
    await Promise.all(
      (["live", "sandbox"] as const).map((mode) =>
        slowTradingStorage.history.readRange({
          endTime: period.endTime,
          mode,
          startTime: period.startTime,
        }),
      ),
    )
  ).flat();
  let pnlUsdt = slowTradingDailyPnlLimit.pnl.sumForUtcDay(
    archived,
    period.day,
  );

  if (params.includePendingArchive) {
    const pendingArchive = params.modeState.tradeSettings.flatMap(
      (tradeSetting) => tradeSetting.model_memory.positionsSell ?? [],
    );
    pnlUsdt += slowTradingDailyPnlLimit.pnl.sumForUtcDay(
      pendingArchive,
      period.day,
    );
  }

  return slowTradingDailyPnlLimit.guard.evaluatePnl({
    currentTimeMs: params.currentTimeMs,
    pnlUsdt,
    thresholdUsdt: params.thresholdUsdt,
  });
}

interface RunSlowTradingCycleParams {
  /** Immutable account slug. Omit to run every eligible account sequentially. */
  account?: string;
  bypass?: boolean;
  ignoreRunnerEnabled?: boolean;
  forceExitSymbols?: string[];
  forceEntrySymbols?: string[];
  disableAutoEntry?: boolean;
  stage?: SlowTradingStage;
  performance?: SlowTradingCyclePerformanceObserver;
}

interface SlowTradingCycleResult {
  mode: SlowTradingMode;
  stage?: SlowTradingStage;
  symbols: string[];
  reports: TradingReturn[];
  executedEntrySignals: number;
  skippedEntrySignals: SlowTradingSkippedEntrySignal[];
  availableQuoteAsset: number;
  lastRunAt?: number;
  lastRunDurationMs?: number;
  skipped?: boolean;
}

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
      const blackSwanProtectionActive =
        blackSwan.state.isProtective(modeState.blackSwan) ||
        slowTradingBlackSwan.runtime.isProtectionPending(activeMode);
      const stage = params?.stage;
      const speedupCriteria = {
        negativePnlThresholdPct:
          storage.runtime.speedupStageNegativePnlThresholdPct,
        positivePnlThresholdPct:
          storage.runtime.speedupStagePositivePnlThresholdPct,
        takeProfitOffsetPct: storage.runtime.speedupStageTakeProfitOffsetPct,
        takeProfitPercent: storage.config.modelConfig.takeProfitPercent,
        useStopLossPlus: storage.config.modelConfig.useStopLossPlus,
        volatilityThresholdPct: VOLATILITY_THRESHOLD,
      };
      const stageSymbols = stage
        ? slowTradingStages.symbols.select({
            configuredSymbols: storage.config.symbols,
            modeState,
            speedupNegativePnlThresholdPct:
              speedupCriteria.negativePnlThresholdPct,
            speedupPositivePnlThresholdPct:
              speedupCriteria.positivePnlThresholdPct,
            speedupTakeProfitOffsetPct: speedupCriteria.takeProfitOffsetPct,
            stage,
            takeProfitPercent: speedupCriteria.takeProfitPercent,
            useStopLossPlus: speedupCriteria.useStopLossPlus,
            volatilityThresholdPct: speedupCriteria.volatilityThresholdPct,
          })
        : null;
      const monitoringStage =
        stage === "speedup"
          ? "speedup"
          : stage === "standard-monitoring"
            ? "standard"
            : undefined;
      const monitoringReasonByPosition: Record<string, string> = {};
      if (monitoringStage && stageSymbols) {
        const selectedSymbols = new Set(stageSymbols);
        for (const tradeSetting of modeState.tradeSettings) {
          const symbol = String(tradeSetting.symbol || "")
            .trim()
            .toUpperCase();
          if (!selectedSymbols.has(symbol)) {
            continue;
          }

          const volatilityPoints =
            tradeSetting.model_memory.volatility?.lastVolatility ?? [];
          for (const position of (tradeSetting.model_memory.positions ??
            []) as Position[]) {
            if (position.closed) {
              continue;
            }
            const reasons = slowTradingStages.position.getSpeedupReasons({
              ...speedupCriteria,
              latestVolatilityPoint: volatilityPoints.at(-1),
              position,
              volatilityPoints,
            });
            monitoringReasonByPosition[
              slowTradingReporting.positions.monitoringKey(symbol, position)
            ] =
              reasons.length > 0
                ? slowTradingStages.position.describeSpeedupReasons(reasons)
                : monitoringStage === "standard"
                  ? slowTradingStages.position.describeStandardReason({
                      negativePnlThresholdPct:
                        speedupCriteria.negativePnlThresholdPct,
                      positivePnlThresholdPct:
                        speedupCriteria.positivePnlThresholdPct,
                      position,
                    })
                  : "Symbol selected for Speedup monitoring";
          }
        }
      }
      const shouldCaptureEntry = !stage || stage === "capture-entry";
      const shouldMonitor =
        !stage || stage === "speedup" || stage === "standard-monitoring";
      const forcedExitSymbols = new Set(
        (params?.forceExitSymbols ?? [])
          .map((symbol) =>
            String(symbol || "")
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean),
      );
      const forcedEntrySymbols = new Set(
        (params?.forceEntrySymbols ?? [])
          .map((symbol) =>
            String(symbol || "")
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean),
      );
      if (!storage.runtime.runnerEnabled && !params?.ignoreRunnerEnabled) {
        const availableQuoteAsset =
          (modeState.dynamicTradeMemory.quoteAsset ?? 0) +
          (modeState.dynamicTradeMemory.safeHaven ?? 0);
        return {
          mode: activeMode as SlowTradingMode,
          stage,
          symbols: stageSymbols ?? [],
          reports: [],
          executedEntrySignals: 0,
          skippedEntrySignals: [],
          availableQuoteAsset,
          lastRunAt: modeState.lastRunAt,
          skipped: true,
        };
      }
      let dailyPnlLimitThresholdUsdt =
        storage.runtime.autoEntryDailyPnlLimitUSDT;
      let dailyPnlLimitEvaluation = slowTradingDailyPnlLimit.guard.evaluate({
        currentTimeMs: cycleStartedAt,
        positions: [],
        thresholdUsdt: dailyPnlLimitThresholdUsdt,
      });
      if (shouldCaptureEntry && forcedEntrySymbols.size === 0) {
        dailyPnlLimitEvaluation = await profiler.time(
          "cycle.dailyPnlLimit",
          () =>
            evaluateCurrentDailyPnlLimit({
              currentTimeMs: cycleStartedAt,
              mode: activeMode,
              modeState,
              thresholdUsdt: dailyPnlLimitThresholdUsdt,
            }),
        );
        modeState.dailyPnlLimitState = {
          d: dailyPnlLimitEvaluation.day,
          usdt: dailyPnlLimitEvaluation.pnlUsdt,
        };
        await slowTradingNotifications.dailyPnlLimit.notify({
          currentTimeMs: cycleStartedAt,
          evaluation: dailyPnlLimitEvaluation,
          exchangeType: storage.config.exchangeType,
          mode: activeMode,
          modeState,
          notification: storage.runtime.notification,
        });
      }
      const shouldAutoEnter =
        storage.account.enabled &&
        !blackSwanProtectionActive &&
        (stage === "capture-entry" && stageSymbols?.length === 0
          ? false
          : shouldCaptureEntry && forcedEntrySymbols.size > 0
            ? true
            : !shouldCaptureEntry || params?.disableAutoEntry === true
              ? false
              : storage.runtime.autoEntryEnabled &&
                !dailyPnlLimitEvaluation.reached);
      const shouldAutoExit =
        shouldMonitor &&
        (storage.runtime.autoExitEnabled || forcedExitSymbols.size > 0);
      const bypass = params?.bypass ?? storage.runtime.entrySignalBypass;

      if (stage && stageSymbols?.length === 0) {
        const availableQuoteAsset =
          (modeState.dynamicTradeMemory.quoteAsset ?? 0) +
          (modeState.dynamicTradeMemory.safeHaven ?? 0);
        const summary =
          `${activeMode} ${stage} cycle finished with 0 eligible symbol(s)` +
          ` | auto entry ${shouldAutoEnter ? "on" : "off"}` +
          ` | auto exit ${shouldAutoExit ? "on" : "off"}`;

        const runStats = slowTradingStageRun.recordCompleted({
          cycleStartedAt,
          modeState,
          performanceEntries,
          reports: 0,
          stage,
          summary,
          symbols: 0,
        });
        storage.modes[activeMode] = modeState;
        // Empty heartbeats use one memory write and intentionally do not time
        // that write, avoiding recursive persistence just to record its duration.
        await slowTradingStorage.mode.saveState(activeMode, modeState, {
          account: storage.account.slug,
        });

        return {
          mode: activeMode as SlowTradingMode,
          stage,
          symbols: [],
          reports: [],
          executedEntrySignals: 0,
          skippedEntrySignals: [],
          availableQuoteAsset,
          lastRunAt: runStats.t,
          lastRunDurationMs: runStats.ms,
        };
      }

      // A.1 Prepare the mode balance context before signal generation.
      const isSandbox = activeMode === "sandbox";
      if (isSandbox) {
        slowTradingBalance.sandbox.ensureBalance(
          modeState,
          storage.runtime.sandboxInitialBalanceUSDT,
        );
      }

      const signalBuildResult = shouldAutoEnter
        ? await profiler.time("signals.build", () =>
            slowTradingSignals.build({
              storage,
              bypass,
              forceEntrySymbols: Array.from(forcedEntrySymbols),
              symbols: stageSymbols ?? undefined,
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
      if (forcedExitSymbols.size > 0) {
        for (const tradeSetting of tradeSettings) {
          const symbol = String(tradeSetting.symbol || "")
            .trim()
            .toUpperCase();
          if (
            forcedExitSymbols.has(symbol) &&
            (tradeSetting.model_memory.positions?.length ?? 0) > 0
          ) {
            tradeSetting.model_memory.forceSell = true;
          }
        }
      }

      if (shouldAutoEnter && forcedEntrySymbols.size > 0) {
        for (const tradeSetting of tradeSettings) {
          const symbol = String(tradeSetting.symbol || "")
            .trim()
            .toUpperCase();
          if (
            forcedEntrySymbols.has(symbol) &&
            (tradeSetting.model_memory.positions?.length ?? 0) === 0
          ) {
            tradeSetting.model_memory.justBuy = true;
          }
        }
      }

      const symbols = Array.from(
        new Set([
          ...(signalBuildResult?.symbols ??
            stageSymbols ??
            slowTradingShared.symbols.buildExecution(storage.config.symbols)),
          ...forcedExitSymbols,
        ]),
      );
      const modelMemoryMap: Record<string, any> =
        signalBuildResult?.modelMemoryMap ?? {};
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
      if (tradingMode === TradingMode.SPOT && forcedEntrySymbols.size === 0) {
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

      if (shouldCaptureEntry) {
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
      if (shouldCaptureEntry) {
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

      void slowTradingNotifications.highVolatility
        .notify({
          modeState,
          volatilityPointsMap,
          exchangeType,
          notification: storage.runtime.notification,
        })
        .catch((notificationError) => {
          tradeLog.error(
            "[slow-trading] failed to notify high volatility",
            notificationError,
          );
        });

      const reports: TradingReturn[] = [];
      const skippedEntrySignals: SlowTradingSkippedEntrySignal[] = [];
      let entryGuardMinimumPrice =
        storage.runtime.autoRemoveSymbolMinPrice ?? 0;
      if (shouldAutoEnter && entrySignals.length > 0) {
        const latestEntryGuardStorage = await profiler.time(
          "storage.load",
          () => slowTradingStorage.data.load({ modeScope: "active" }),
        );
        const latestProtectionActive =
          blackSwan.state.isProtective(
            latestEntryGuardStorage.modes[activeMode]?.blackSwan,
          ) || slowTradingBlackSwan.runtime.isProtectionPending(activeMode);
        if (latestProtectionActive) {
          for (const entrySignal of entrySignals) {
            slowTradingShared.entrySignals.addSkipped(skippedEntrySignals, {
              symbol: String(entrySignal.symbol || "")
                .trim()
                .toUpperCase(),
              reason:
                "Entry blocked because Black Swan protection activated " +
                "after this cycle prepared its signals.",
            });
          }
          entrySignals = [];
          for (const tradeSetting of tradeSettings) {
            tradeSetting.model_memory.justBuy = false;
          }
        }
        const latestConfiguredSymbols = new Set(
          latestEntryGuardStorage.config.symbols.map((symbol) =>
            String(symbol || "")
              .trim()
              .toUpperCase(),
          ),
        );
        entryGuardMinimumPrice =
          latestEntryGuardStorage.runtime.autoRemoveSymbolMinPrice ?? 0;
        if (forcedEntrySymbols.size === 0) {
          dailyPnlLimitThresholdUsdt =
            latestEntryGuardStorage.runtime.autoEntryDailyPnlLimitUSDT;
          dailyPnlLimitEvaluation = await profiler.time(
            "cycle.dailyPnlLimit",
            () =>
              evaluateCurrentDailyPnlLimit({
                currentTimeMs: Date.now(),
                mode: activeMode,
                modeState,
                thresholdUsdt: dailyPnlLimitThresholdUsdt,
              }),
          );
          modeState.dailyPnlLimitState = {
            d: dailyPnlLimitEvaluation.day,
            usdt: dailyPnlLimitEvaluation.pnlUsdt,
          };
          if (dailyPnlLimitEvaluation.reached) {
            for (const entrySignal of entrySignals) {
              slowTradingShared.entrySignals.addSkipped(
                skippedEntrySignals,
                {
                  symbol: String(entrySignal.symbol || "")
                    .trim()
                    .toUpperCase(),
                  reason:
                    slowTradingDailyPnlLimit.guard.describe(
                      dailyPnlLimitEvaluation,
                    ),
                },
              );
            }
            entrySignals = [];
          }
          await slowTradingNotifications.dailyPnlLimit.notify({
            currentTimeMs: Date.now(),
            evaluation: dailyPnlLimitEvaluation,
            exchangeType: latestEntryGuardStorage.config.exchangeType,
            mode: activeMode,
            modeState,
            notification: latestEntryGuardStorage.runtime.notification,
          });
        }
        entrySignals = entrySignals.filter((entrySignal) => {
          const symbol = String(entrySignal.symbol || "")
            .trim()
            .toUpperCase();
          if (latestConfiguredSymbols.has(symbol)) {
            return true;
          }

          slowTradingShared.entrySignals.addSkipped(skippedEntrySignals, {
            symbol,
            reason:
              `Entry blocked because ${symbol} is no longer in the latest ` +
              "Coin Management Symbols config.",
          });
          return false;
        });
      }

      let volume24hBySymbol: Record<string, number> = {};
      if (
        shouldAutoEnter &&
        entrySignals.length > 0 &&
        (storage.config.maxEntryBased24HourVolPct ?? 0.2) > 0
      ) {
        try {
          const snapshot = await profiler.time("cycle.volume24hRefresh", () =>
            slowTradingMarketVolume.snapshot.refresh({
              exchangeType,
              marketType,
              symbols,
            }),
          );
          volume24hBySymbol = snapshot.volumes;
        } catch (error) {
          tradeLog.error("[slow-trading] failed to refresh 24h volume", error);
          const snapshot = await profiler.time("cycle.volume24hRead", () =>
            slowTradingMarketVolume.snapshot.read(exchangeType, marketType),
          );
          volume24hBySymbol = snapshot?.volumes ?? {};
        }
      }

      if (forcedEntrySymbols.size > 0) {
        const entrySignalSymbols = new Set(
          entrySignals
            .map((signal) =>
              String(signal.symbol || "")
                .trim()
                .toUpperCase(),
            )
            .filter(Boolean),
        );

        for (const symbol of forcedEntrySymbols) {
          if (!entrySignalSymbols.has(symbol)) {
            slowTradingShared.entrySignals.addSkipped(skippedEntrySignals, {
              symbol,
              reason: slowTradingSignals.forcedEntry.getSkipReason({
                symbol,
                configuredSymbols: storage.config.symbols,
                minActionableAbsoluteLevel:
                  storage.config.minActionableAbsoluteLevel,
                modeState: executionModeState,
                modelMemoryMap,
              }),
            });
          }
        }
      }

      // E. Try to open new positions when auto-entry is enabled.
      if (shouldAutoEnter && entrySignals.length > 0) {
        // PROD:CAPTURE_ENTRY_STAGE
        const currentBalance = dynamic.balance.countGrowthOvertime({
          timeMs: currentTimeMs,
          dynamicTradeMemory,
          modelMemoryMap,
          volatilityMap: volatilityPointsMap,
        });

        let investAmount = brain.algorithms.runtime.getInvestmentAmount({
          dynamicTradeMemory,
          currentBalance,
          allocationPercent: 1,
          recommendedPositionsLength: entrySignals.length,
        });

        if (bypass) {
          investAmount = Math.min(investAmount, 10);
        }

        if (investAmount >= trading.constants.MINIMAL_USDT_TO_TRADE) {
          for (const entrySignal of entrySignals) {
            if (slowTradingBlackSwan.runtime.isProtectionPending(activeMode)) {
              slowTradingShared.entrySignals.addSkipped(skippedEntrySignals, {
                symbol: String(entrySignal.symbol || "")
                  .trim()
                  .toUpperCase(),
                reason:
                  "Entry blocked because Black Swan protection activated " +
                  "at the final execution boundary.",
              });
              continue;
            }
            const entrySymbol = String(entrySignal.symbol || "")
              .trim()
              .toUpperCase();
            const entryModelMemory = modelMemoryMap[entrySymbol];

            if (entryGuardMinimumPrice > 0) {
              const latestExecutionPriceBySymbol = await profiler.time(
                "cycle.coinManagementPrices",
                () =>
                  slowTradingMarket.price.buildLatestBySymbol({
                    exchange,
                    marketType,
                    symbols: [entrySymbol],
                  }),
              );
              const latestExecutionPrice =
                latestExecutionPriceBySymbol[entrySymbol];

              if (
                slowTradingAutoRemoveSymbols.price.isBelowMinimum({
                  price: latestExecutionPrice,
                  minimumPrice: entryGuardMinimumPrice,
                })
              ) {
                slowTradingShared.entrySignals.addSkipped(skippedEntrySignals, {
                  symbol: entrySymbol,
                  reason:
                    `Entry blocked because ${entrySymbol}'s fresh price ` +
                    `${latestExecutionPrice} USDT is below the configured ` +
                    `Coin Management minimum of ${entryGuardMinimumPrice} USDT.`,
                });
                continue;
              }
            }

            const report = await profiler.time("cycle.entryExecution", () =>
              trading.execution.entry({
                investAmount,
                entrySignal,
                modelConfig,
                modelMemory: entryModelMemory,
                exchangeType,
                tradingMode,
                bypass,
                notificationTarget: {
                  dashboard: "SLOW",
                  // PROD:NOTIF_ENTRY
                  successKey: "NOTIF_ENTRY",
                  // PROD:NOTIF_ENTRY_FAILED
                  failureKey: "NOTIF_ENTRY_FAILED",
                },
                simulate: isSandbox,
                balanceOverride: isSandbox
                  ? {
                      quoteAsset: dynamicTradeMemory.quoteAsset,
                      baseAsset: 0,
                    }
                  : undefined,
                executionMode: activeMode,
                reservedQuoteAsset: dynamicTradeMemory.reservedQuoteAsset,
                dynamicTradeConfig: storage.config,
                allModelMemories: Object.values(modelMemoryMap),
                volume24h:
                  volume24hBySymbol[
                    String(entrySignal.symbol || "")
                      .trim()
                      .toUpperCase()
                  ],
              }),
            );

            reports.push(report);

            if (report.tradingDetail?.action === "BUY") {
              slowTradingWatchReserve.volatilityPoint.markUsed({
                entrySignal,
                modelMemory: entryModelMemory,
              });

              dynamicTradeMemory.quoteAsset =
                slowTradingWatchReserve.money.roundUsdt(
                  (dynamicTradeMemory.quoteAsset ?? 0) +
                    report.tradingDetail.usdtSpent,
                );

              slowTradingBalance.reserve.addForLatestEntry(
                dynamicTradeMemory,
                entryModelMemory,
              );
            } else {
              slowTradingShared.entrySignals.addSkipped(skippedEntrySignals, {
                symbol: String(entrySignal.symbol || "")
                  .trim()
                  .toUpperCase(),
                reason: report.message,
              });
            }
          }
        } else {
          for (const entrySignal of entrySignals) {
            slowTradingShared.entrySignals.addSkipped(skippedEntrySignals, {
              symbol: String(entrySignal.symbol || "")
                .trim()
                .toUpperCase(),
              reason:
                `Entry budget ${investAmount.toFixed(2)} USDT is below minimum ` +
                `${trading.constants.MINIMAL_USDT_TO_TRADE.toFixed(2)} USDT`,
            });
          }
        }
      }

      // G. Process exit logic for any currently open positions.
      // PROD:MONITORING_OPEN_POSITION
      const hasForcedPositionExit = Object.values(modelMemoryMap).some(
        (modelMemory) =>
          (modelMemory.positions ?? []).some(
            (position: Position) => position.control?.forceExit !== undefined,
          ),
      );
      const selectedExecutionSymbols = new Set(symbols);
      const symbolsToExit =
        shouldAutoExit || hasForcedPositionExit
          ? tradeSettings.filter((item) => {
              const symbol = String(item.symbol || "")
                .trim()
                .toUpperCase();
              if (!selectedExecutionSymbols.has(symbol)) {
                return false;
              }

              const modelMemory = modelMemoryMap[item.symbol ?? ""];
              const hasOpenPositions =
                (modelMemory?.positions ?? []).length > 0;
              if (!hasOpenPositions) {
                return false;
              }

              const hasForceSellPosition = (modelMemory?.positions ?? []).some(
                (position: Position) =>
                  position.control?.forceExit !== undefined,
              );
              if (storage.runtime.autoExitEnabled || hasForceSellPosition) {
                return true;
              }

              return forcedExitSymbols.has(symbol);
            })
          : [];

      for (const trade of symbolsToExit) {
        const modelMemory = modelMemoryMap[trade.symbol ?? ""];
        const reservedBefore = slowTradingBalance.reserve.getOpen(modelMemory);
        const report = await profiler.time("cycle.exitExecution", () =>
          trading.execution.exit({
            symbol: trade.symbol ?? "",
            modelConfig,
            modelMemory,
            exchangeType,
            tradingMode,
            bypass: false,
            notificationTarget: {
              dashboard: "SLOW",
              // PROD:NOTIF_EXIT
              successKey: "NOTIF_EXIT",
              // PROD:NOTIF_EXIT_FAILED
              failureKey: "NOTIF_EXIT_FAILED",
            },
            simulate: isSandbox,
            balanceOverride: isSandbox
              ? {
                  quoteAsset: dynamicTradeMemory.quoteAsset,
                  baseAsset: 0,
                }
              : undefined,
          }),
        );

        reports.push(report);

        if (isSandbox && report.tradingDetail) {
          dynamicTradeMemory.quoteAsset = report.tradingDetail.finalBalance;
        }

        if (report.tradingDetail?.action === "SELL") {
          const reservedAfter = slowTradingBalance.reserve.getOpen(modelMemory);
          slowTradingBalance.reserve.subtract(
            dynamicTradeMemory,
            Math.max(0, reservedBefore - reservedAfter),
          );
          slowTradingBalance.reserve.releaseClosedPosition(modelMemory);
        }
      }

      if (
        reports.some((report) => report.tradingDetail?.action === "SELL")
      ) {
        dailyPnlLimitEvaluation = await profiler.time(
          "cycle.dailyPnlLimit",
          () =>
            evaluateCurrentDailyPnlLimit({
              currentTimeMs,
              includePendingArchive: true,
              mode: activeMode,
              modeState: { ...modeState, tradeSettings },
              thresholdUsdt: dailyPnlLimitThresholdUsdt,
            }),
        );
        modeState.dailyPnlLimitState = {
          d: dailyPnlLimitEvaluation.day,
          usdt: dailyPnlLimitEvaluation.pnlUsdt,
        };
        await slowTradingNotifications.dailyPnlLimit.notify({
          currentTimeMs,
          evaluation: dailyPnlLimitEvaluation,
          exchangeType,
          mode: activeMode,
          modeState,
          notification: storage.runtime.notification,
        });
      }

      // G.1 Average only positions that remain open after exit evaluation.
      if (
        shouldMonitor &&
        storage.config.enableWatchLogic &&
        !blackSwanProtectionActive &&
        !slowTradingBlackSwan.runtime.isProtectionPending(activeMode)
      ) {
        // BOTH:WATCH_MECHANISM
        const selectedSymbols = new Set(symbols);
        const allActivePositions = slowTradingPositions.active
          .withTradeSymbols(tradeSettings)
          .filter((position) =>
            selectedSymbols.has(
              slowTradingPositions.symbol.normalize(position.symbol),
            ),
          );

        const watchResult =
          slowTradingWatchReserve.averaging.generateRecommendations({
            activePositions: allActivePositions,
            volatilityPointsMap,
            config: storage.config,
            quoteAsset: dynamicTradeMemory.quoteAsset,
            reservedQuoteAsset: dynamicTradeMemory.reservedQuoteAsset,
          });

        const recommendationBySymbol = new Map(
          watchResult.recommendations
            .filter((rec) => rec.symbol)
            .map((rec) => [rec.symbol!.toUpperCase(), rec]),
        );
        const recommendedSymbols = new Set(
          watchResult.recommendations
            .map((rec) => rec.symbol?.toUpperCase())
            .filter(Boolean),
        );
        const symbolsToAverage = tradeSettings.filter((item) => {
          const symbol = item.symbol?.toUpperCase();
          return (
            symbol &&
            selectedSymbols.has(symbol) &&
            recommendedSymbols.has(symbol) &&
            (modelMemoryMap[symbol]?.positions?.length ?? 0) > 0
          );
        });

        for (const trade of symbolsToAverage) {
          if (slowTradingBlackSwan.runtime.isProtectionPending(activeMode)) {
            break;
          }
          const modelMemory = modelMemoryMap[trade.symbol ?? ""];
          const recommendation = recommendationBySymbol.get(
            (trade.symbol ?? "").toUpperCase(),
          );
          const reservedBefore =
            slowTradingBalance.reserve.getOpen(modelMemory);
          const report = await profiler.time("cycle.averagingExecution", () =>
            trading.execution.averaging({
              symbol: trade.symbol ?? "",
              modelConfig,
              modelMemory,
              volatilityPoints: volatilityPointsMap[trade.symbol ?? ""] ?? [],
              exchangeType,
              tradingMode,
              bypass: false,
              balanceOverride: {
                quoteAsset: dynamicTradeMemory.quoteAsset,
                baseAsset: 0,
              },
              reservedQuoteAsset: dynamicTradeMemory.reservedQuoteAsset,
              averagingRecommendation: recommendation,
              adaptiveAveraging: storage.config.adaptiveAveraging,
              averagingRescueProjectionGuardEnabled:
                storage.config.averagingRescueProjectionGuardEnabled !== false,
            }),
          );

          reports.push(report);

          if (report.tradingDetail?.action === "BUY") {
            const reservedAfter =
              slowTradingBalance.reserve.getOpen(modelMemory);
            slowTradingBalance.reserve.subtract(
              dynamicTradeMemory,
              Math.max(0, reservedBefore - reservedAfter),
            );

            dynamicTradeMemory.quoteAsset =
              slowTradingWatchReserve.money.roundUsdt(
                (dynamicTradeMemory.quoteAsset ?? 0) +
                  report.tradingDetail.usdtSpent,
              );
          }
        }
      }

      // H. Refresh final live balance and persist all updated execution state.
      if (!isSandbox) {
        const realQuoteFinal = await profiler.time("cycle.balanceRefresh", () =>
          exchange.getBalance("USDT_USDT"),
        );
        if (realQuoteFinal == null) {
          throw new Error("Can't fetch real balance!");
        }

        dynamicTradeMemory.quoteAsset =
          realQuoteFinal.quoteAsset - dynamicTradeMemory.safeHaven;
      }

      const persistedTradeSymbols = Array.from(
        new Set([
          ...storage.config.symbols,
          ...Object.entries(modelMemoryMap)
            .filter(
              ([, modelMemory]) =>
                (modelMemory?.positions?.length ?? 0) > 0 ||
                (modelMemory?.positionsSell?.length ?? 0) > 0,
            )
            .map(([symbol]) =>
              String(symbol || "")
                .trim()
                .toUpperCase(),
            )
            .filter(Boolean),
        ]),
      ).sort((a, b) => a.localeCompare(b));

      modeState.tradeSettings = persistedTradeSymbols.map((symbol) => ({
        symbol,
        model_memory: {
          positions: [],
          ...slowTradingShared.clone(modelMemoryMap[symbol] ?? {}),
        },
      }));

      void slowTradingNotifications.openPositions
        .notify({
          positions: slowTradingPositions.active.withTradeSymbols(
            modeState.tradeSettings,
          ),
          volatilityPointsMap,
          exchangeType,
          mode: activeMode,
          notification: storage.runtime.notification,
          currentTimeMs,
        })
        .catch((notificationError) => {
          tradeLog.error(
            "[slow-trading] failed to notify open positions",
            notificationError,
          );
        });

      if (shouldMonitor) {
        const reportingSymbolSet = new Set(symbols);
        const reportingSymbols = modeState.tradeSettings
          .filter(
            (tradeSetting) =>
              reportingSymbolSet.has(
                String(tradeSetting.symbol || "")
                  .trim()
                  .toUpperCase(),
              ) && (tradeSetting.model_memory.positions?.length ?? 0) > 0,
          )
          .map((tradeSetting) => tradeSetting.symbol);
        const [latestPriceBySymbol, fundingRateBySymbol] =
          reportingSymbols.length > 0
            ? await Promise.all([
                profiler.time("cycle.latestPrices", () =>
                  slowTradingMarket.price.buildLatestBySymbol({
                    exchange,
                    marketType,
                    symbols: reportingSymbols,
                  }),
                ),
                tradingMode === TradingMode.FUTURES
                  ? profiler
                      .time("cycle.fundingRates", () =>
                        exchangeFundingRate.latest.map({
                          exchangeType,
                          tradingMode,
                          symbols: reportingSymbols,
                        }),
                      )
                      .catch((fundingError) => {
                        // Funding is supplementary monitoring data. Never let a
                        // failed public snapshot stop position management.
                        tradeLog.error(
                          "[slow-trading] failed to refresh position funding rates",
                          fundingError,
                        );
                        return {};
                      })
                  : Promise.resolve({}),
              ])
            : [{}, {}];
        // PROD:MONITORING_OPEN_POSITION
        await profiler.time("cycle.reportingSync", () =>
          slowTradingReporting.modeState.sync({
            exchangeType,
            fundingRateBySymbol,
            historyBucketMinutes: storage.runtime.pnlHistoryBucketMinutes,
            modeState,
            latestPriceBySymbol,
            currentTimeMs,
            updatedAtMs: Date.now(),
            monitoring: monitoringStage
              ? {
                  stage: monitoringStage,
                  reasonByPosition: monitoringReasonByPosition,
                }
              : undefined,
          }),
        );
      }

      modeState.dynamicTradeMemory = {
        ...slowTradingShared.clone(dynamic.defaults.tradingMemory),
        ...slowTradingShared.clone(dynamicTradeMemory),
      };
      const lastRunSummary =
        `${activeMode}${stage ? ` ${stage}` : ""} cycle finished with ${reports.length} report(s)` +
        ` | auto entry ${shouldAutoEnter ? "on" : "off"}` +
        ` | auto exit ${shouldAutoExit ? "on" : "off"}`;
      slowTradingStageRun.recordCompleted({
        cycleStartedAt,
        modeState,
        performanceEntries,
        reports: reports.length,
        stage,
        summary: lastRunSummary,
        symbols: symbols.length,
      });

      // H.1 Persist cache files, then persist the mode snapshot itself.
      await profiler.time("cycle.cachePersist", () =>
        slowTradingCache.modeState.persistCaches({
          exchangeType,
          modeState,
        }),
      );
      storage.modes[activeMode] = modeState;
      await profiler.time("cycle.modeStatePersist", () =>
        slowTradingStorage.mode.saveState(activeMode, modeState, {
          account: storage.account.slug,
        }),
      );

      // Report the previous fully closed UTC day after its trades are archived.
      await slowTradingNotifications.dailyPerformance.notify({
        currentTimeMs: Date.now(),
        exchangeType,
        mode: activeMode,
        modeState,
        notification: storage.runtime.notification,
      });

      slowTradingStageRun.recordCompleted({
        cycleStartedAt,
        modeState,
        performanceEntries,
        reports: reports.length,
        stage,
        summary: lastRunSummary,
        symbols: symbols.length,
      });
      storage.modes[activeMode] = modeState;
      await slowTradingStorage.mode.saveState(activeMode, modeState, {
        account: storage.account.slug,
      });

      // H.2 Calculate total asset and capture daily snapshot.
      let totalLockedQuoteAsset = 0;
      for (const tradeSetting of modeState.tradeSettings) {
        for (const pos of tradeSetting.model_memory.positions ?? []) {
          totalLockedQuoteAsset +=
            slowTradingWatchReserve.balance.getLockedQuoteAssetValue({
              activePositions: [pos],
            });
        }
      }

      const availableQuoteAsset =
        (modeState.dynamicTradeMemory.quoteAsset ?? 0) +
        (modeState.dynamicTradeMemory.safeHaven ?? 0);
      const snapshotTotal = availableQuoteAsset + totalLockedQuoteAsset;

      void slowTradingStorage.balanceSnapshots.upsert({
        mode: activeMode as SlowTradingMode,
        total: snapshotTotal,
        timestamp: currentTimeMs,
      });

      return {
        mode: activeMode as SlowTradingMode,
        stage,
        symbols,
        reports,
        executedEntrySignals: reports.filter(
          (report) => report.tradingDetail?.action === "BUY",
        ).length,
        skippedEntrySignals,
        availableQuoteAsset,
        lastRunAt: modeState.lastRunAt,
        lastRunDurationMs: modeState.lastRunDurationMs,
      };
    }),
  );
}

/** Runs enabled accounts plus disabled accounts that still own open positions. */
async function executeAllSlowTradingAccounts(
  params?: RunSlowTradingCycleParams,
): Promise<SlowTradingCycleResult> {
  const catalog = await slowTradingStorage.data.load({ modeScope: "active" });
  const results: SlowTradingCycleResult[] = [];

  // PROD:MULTI_ACCOUNT_SEQUENTIAL_CYCLE
  for (const account of catalog.runtime.exchangeAccounts) {
    try {
      const scopedStorage = await slowTradingStorage.data.load({
        account: account.slug,
        modeScope: "active",
      });
      const activeMode = slowTradingStorage.mode.getActive(scopedStorage);
      const hasOpenPositions = scopedStorage.modes[
        activeMode
      ].tradeSettings.some((tradeSetting) =>
        (tradeSetting.model_memory.positions ?? []).some(
          (position) => !position.closed,
        ),
      );
      if (!account.enabled && !hasOpenPositions) continue;

      // PROD:MULTI_ACCOUNT_DISABLED_ENTRY_ONLY
      results.push(
        await executeSlowTradingCycle({
          ...params,
          account: account.slug,
          disableAutoEntry: params?.disableAutoEntry || !account.enabled,
        }),
      );
    } catch (error) {
      // PROD:MULTI_ACCOUNT_FAILURE_ISOLATION
      tradeLog.error(`account cycle failed | account=${account.slug}`, error);
      await slowTradingNotifications.operationalError.notify({
        source: `cycle.account.${account.slug}`,
        error,
      });
    }
  }

  const first = results[0];
  if (!first) {
    const activeMode = slowTradingStorage.mode.getActive(catalog);
    const modeState = catalog.modes[activeMode];
    return {
      mode: activeMode,
      stage: params?.stage,
      symbols: [],
      reports: [],
      executedEntrySignals: 0,
      skippedEntrySignals: [],
      availableQuoteAsset: 0,
      lastRunAt: modeState.lastRunAt,
      skipped: true,
    };
  }

  return {
    ...first,
    symbols: Array.from(new Set(results.flatMap((result) => result.symbols))),
    reports: results.flatMap((result) => result.reports),
    executedEntrySignals: results.reduce(
      (total, result) => total + result.executedEntrySignals,
      0,
    ),
    skippedEntrySignals: results.flatMap(
      (result) => result.skippedEntrySignals,
    ),
    availableQuoteAsset: results.reduce(
      (total, result) => total + result.availableQuoteAsset,
      0,
    ),
    lastRunAt: Math.max(...results.map((result) => result.lastRunAt ?? 0)),
  };
}

/**
 * Queues a SLOW cycle so runner and manual API mutations cannot overwrite each
 * other's balance, position, cache, or mode-state persistence.
 */
export function runSlowTradingCycle(params?: RunSlowTradingCycleParams) {
  return slowTradingMutationQueue.runExclusive(() =>
    params?.account
      ? executeSlowTradingCycle(params)
      : executeAllSlowTradingAccounts(params),
  );
}

/**
 * Grouped cycle API for executing SLOW trading service work.
 */
const slowTradingCycle = {
  run: runSlowTradingCycle,
  runSlowTradingCycle,
} as const;

export default slowTradingCycle;
export { slowTradingCycle };
