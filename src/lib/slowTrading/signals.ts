import {
  assignModelMemory,
  assignVolatility,
  getManualEntrySignal,
} from "@/components/api/production/utils";
import { FILES } from "@/components/storage";
import brain, {
  type EntryRecommendation,
  type EntryRecommendationDiagnostic,
} from "@/lib/brain";
import { decisionEngineLevelConfig } from "@/lib/brain/algorithms/v4/decisions/v19/constants";
import dynamic, {
  type DynamicTradeMemory,
  type VolatilityPoint,
} from "@/lib/dynamic";
import { getExchange, TradingMode } from "@/lib/exchange";
import { resolveMarketTypeForTradingMode } from "@/lib/exchange/utils";
import { MINIMAL_USDT_TO_TRADE } from "@/lib/trading/constants";
import { resolveEntryLeverage } from "@/lib/trading/execute/entry-leverage";
import entryFunding from "@/lib/trading/execute/entry-funding";
import entryMarket from "@/lib/trading/execute/entry-market";
import lateEntryVPointDrift from "@/lib/trading/execute/late-entry-vpoint-drift";
import fs from "fs-extra";
import slowTradingAutoRemoveSymbols from "./auto-remove-symbols";
import slowTradingMarket from "./market";
import slowTradingMarketVolume from "./market-volume";
import slowTradingPerformance, {
  type SlowTradingCycleProfiler,
} from "./performance";
import slowTradingShared from "./shared";
import slowTradingStorage from "./storage";
import type {
  SlowTradingEntryDiagnostic,
  SlowTradingModeState,
  SlowTradingStorageData,
} from "./types";
import slowTradingWatchReserve from "./watch-reserve";
import slowTradingDailyPnlLimit from "./daily-pnl-limit";
import slowTradingCycleSharedMarket, {
  type SlowTradingSharedMarketSnapshot,
} from "./cycle/shared-market";

/**
 * Remove entry signals for symbols that already have open positions.
 *
 * Entry bypass can skip signal-qualification rules, but it must not allow
 * repeated entries into the same symbol while a position is still open.
 */
export function filterSignalsWithoutOpenPositions(
  modeState: SlowTradingModeState,
  entrySignals: EntryRecommendation[],
): EntryRecommendation[] {
  // BOTH:ONLY_ONE_ACTIVE_POSITION_PER_COIN
  const openSymbols = new Set(
    modeState.tradeSettings
      .filter((item) => (item.model_memory.positions?.length ?? 0) > 0)
      .map((item) => item.symbol?.toUpperCase())
      .filter((symbol): symbol is string => Boolean(symbol)),
  );

  if (openSymbols.size === 0) {
    return entrySignals;
  }

  return entrySignals.filter((item) => {
    const symbol = item.symbol?.toUpperCase();
    return !symbol || !openSymbols.has(symbol);
  });
}

/**
 * Explains why a forced manual entry did not produce an executable signal.
 */
export function getForcedEntrySkipReason(params: {
  symbol: string;
  configuredSymbols: string[];
  minActionableAbsoluteLevel?: number;
  modeState: SlowTradingModeState;
  modelMemoryMap: Record<string, any>;
}) {
  return (
    getEntryPreExecutionBlockReason(params) ??
    `No manual entry signal survived pre-execution filters for ${params.symbol.toUpperCase()}`
  );
}

/**
 * Returns the shared pre-execution block reason used by manual and diagnostic flows.
 */
