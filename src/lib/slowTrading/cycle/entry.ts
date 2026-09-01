import brain from "@/lib/brain";
import dynamic from "@/lib/dynamic";
import trading from "@/lib/trading";
import blackSwan from "@/lib/trading/black-swan";
import { tradeLog } from "@/lib/trading/helper/log";
import slowTradingAutoRemoveSymbols from "../auto-remove-symbols";
import slowTradingBalance from "../balance";
import slowTradingBlackSwan from "../black-swan";
import slowTradingDailyPnlLimit from "../daily-pnl-limit";
import slowTradingMarket from "../market";
import slowTradingNotifications from "../notifications";
import slowTradingShared from "../shared";
import slowTradingSignals from "../signals";
import slowTradingStorage from "../storage";
import slowTradingWatchReserve from "../watch-reserve";
import slowTradingCycleDailyPnl from "./daily-pnl";
import type { SlowTradingCycleRuntime } from "./types";

/** Applies final entry guards and executes eligible entry signals in order. */
async function execute(runtime: SlowTradingCycleRuntime): Promise<void> {
  let { dailyPnlLimitEvaluation, dailyPnlLimitThresholdUsdt, entrySignals } =
    runtime;
  const {
    activeMode,
    bypass,
    currentTimeMs,
    dynamicTradeMemory,
    exchange,
    exchangeType,
    forcedEntrySymbols,
    isSandbox,
    marketType,
    modelConfig,
    modelMemoryMap,
    modeState,
    profiler,
    reports,
    shouldAutoEnter,
    sharedMarket,
    skippedEntrySignals,
    storage,
    tradeSettings,
    tradingMode,
    volatilityPointsMap,
  } = runtime;
  const executionModeState = { ...modeState, tradeSettings };

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

  let entryGuardMinimumPrice = storage.runtime.autoRemoveSymbolMinPrice ?? 0;
  if (shouldAutoEnter && entrySignals.length > 0) {
    const latestEntryGuardStorage = await profiler.time("storage.load", () =>
      slowTradingStorage.data.load({ modeScope: "active" }),
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
      dailyPnlLimitEvaluation = await profiler.time("cycle.dailyPnlLimit", () =>
        slowTradingCycleDailyPnl.evaluateCurrent({
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
          slowTradingShared.entrySignals.addSkipped(skippedEntrySignals, {
            symbol: String(entrySignal.symbol || "")
              .trim()
              .toUpperCase(),
            reason: slowTradingDailyPnlLimit.guard.describe(
              dailyPnlLimitEvaluation,
            ),
          });
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
    volume24hBySymbol = await profiler.time("cycle.volume24hRefresh", () =>
      sharedMarket.volume24h.get(),
    );
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
            volume24h: volume24hBySymbol[entrySymbol],
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
            symbol: entrySymbol,
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

  runtime.dailyPnlLimitEvaluation = dailyPnlLimitEvaluation;
  runtime.dailyPnlLimitThresholdUsdt = dailyPnlLimitThresholdUsdt;
  runtime.entrySignals = entrySignals;
}

const slowTradingCycleEntry = {
  execute,
} as const;

export default slowTradingCycleEntry;
