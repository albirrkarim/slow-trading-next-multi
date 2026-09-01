import dynamic from "@/lib/dynamic";
import { TradingMode } from "@/lib/exchange";
import { tradeLog } from "@/lib/trading/helper/log";
import slowTradingCache from "../cache";
import slowTradingNotifications from "../notifications";
import slowTradingPositions from "../positions";
import slowTradingReporting from "../reporting";
import slowTradingShared from "../shared";
import slowTradingStageRun from "../stage-run";
import slowTradingStorage from "../storage";
import slowTradingWatchReserve from "../watch-reserve";
import type { SlowTradingCycleResult, SlowTradingCycleRuntime } from "./types";

/** Refreshes reporting data and persists the completed cycle in dependency order. */
async function execute(
  runtime: SlowTradingCycleRuntime,
): Promise<SlowTradingCycleResult> {
  const {
    activeMode,
    currentTimeMs,
    cycleStartedAt,
    dynamicTradeMemory,
    exchange,
    exchangeType,
    isSandbox,
    modeState,
    monitoringReasonByPosition,
    monitoringStage,
    performanceEntries,
    profiler,
    reports,
    shouldAutoEnter,
    shouldAutoExit,
    shouldMonitor,
    sharedMarket,
    skippedEntrySignals,
    stage,
    storage,
    symbols,
    tradingMode,
    volatilityPointsMap,
  } = runtime;

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
      ...Object.entries(runtime.modelMemoryMap)
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
    model_memory: slowTradingShared.clone(
      runtime.modelMemoryMap[symbol] ?? { positions: [] },
    ),
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
              sharedMarket.prices.get("reporting", reportingSymbols),
            ),
            tradingMode === TradingMode.FUTURES
              ? profiler
                  .time("cycle.fundingRates", () =>
                    sharedMarket.fundingRates.get(reportingSymbols),
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

  // H.1 Persist closed trades and mode memory before the daily report reads
  // archived history. Persist again afterward to retain notification state.
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
    for (const position of tradeSetting.model_memory.positions ?? []) {
      totalLockedQuoteAsset +=
        slowTradingWatchReserve.balance.getLockedQuoteAssetValue({
          activePositions: [position],
        });
    }
  }

  const availableQuoteAsset =
    (modeState.dynamicTradeMemory.quoteAsset ?? 0) +
    (modeState.dynamicTradeMemory.safeHaven ?? 0);
  const snapshotTotal = availableQuoteAsset + totalLockedQuoteAsset;

  void slowTradingStorage.balanceSnapshots.upsert({
    mode: activeMode,
    total: snapshotTotal,
    timestamp: currentTimeMs,
  });

  return {
    mode: activeMode,
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
}

const slowTradingCycleFinalize = {
  execute,
} as const;

export default slowTradingCycleFinalize;