export function getEntryPreExecutionBlockReason(params: {
  symbol: string;
  configuredSymbols: string[];
  minActionableAbsoluteLevel?: number;
  modeState: SlowTradingModeState;
  modelMemoryMap: Record<string, any>;
}): string | null {
  const symbol = params.symbol.toUpperCase();
  const configuredSymbols = new Set(
    params.configuredSymbols
      .map((item) =>
        String(item || "")
          .trim()
          .toUpperCase(),
      )
      .filter(Boolean),
  );
  if (!configuredSymbols.has(symbol)) {
    return `${symbol} is not in the SLOW configured symbols list`;
  }

  const tradeSetting = params.modeState.tradeSettings.find(
    (item) =>
      String(item.symbol || "")
        .trim()
        .toUpperCase() === symbol,
  );
  const modeMemory = tradeSetting?.model_memory;
  const modelMemory = params.modelMemoryMap[symbol] ?? modeMemory;

  if ((modeMemory?.positions?.length ?? 0) > 0) {
    return `Open position already exists for ${symbol}`;
  }

  if (!modelMemory) {
    return `No model memory is available for ${symbol}`;
  }

  const latestVolatility = modelMemory.volatility?.lastVolatility?.at(-1);
  if (!latestVolatility) {
    return `No latest volatility point is available for ${symbol}`;
  }

  if (
    !decisionEngineLevelConfig.isActionableLevel(
      latestVolatility,
      params.minActionableAbsoluteLevel,
    )
  ) {
    return (
      `Latest volatility point for ${symbol} is below Min Actionable ` +
      `Absolute Level ${decisionEngineLevelConfig.resolveMinActionableAbsoluteLevel(
        params.minActionableAbsoluteLevel,
      )}: ${latestVolatility.lvl ?? "unknown"}`
    );
  }

  if (
    slowTradingWatchReserve.volatilityPoint.isUsed({
      entrySignal: latestVolatility,
      modelMemory,
    })
  ) {
    return (
      `Latest volatility point was already used for ${symbol}: ` +
      `${latestVolatility.id ?? "unknown id"}`
    );
  }

  return null;
}

/**
 * Remove entry signals whose volatility-point id has already been consumed by
 * an earlier closed trade for the same symbol.
 */
export function filterSignalsWithUnusedVolatilityPointId(
  modeState: SlowTradingModeState,
  entrySignals: EntryRecommendation[],
  modelMemoryMap?: Record<string, any>,
): EntryRecommendation[] {
  return entrySignals.filter((item) => {
    const symbol = String(item.symbol || "")
      .trim()
      .toUpperCase();
    if (!symbol) {
      return true;
    }

    const modelMemory =
      modelMemoryMap?.[symbol] ??
      modeState.tradeSettings.find(
        (setting) =>
          String(setting.symbol || "")
            .trim()
            .toUpperCase() === symbol,
      )?.model_memory;

    return !slowTradingWatchReserve.volatilityPoint.isUsed({
      entrySignal: item,
      modelMemory,
    });
  });
}

/**
 * Remove entry signals that come from weak/neutral volatility levels.
 */
export function filterSignalsWithActionableVolatilityLevel(
  entrySignals: EntryRecommendation[],
  minActionableAbsoluteLevel?: number,
): EntryRecommendation[] {
  return entrySignals.filter((item) =>
    decisionEngineLevelConfig.isActionableLevel(
      item,
      minActionableAbsoluteLevel,
    ),
  );
}

/**
 * Build the latest slow-trading entry signals for the active mode.
 */
