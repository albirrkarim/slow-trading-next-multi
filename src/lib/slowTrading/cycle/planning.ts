import { VOLATILITY_THRESHOLD } from "@/lib/brain/constants";
import blackSwan from "@/lib/trading/black-swan";
import type { Position } from "@/lib/trading/models";
import slowTradingBlackSwan from "../black-swan";
import slowTradingDailyPnlLimit from "../daily-pnl-limit";
import slowTradingNotifications from "../notifications";
import type {
  SlowTradingCyclePerformanceEntry,
  SlowTradingCycleProfiler,
} from "../performance";
import slowTradingReporting from "../reporting";
import slowTradingStageRun from "../stage-run";
import slowTradingStages from "../stages";
import slowTradingStorage from "../storage";
import type {
  SlowTradingMode,
  SlowTradingModeState,
  SlowTradingStorageData,
} from "../types";
import slowTradingCycleDailyPnl from "./daily-pnl";
import type {
  RunSlowTradingCycleParams,
  SlowTradingCyclePlan,
  SlowTradingCycleResult,
} from "./types";

type SlowTradingCyclePlanningResult =
  | { completed: SlowTradingCycleResult; plan?: never }
  | { completed?: never; plan: SlowTradingCyclePlan };

function createSpeedupCriteria(storage: SlowTradingStorageData) {
  return {
    negativePnlThresholdPct:
      storage.runtime.speedupStageNegativePnlThresholdPct,
    positivePnlThresholdPct:
      storage.runtime.speedupStagePositivePnlThresholdPct,
    takeProfitOffsetPct: storage.runtime.speedupStageTakeProfitOffsetPct,
    takeProfitPercent: storage.config.modelConfig.takeProfitPercent,
    useStopLossPlus: storage.config.modelConfig.useStopLossPlus,
    volatilityThresholdPct: VOLATILITY_THRESHOLD,
  };
}

/** Selects account-owned symbols before any shared public market request. */
function selectStageSymbols(params: {
  modeState: SlowTradingModeState;
  stage?: RunSlowTradingCycleParams["stage"];
  storage: SlowTradingStorageData;
}): string[] | null {
  if (!params.stage) {
    return null;
  }

  const criteria = createSpeedupCriteria(params.storage);
  return slowTradingStages.symbols.select({
    configuredSymbols: params.storage.config.symbols,
    modeState: params.modeState,
    speedupNegativePnlThresholdPct: criteria.negativePnlThresholdPct,
    speedupPositivePnlThresholdPct: criteria.positivePnlThresholdPct,
    speedupTakeProfitOffsetPct: criteria.takeProfitOffsetPct,
    stage: params.stage,
    takeProfitPercent: criteria.takeProfitPercent,
    useStopLossPlus: criteria.useStopLossPlus,
    volatilityThresholdPct: criteria.volatilityThresholdPct,
  });
}

