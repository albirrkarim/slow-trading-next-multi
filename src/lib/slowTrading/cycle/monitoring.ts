import trading from "@/lib/trading";
import type { Position } from "@/lib/trading/models";
import slowTradingBalance from "../balance";
import slowTradingBlackSwan from "../black-swan";
import slowTradingNotifications from "../notifications";
import slowTradingPositions from "../positions";
import slowTradingWatchReserve from "../watch-reserve";
import slowTradingCycleDailyPnl from "./daily-pnl";
import type { SlowTradingCycleRuntime } from "./types";

/** Executes exits before averaging so a position cannot do both in one pass. */
async function execute(runtime: SlowTradingCycleRuntime): Promise<void> {
  const {
    activeMode,
    currentTimeMs,
    dynamicTradeMemory,
    exchangeType,
    forcedExitSymbols,
    isSandbox,
    modelConfig,
    modelMemoryMap,
    modeState,
    profiler,
    reports,
    shouldAutoExit,
    shouldMonitor,
    storage,
    symbols,
    tradeSettings,
    tradingMode,
    volatilityPointsMap,
  } = runtime;

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
          const hasOpenPositions = (modelMemory?.positions ?? []).length > 0;
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

  if (reports.some((report) => report.tradingDetail?.action === "SELL")) {
    runtime.dailyPnlLimitEvaluation = await profiler.time(
      "cycle.dailyPnlLimit",
      () =>
        slowTradingCycleDailyPnl.evaluateCurrent({
          currentTimeMs,
          includePendingArchive: true,
          mode: activeMode,
          modeState: { ...modeState, tradeSettings },
          thresholdUsdt: runtime.dailyPnlLimitThresholdUsdt,
        }),
    );
    modeState.dailyPnlLimitState = {
      d: runtime.dailyPnlLimitEvaluation.day,
      usdt: runtime.dailyPnlLimitEvaluation.pnlUsdt,
    };
    await slowTradingNotifications.dailyPnlLimit.notify({
      currentTimeMs,
      evaluation: runtime.dailyPnlLimitEvaluation,
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
    !runtime.blackSwanProtectionActive &&
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
      const reservedBefore = slowTradingBalance.reserve.getOpen(modelMemory);
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
        const reservedAfter = slowTradingBalance.reserve.getOpen(modelMemory);
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
}

const slowTradingCycleMonitoring = {
  execute,
} as const;

export default slowTradingCycleMonitoring;