export async function buildSlowTradingSignals(params?: {
  storage?: SlowTradingStorageData;
  bypass?: boolean;
  forceEntrySymbols?: string[];
  marketSnapshot?: SlowTradingSharedMarketSnapshot;
  symbols?: string[];
  performance?: SlowTradingCycleProfiler;
}) {
  const profiler =
    params?.performance ?? slowTradingPerformance.cycle.createProfiler();
  const storage =
    params?.storage ??
    (await profiler.time("storage.load", () =>
      slowTradingStorage.data.load({
        modeScope: "active",
      }),
    ));
  return slowTradingStorage.account.runWithExchangeAccount(
    storage,
    async () => {
      const activeMode = slowTradingStorage.mode.getActive(storage);
      const exchangeType = storage.config.exchangeType;
      const tradingMode = storage.config.tradingMode;
      const marketType = resolveMarketTypeForTradingMode(tradingMode);
      const executionSymbols = slowTradingShared.symbols.buildExecution(
        storage.config.symbols,
      );
      const requestedSymbols = params?.symbols
        ? new Set(
            params.symbols
              .map((symbol) =>
                String(symbol || "")
                  .trim()
                  .toUpperCase(),
              )
              .filter(Boolean),
          )
        : null;
      const symbols = requestedSymbols
        ? executionSymbols.filter((symbol) => requestedSymbols.has(symbol))
        : executionSymbols;
      const modeState = slowTradingStorage.mode.ensureTradeSettings(
        storage.modes[activeMode],
        storage.config.symbols,
      );
      storage.modes[activeMode] = modeState;
      const tradeSettings = slowTradingShared.clone(modeState.tradeSettings);
      const bypass = params?.bypass ?? storage.runtime.entrySignalBypass;
      const forcedEntrySymbols = new Set(
        (params?.forceEntrySymbols ?? [])
          .map((symbol) =>
            String(symbol || "")
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean),
      );

      const modelMemoryMap: Record<string, any> = {};
      const modelMemoryRes = await profiler.time(
        "signals.assignModelMemory",
        () => assignModelMemory(modelMemoryMap, tradeSettings),
      );
      if (typeof modelMemoryRes.error === "string") {
        throw new Error(modelMemoryRes.error);
      }

      if (params?.marketSnapshot) {
        slowTradingCycleSharedMarket.memory.attachVolatility({
          modelMemoryMap,
          snapshot: params.marketSnapshot,
          symbols,
        });
      } else {
        await profiler.time("signals.assignVolatility", () =>
          assignVolatility(
            modelMemoryMap,
            symbols,
            exchangeType,
            tradingMode,
            storage.config.minActionableAbsoluteLevel,
          ),
        );
      }

      for (const symbol of forcedEntrySymbols) {
        if (modelMemoryMap[symbol]) {
          modelMemoryMap[symbol].justBuy = true;
        }
      }

      if (forcedEntrySymbols.size > 0) {
        let entrySignals = getManualEntrySignal(
          modelMemoryMap,
          storage.config.minActionableAbsoluteLevel,
        ).filter((signal) =>
          forcedEntrySymbols.has(
            String(signal.symbol || "")
              .trim()
              .toUpperCase(),
          ),
        );

        entrySignals = filterSignalsWithoutOpenPositions(
          modeState,
          entrySignals,
        );
        entrySignals = filterSignalsWithActionableVolatilityLevel(
          entrySignals,
          storage.config.minActionableAbsoluteLevel,
        );
        entrySignals = filterSignalsWithUnusedVolatilityPointId(
          modeState,
          entrySignals,
          modelMemoryMap,
        );
        const volatilityPointsMap = Object.fromEntries(
          Object.entries(modelMemoryMap).map(([symbol, modelMemory]) => [
            symbol,
            modelMemory.volatility?.lastVolatility ?? [],
          ]),
        );

        return {
          storage,
          activeMode,
          currentTimeMs: params?.marketSnapshot?.currentTimeMs ?? Date.now(),
          entrySignals,
          modelMemoryMap,
          symbols,
          tradeSettings,
          engineDiagnostics: [] as EntryRecommendationDiagnostic[],
          volatilityPointsMap,
        };
      }

      const dynamicTradeMemory: DynamicTradeMemory = slowTradingShared.clone(
        dynamic.defaults.tradingMemory,
      );
      const exchange = getExchange(exchangeType, {
        defaultTradingMode: tradingMode,
      });

      let currentTimeMs = params?.marketSnapshot?.currentTimeMs ?? Date.now();
      const firstSymbol = symbols[0];
      const klines =
        firstSymbol && !params?.marketSnapshot
          ? await profiler.time("signals.currentTimeKlines", () =>
              exchange.getKlines({
                symbol: `${firstSymbol}_USDT`,
                interval: "5m",
                marketType,
                simpleTime: "10minute",
              }),
            )
          : [];

      const currentKline = klines.at(-1);
      if (currentKline) {
        currentTimeMs = currentKline[0];
      }

      await profiler.time("signals.historyHydration", () =>
        slowTradingStorage.history.hydrate(storage, {
          mode: activeMode,
          symbols,
          fromTime: slowTradingShared.time.getUtcMonthStartMs(currentTimeMs),
        }),
      );
      for (const tradeSetting of modeState.tradeSettings) {
        const symbol = String(tradeSetting.symbol || "")
          .trim()
          .toUpperCase();
        if (modelMemoryMap[symbol]) {
          modelMemoryMap[symbol].positionsSell = slowTradingShared.clone(
            tradeSetting.model_memory.positionsSell ?? [],
          );
        }
      }

      const volatilityPointsMap: Record<string, VolatilityPoint[]> = {};
      for (const symbol of Object.keys(modelMemoryMap)) {
        volatilityPointsMap[symbol] =
          modelMemoryMap[symbol].volatility?.lastVolatility ?? [];
      }

      if (params?.marketSnapshot) {
        dynamicTradeMemory.priceNormMapOverTime = slowTradingShared.clone(
          params.marketSnapshot.priceNormMapOverTime,
        );
      } else {
        await profiler.time("signals.priceNorm", () =>
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

        brain.algorithms.runtime.updatePriceNorm({
          currentTimeMs,
          dynamicTradeMemory: {
            priceNormMapOverTime: dynamicTradeMemory.priceNormMapOverTime,
          },
          volatilityPointsMap,
        });

        await profiler.time("signals.writePriceNorm", () =>
          fs.writeJSON(
            FILES.slow.priceNormMapOverTime(exchangeType),
            dynamicTradeMemory.priceNormMapOverTime,
          ),
        );
      }

      const evaluation = await profiler.time("signals.recommendations", () =>
        brain.algorithms.recommendations.evaluate({
          decisionEngineVersion:
            storage.config.decisionEngineVersion ?? "decision.v14",
          exchange,
          latestKlineBySymbol: params?.marketSnapshot
            ? slowTradingShared.clone(params.marketSnapshot.latestKlineBySymbol)
            : undefined,
          marketType,
          volatilityPointsMap: slowTradingShared.clone(volatilityPointsMap),
          priceNormMapOverTime: dynamicTradeMemory.priceNormMapOverTime,
          modelMemoryMap,
          bypass,
          minActionableAbsoluteLevel: storage.config.minActionableAbsoluteLevel,
        }),
      );
      let entrySignals = evaluation.recommendations;
      const engineDiagnostics = evaluation.diagnostics;

      if (bypass) {
        const top = entrySignals
          .filter((item) => item.l === "T")
          .sort((a, b) => b.amountProbab - a.amountProbab)
          .slice(0, 1);
        const bottom = entrySignals
          .filter((item) => item.l === "B")
          .sort((a, b) => b.amountProbab - a.amountProbab)
          .slice(0, 1);
        entrySignals = [...top, ...bottom];
      }

      if (forcedEntrySymbols.size > 0) {
        const manualEntrySignals = getManualEntrySignal(
          modelMemoryMap,
          storage.config.minActionableAbsoluteLevel,
        ).filter((signal) =>
          forcedEntrySymbols.has(String(signal.symbol || "").toUpperCase()),
        );

        if (manualEntrySignals.length > 0) {
          const forcedSymbols = new Set(
            manualEntrySignals.map((signal) =>
              String(signal.symbol || "")
                .trim()
                .toUpperCase(),
            ),
          );

          entrySignals = [
            ...entrySignals.filter(
              (signal) =>
                !forcedSymbols.has(
                  String(signal.symbol || "")
                    .trim()
                    .toUpperCase(),
                ),
            ),
            ...manualEntrySignals,
          ];
        }
      }

      entrySignals = filterSignalsWithoutOpenPositions(modeState, entrySignals);
      entrySignals = filterSignalsWithActionableVolatilityLevel(
        entrySignals,
        storage.config.minActionableAbsoluteLevel,
      );
      entrySignals = filterSignalsWithUnusedVolatilityPointId(
        modeState,
        entrySignals,
        modelMemoryMap,
      );

      return {
        storage,
        activeMode,
        currentTimeMs,
        entrySignals,
        modelMemoryMap,
        symbols,
        tradeSettings,
        engineDiagnostics,
        volatilityPointsMap,
      };
    },
  );
}

/** Builds read-only entry explanations for every currently actionable coin. */
export async function buildSlowTradingEntryDiagnostics(params?: {
  storage?: SlowTradingStorageData;
}): Promise<SlowTradingEntryDiagnostic[]> {
  const diagnosticStorage =
    params?.storage ??
    (await slowTradingStorage.data.load({
      modeScope: "active",
    }));
  const result = await buildSlowTradingSignals({
    storage: diagnosticStorage,
  });
  const { storage, activeMode, modelMemoryMap } = result;
  const modeState = storage.modes[activeMode];
  const diagnosticTimeMs = result.currentTimeMs ?? Date.now();
  const dailyPnlPeriod =
    slowTradingDailyPnlLimit.period.getCurrentUtc(diagnosticTimeMs);
  const runtimeControlBlock = !storage.runtime.runnerEnabled
    ? {
        code: "RUNNER_DISABLED",
        reason: "Blocked because the SLOW runner is disabled.",
      }
    : !storage.runtime.autoEntryEnabled
      ? {
          code: "AUTO_ENTRY_DISABLED",
          reason: "Blocked because automatic entry is disabled.",
        }
      : null;
  const hydratedHistory = modeState.tradeSettings.flatMap(
    (item) => item.model_memory.positionsSell ?? [],
  );
  const dailyPnlLimitEvaluation = runtimeControlBlock
    ? slowTradingDailyPnlLimit.guard.evaluate({
        currentTimeMs: diagnosticTimeMs,
        positions: [],
        thresholdUsdt: storage.runtime.autoEntryDailyPnlLimitUSDT,
      })
    : hydratedHistory.length > 0
      ? slowTradingDailyPnlLimit.guard.evaluate({
          currentTimeMs: diagnosticTimeMs,
          positions: hydratedHistory,
          thresholdUsdt: storage.runtime.autoEntryDailyPnlLimitUSDT,
        })
      : modeState.dailyPnlLimitState?.d === dailyPnlPeriod.day
        ? slowTradingDailyPnlLimit.guard.evaluatePnl({
            currentTimeMs: diagnosticTimeMs,
            pnlUsdt: modeState.dailyPnlLimitState.usdt,
            thresholdUsdt: storage.runtime.autoEntryDailyPnlLimitUSDT,
          })
        : slowTradingDailyPnlLimit.guard.evaluate({
            currentTimeMs: diagnosticTimeMs,
            positions: await slowTradingStorage.history.readRange({
              endTime: dailyPnlPeriod.endTime,
              mode: activeMode,
              startTime: dailyPnlPeriod.startTime,
            }),
            thresholdUsdt: storage.runtime.autoEntryDailyPnlLimitUSDT,
          });
  const runtimeEntryBlock =
    runtimeControlBlock ??
    (dailyPnlLimitEvaluation.reached
      ? {
          code: "DAILY_PNL_LIMIT_REACHED",
          reason: slowTradingDailyPnlLimit.guard.describe(
            dailyPnlLimitEvaluation,
          ),
        }
      : null);
  const engineDiagnosticBySymbol = new Map(
    (result.engineDiagnostics ?? []).map((item) => [
      item.symbol.toUpperCase(),
      item,
    ]),
  );
  const signalSymbols = new Set(
    result.entrySignals
      .map((item) => String(item.symbol || "").toUpperCase())
      .filter(Boolean),
  );
  const entrySignalBySymbol = new Map(
    result.entrySignals
      .filter((item) => item.symbol)
      .map((item) => [item.symbol!.toUpperCase(), item]),
  );
  const modelConfig = slowTradingMarket.modelConfig.pick(storage);
  const marketType = resolveMarketTypeForTradingMode(
    storage.config.tradingMode,
  );
  const marketContext = await slowTradingStorage.account.runWithExchangeAccount(
    storage,
    async () => {
      const exchange = getExchange(storage.config.exchangeType, {
        defaultTradingMode: storage.config.tradingMode,
      });
      const feeRate =
        exchange.getFees().getTotalFeePercent({
          side: "buy",
          currency: "USDT",
          type: modelConfig.orderType ?? "taker",
        }) / 100;
      const [entries, volumeSnapshot] = await Promise.all([
        Promise.all(
          [...signalSymbols].map(async (symbol) => {
            try {
              const kline = await entryMarket.currentKline.getLatest({
                exchange,
                symbol,
                tradingMode: storage.config.tradingMode,
              });
              return [symbol, kline] as const;
            } catch {
              return [symbol, undefined] as const;
            }
          }),
        ),
        (storage.config.maxEntryBased24HourVolPct ?? 0.2) > 0
          ? slowTradingMarketVolume.snapshot
              .refresh({
                exchangeType: storage.config.exchangeType,
                marketType,
                symbols: result.symbols,
              })
              .catch(() =>
                slowTradingMarketVolume.snapshot.read(
                  storage.config.exchangeType,
                  marketType,
                ),
              )
          : Promise.resolve(null),
      ]);

      return {
        feeRate,
        latestEntryKlineBySymbol: new Map(entries),
        volume24hBySymbol: volumeSnapshot?.volumes ?? {},
      };
    },
  );
  const activePositions = modeState.tradeSettings.flatMap(
    (item) => item.model_memory.positions ?? [],
  );
  const dynamicTradeMemory: DynamicTradeMemory = {
    ...slowTradingShared.clone(dynamic.defaults.tradingMemory),
    ...slowTradingShared.clone(modeState.dynamicTradeMemory),
  };
  const volatilityPointsMap =
    result.volatilityPointsMap ??
    Object.fromEntries(
      Object.entries(modelMemoryMap).map(([symbol, modelMemory]) => [
        symbol,
        modelMemory.volatility?.lastVolatility ?? [],
      ]),
    );
  const currentBalance = dynamic.balance.countGrowthOvertime({
    timeMs: result.currentTimeMs ?? Date.now(),
    dynamicTradeMemory,
    modelMemoryMap,
    volatilityMap: volatilityPointsMap,
  });
  let investAmount =
    result.entrySignals.length > 0
      ? brain.algorithms.runtime.getInvestmentAmount({
          dynamicTradeMemory,
          currentBalance,
          allocationPercent: 1,
          recommendedPositionsLength: result.entrySignals.length,
        })
      : 0;
  if (storage.runtime.entrySignalBypass) {
    investAmount = Math.min(investAmount, 10);
  }
  const autoRemovableSymbols = new Set(
    slowTradingAutoRemoveSymbols.find.byAbsLevel({
      configuredSymbols: storage.config.symbols,
      thresholdAbsLevel: storage.runtime.autoRemoveSymbolAbsLevel ?? 0,
      modelMemoryMap,
    }),
  );

  return storage.config.symbols.flatMap((rawSymbol) => {
    const symbol = rawSymbol.toUpperCase();
    const modelMemory = modelMemoryMap[symbol];
    const point = modelMemory?.volatility?.lastVolatility?.at(-1);
    if (runtimeEntryBlock) {
      return [
        {
          code: runtimeEntryBlock.code,
          level: point?.lvl,
          pointId: point?.id,
          reason: runtimeEntryBlock.reason,
          status: "blocked" as const,
          symbol,
        },
      ];
    }
    if (
      !point ||
      !decisionEngineLevelConfig.isActionableLevel(
        point,
        storage.config.minActionableAbsoluteLevel,
      )
    ) {
      return [];
    }

    let code = "DECISION_ENGINE_REJECTED";
    let reason =
      engineDiagnosticBySymbol.get(symbol)?.reason ??
      `Blocked because ${storage.config.decisionEngineVersion ?? "the decision engine"} did not return this coin.`;
    let status: SlowTradingEntryDiagnostic["status"] =
      engineDiagnosticBySymbol.get(symbol)?.status ?? "blocked";

    if (!storage.runtime.runnerEnabled) {
      code = "RUNNER_DISABLED";
      reason = "Blocked because the SLOW runner is disabled.";
      status = "blocked";
    } else if (!storage.runtime.autoEntryEnabled) {
      code = "AUTO_ENTRY_DISABLED";
      reason = "Blocked because automatic entry is disabled.";
      status = "blocked";
    } else {
      const preExecutionReason = getEntryPreExecutionBlockReason({
        symbol,
        configuredSymbols: storage.config.symbols,
        minActionableAbsoluteLevel: storage.config.minActionableAbsoluteLevel,
        modeState,
        modelMemoryMap,
      });

      if (preExecutionReason) {
        code = "PRE_EXECUTION_GUARD";
        reason = preExecutionReason;
        status = "blocked";
      } else if (
        storage.config.tradingMode === TradingMode.SPOT &&
        point.l === "T"
      ) {
        code = "SPOT_SHORT_BLOCKED";
        reason = "Blocked because Spot mode does not open SHORT entries.";
        status = "blocked";
      } else if (autoRemovableSymbols.has(symbol)) {
        // PROD:AUTO_REMOVE_COIN_ABOVE_SOME_ABS_LEVEL
        code = "AUTO_REMOVE_ABSOLUTE_LEVEL";
        reason =
          `Blocked because auto-removal will remove ${symbol} at absolute level ` +
          `${Math.abs(point.lvl)} (configured threshold ` +
          `${storage.runtime.autoRemoveSymbolAbsLevel}).`;
        status = "blocked";
      } else if (signalSymbols.has(symbol)) {
        const currentKline = marketContext.latestEntryKlineBySymbol.get(symbol);
        const entrySignal = entrySignalBySymbol.get(symbol);
        const currentPrice = Number.parseFloat(currentKline?.[4] ?? "");
        if (!currentKline || !Number.isFinite(currentPrice)) {
          code = "CURRENT_ENTRY_KLINE_UNAVAILABLE";
          reason =
            "Blocked because the current market candle required by entry guards is unavailable.";
          status = "blocked";
        } else if (
          slowTradingAutoRemoveSymbols.price.isBelowMinimum({
            price: currentPrice,
            minimumPrice: storage.runtime.autoRemoveSymbolMinPrice,
          })
        ) {
          code = "AUTO_REMOVE_MIN_PRICE";
          reason =
            `Blocked because ${symbol}'s current price ${currentPrice} USDT is below ` +
            `the configured coin-management minimum of ` +
            `${storage.runtime.autoRemoveSymbolMinPrice} USDT.`;
          status = "blocked";
        } else if (entrySignal) {
          const direction =
            storage.config.tradingMode === TradingMode.SPOT
              ? "LONG"
              : point.l === "T"
                ? "SHORT"
                : "LONG";
          const lateEntryGuard = lateEntryVPointDrift.evaluate({
            currentPrice,
            direction,
            vPointPrice: entrySignal.p,
          });

          if (lateEntryGuard.blocked) {
            code = "LATE_ENTRY_VPOINT_PRICE_DRIFT_PCT";
            reason = lateEntryGuard.reason!;
            status = "blocked";
          } else {
            const requestedMarginUsdt = entryFunding.requestedMargin.resolve({
              bypass: storage.runtime.entrySignalBypass,
              exchangeType: storage.config.exchangeType,
              investAmount,
              maxUsdtEntry: entrySignal.maxUsdtEntry,
              probability: entrySignal.amountProbab,
            });

            if (
              !storage.runtime.entrySignalBypass &&
              requestedMarginUsdt <= MINIMAL_USDT_TO_TRADE
            ) {
              code = "ENTRY_BUDGET_BELOW_MINIMUM";
              reason =
                `Blocked because the selected entry margin is ${requestedMarginUsdt.toFixed(2)} USDT ` +
                `after probability sizing; automatic entry requires more than ` +
                `${MINIMAL_USDT_TO_TRADE.toFixed(2)} USDT.`;
              status = "blocked";
            } else {
              const leverage = resolveEntryLeverage({
                entrySignal,
                tradingMode: storage.config.tradingMode,
                config: storage.config,
              });
              const fundingPlan = entryFunding.plan.calculate({
                activePositions,
                config: storage.config,
                direction,
                entryLevel: point.lvl,
                feeRate: marketContext.feeRate,
                leverage,
                requestedMarginUsdt,
                reservedQuoteAsset: dynamicTradeMemory.reservedQuoteAsset ?? 0,
                spendableQuoteAsset: dynamicTradeMemory.quoteAsset ?? 0,
                tradingMode: storage.config.tradingMode,
                volume24h: marketContext.volume24hBySymbol[symbol],
              });

              if (fundingPlan.blockReason) {
                code = fundingPlan.blockCode ?? "ENTRY_FUNDING_BLOCKED";
                reason = fundingPlan.blockReason;
                status = "blocked";
              } else {
                code = engineDiagnosticBySymbol.get(symbol)?.code ?? "READY";
                const engineReason =
                  engineDiagnosticBySymbol.get(symbol)?.reason ??
                  "Ready: selected by the decision engine for entry.";
                reason =
                  `${engineReason} Entry guards passed; final exchange ` +
                  "account, precision, and order checks run during execution.";
                status = "ready";
              }
            }
          }
        }
      } else {
        code = engineDiagnosticBySymbol.get(symbol)?.code ?? code;
      }
    }

    return [
      {
        code,
        level: point.lvl,
        pointId: point.id,
        reason,
        status,
        symbol,
      },
    ];
  });
}

/**
 * Grouped signal API for SLOW entry signal generation and filtering.
 */
const slowTradingSignals = {
  build: buildSlowTradingSignals,
  diagnostics: {
    build: buildSlowTradingEntryDiagnostics,
  },
  filter: {
    actionableVolatilityLevel: filterSignalsWithActionableVolatilityLevel,
    unusedVolatilityPointId: filterSignalsWithUnusedVolatilityPointId,
    withoutOpenPositions: filterSignalsWithoutOpenPositions,
  },
  forcedEntry: {
    getSkipReason: getForcedEntrySkipReason,
  },
  buildSlowTradingSignals,
  filterSignalsWithActionableVolatilityLevel,
  filterSignalsWithUnusedVolatilityPointId,
  filterSignalsWithoutOpenPositions,
  getForcedEntrySkipReason,
  getEntryPreExecutionBlockReason,
} as const;

export default slowTradingSignals;
export { slowTradingSignals };