/** Resolves stage ownership, runtime controls, and early cycle completion. */
async function prepare(params: {
  activeMode: SlowTradingMode;
  cycleStartedAt: number;
  modeState: SlowTradingModeState;
  performanceEntries: SlowTradingCyclePerformanceEntry[];
  profiler: SlowTradingCycleProfiler;
  request?: RunSlowTradingCycleParams;
  storage: SlowTradingStorageData;
}): Promise<SlowTradingCyclePlanningResult> {
  const blackSwanProtectionActive =
    blackSwan.state.isProtective(params.modeState.blackSwan) ||
    slowTradingBlackSwan.runtime.isProtectionPending(params.activeMode);
  const stage = params.request?.stage;
  const speedupCriteria = createSpeedupCriteria(params.storage);
  const stageSymbols = selectStageSymbols({
    modeState: params.modeState,
    stage,
    storage: params.storage,
  });
  const monitoringStage =
    stage === "speedup"
      ? "speedup"
      : stage === "standard-monitoring"
        ? "standard"
        : undefined;
  const monitoringReasonByPosition: Record<string, string> = {};
  if (monitoringStage && stageSymbols) {
    const selectedSymbols = new Set(stageSymbols);
    for (const tradeSetting of params.modeState.tradeSettings) {
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
    (params.request?.forceExitSymbols ?? [])
      .map((symbol) =>
        String(symbol || "")
          .trim()
          .toUpperCase(),
      )
      .filter(Boolean),
  );
  const forcedEntrySymbols = new Set(
    (params.request?.forceEntrySymbols ?? [])
      .map((symbol) =>
        String(symbol || "")
          .trim()
          .toUpperCase(),
      )
      .filter(Boolean),
  );

  if (
    !params.storage.runtime.runnerEnabled &&
    !params.request?.ignoreRunnerEnabled
  ) {
    const availableQuoteAsset =
      (params.modeState.dynamicTradeMemory.quoteAsset ?? 0) +
      (params.modeState.dynamicTradeMemory.safeHaven ?? 0);
    return {
      completed: {
        mode: params.activeMode,
        stage,
        symbols: stageSymbols ?? [],
        reports: [],
        executedEntrySignals: 0,
        skippedEntrySignals: [],
        availableQuoteAsset,
        lastRunAt: params.modeState.lastRunAt,
        skipped: true,
      },
    };
  }

  const dailyPnlLimitThresholdUsdt =
    params.storage.runtime.autoEntryDailyPnlLimitUSDT;
  let dailyPnlLimitEvaluation = slowTradingDailyPnlLimit.guard.evaluate({
    currentTimeMs: params.cycleStartedAt,
    positions: [],
    thresholdUsdt: dailyPnlLimitThresholdUsdt,
  });
  if (shouldCaptureEntry && forcedEntrySymbols.size === 0) {
    dailyPnlLimitEvaluation = await params.profiler.time(
      "cycle.dailyPnlLimit",
      () =>
        slowTradingCycleDailyPnl.evaluateCurrent({
          currentTimeMs: params.cycleStartedAt,
          mode: params.activeMode,
          modeState: params.modeState,
          thresholdUsdt: dailyPnlLimitThresholdUsdt,
        }),
    );
    params.modeState.dailyPnlLimitState = {
      d: dailyPnlLimitEvaluation.day,
      usdt: dailyPnlLimitEvaluation.pnlUsdt,
    };
    await slowTradingNotifications.dailyPnlLimit.notify({
      currentTimeMs: params.cycleStartedAt,
      evaluation: dailyPnlLimitEvaluation,
      exchangeType: params.storage.config.exchangeType,
      mode: params.activeMode,
      modeState: params.modeState,
      notification: params.storage.runtime.notification,
    });
  }

  const shouldAutoEnter =
    params.storage.account.enabled &&
    !blackSwanProtectionActive &&
    (stage === "capture-entry" && stageSymbols?.length === 0
      ? false
      : shouldCaptureEntry && forcedEntrySymbols.size > 0
        ? true
        : !shouldCaptureEntry || params.request?.disableAutoEntry === true
          ? false
          : params.storage.runtime.autoEntryEnabled &&
            !dailyPnlLimitEvaluation.reached);
  const shouldAutoExit =
    shouldMonitor &&
    (params.storage.runtime.autoExitEnabled || forcedExitSymbols.size > 0);
  const bypass =
    params.request?.bypass ?? params.storage.runtime.entrySignalBypass;

  if (stage && stageSymbols?.length === 0) {
    const availableQuoteAsset =
      (params.modeState.dynamicTradeMemory.quoteAsset ?? 0) +
      (params.modeState.dynamicTradeMemory.safeHaven ?? 0);
    const summary =
      `${params.activeMode} ${stage} cycle finished with 0 eligible symbol(s)` +
      ` | auto entry ${shouldAutoEnter ? "on" : "off"}` +
      ` | auto exit ${shouldAutoExit ? "on" : "off"}`;

    const runStats = slowTradingStageRun.recordCompleted({
      cycleStartedAt: params.cycleStartedAt,
      modeState: params.modeState,
      performanceEntries: params.performanceEntries,
      reports: 0,
      stage,
      summary,
      symbols: 0,
    });
    params.storage.modes[params.activeMode] = params.modeState;
    // Empty heartbeats use one memory write and intentionally do not time
    // that write, avoiding recursive persistence just to record its duration.
    await slowTradingStorage.mode.saveState(
      params.activeMode,
      params.modeState,
      {
        account: params.storage.account.slug,
      },
    );

    return {
      completed: {
        mode: params.activeMode,
        stage,
        symbols: [],
        reports: [],
        executedEntrySignals: 0,
        skippedEntrySignals: [],
        availableQuoteAsset,
        lastRunAt: runStats.t,
        lastRunDurationMs: runStats.ms,
      },
    };
  }

  return {
    plan: {
      blackSwanProtectionActive,
      bypass,
      dailyPnlLimitEvaluation,
      dailyPnlLimitThresholdUsdt,
      forcedEntrySymbols,
      forcedExitSymbols,
      monitoringReasonByPosition,
      monitoringStage,
      shouldAutoEnter,
      shouldAutoExit,
      shouldCaptureEntry,
      shouldMonitor,
      stage,
      stageSymbols,
    },
  };
}

const slowTradingCyclePlanning = {
  prepare,
  symbols: {
    select: selectStageSymbols,
  },
} as const;

export default slowTradingCyclePlanning;
