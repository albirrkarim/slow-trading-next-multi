import { tradeLog } from "@/lib/trading/helper/log";
import slowTradingNotifications from "../notifications";
import slowTradingPerformance, {
  type SlowTradingCyclePerformanceEntry,
} from "../performance";
import slowTradingShared from "../shared";
import slowTradingStorage from "../storage";
import type { SlowTradingModeState, SlowTradingStorageData } from "../types";
import slowTradingCycleAccounts from "./accounts";
import slowTradingCyclePlanning from "./planning";
import slowTradingCycleSharedMarket, {
  type SlowTradingSharedMarketSnapshot,
} from "./shared-market";
import type {
  RunSlowTradingCycleParams,
  SlowTradingCycleResult,
} from "./types";

export interface SlowTradingCycleExecutionContext {
  cycleStartedAt: number;
  sharedMarket: SlowTradingSharedMarketSnapshot | null;
  sharedPerformanceEntries: SlowTradingCyclePerformanceEntry[];
  storage: SlowTradingStorageData;
}

/** Returns symbols with an open account position without requiring market data. */
function selectOpenPositionSymbols(modeState: SlowTradingModeState): string[] {
  return modeState.tradeSettings.flatMap((tradeSetting) => {
    const hasOpenPosition = (tradeSetting.model_memory.positions ?? []).some(
      (position) => !position.closed,
    );
    const symbol = String(tradeSetting.symbol || "")
      .trim()
      .toUpperCase();

    return hasOpenPosition && symbol ? [symbol] : [];
  });
}

/** Selects public symbols needed before exact volatility-aware stage partitioning. */
function selectSharedSymbols(params: {
  request: RunSlowTradingCycleParams;
  storage: SlowTradingStorageData;
}): string[] {
  if (
    !params.storage.runtime.runnerEnabled &&
    !params.request.ignoreRunnerEnabled
  ) {
    return [];
  }

  const activeMode = slowTradingStorage.mode.getActive(params.storage);
  const modeState = slowTradingStorage.mode.ensureTradeSettings(
    params.storage.modes[activeMode],
    params.storage.config.symbols,
  );
  params.storage.modes[activeMode] = modeState;
  const isMonitoringStage =
    params.request.stage === "speedup" ||
    params.request.stage === "standard-monitoring";
  const stageSymbols = isMonitoringStage
    ? selectOpenPositionSymbols(modeState)
    : slowTradingCyclePlanning.symbols.select({
        modeState,
        stage: params.request.stage,
        storage: params.storage,
      });

  return Array.from(
    new Set([
      ...(stageSymbols ??
        slowTradingShared.symbols.buildExecution(
          params.storage.config.symbols,
        )),
      ...(params.request.forceExitSymbols ?? []),
    ]),
  );
}

/** Runs one shared market phase, then every eligible account sequentially. */
async function execute(params: {
  executeOne: (
    request: RunSlowTradingCycleParams,
    context: SlowTradingCycleExecutionContext,
  ) => Promise<SlowTradingCycleResult>;
  request?: RunSlowTradingCycleParams;
}): Promise<SlowTradingCycleResult> {
  const cycleStartedAt = Date.now();
  const sharedPerformanceEntries: SlowTradingCyclePerformanceEntry[] = [];
  const sharedProfiler = slowTradingPerformance.cycle.createProfiler({
    now: params.request?.performance?.now,
    onSection: (entry) => {
      sharedPerformanceEntries.push(entry);
      params.request?.performance?.onSection?.(entry);
    },
  });
  // PROD:CYCLE_PERFORMANCE_SECTION_DURATION
  const { catalog, scopes } = await sharedProfiler.time("storage.load", () =>
    slowTradingCycleAccounts.scopes.loadEligible(params.request),
  );
  const symbols = Array.from(
    new Set(
      scopes.flatMap((scope) =>
        selectSharedSymbols({
          request: scope.request,
          storage: scope.storage,
        }),
      ),
    ),
  );
  const minimumLevels = scopes
    .map((scope) => scope.storage.config.minActionableAbsoluteLevel)
    .filter((level): level is number => Number.isFinite(level));
  const representative = scopes[0];
  // PROD:MULTI_ACCOUNT_SHARED_MARKET_PREPARATION
  const sharedMarket = representative
    ? await sharedProfiler.time("signals.build", () =>
        slowTradingCycleSharedMarket.prepare({
          minActionableAbsoluteLevel:
            minimumLevels.length > 0 ? Math.min(...minimumLevels) : undefined,
          prepareEntryContext:
            !params.request?.stage || params.request.stage === "capture-entry",
          profiler: sharedProfiler,
          storage: representative.storage,
          symbols,
        }),
      )
    : null;
  const results: SlowTradingCycleResult[] = [];

  // PROD:MULTI_ACCOUNT_SEQUENTIAL_CYCLE
  // PROD:MULTI_ACCOUNT_SEQUENTIAL_ACCOUNT_EXECUTION
  for (const scope of scopes) {
    try {
      // PROD:MULTI_ACCOUNT_PRIVATE_STATE_ISOLATION
      results.push(
        await params.executeOne(scope.request, {
          cycleStartedAt,
          sharedMarket,
          sharedPerformanceEntries,
          storage: scope.storage,
        }),
      );
    } catch (error) {
      if (params.request?.account) {
        throw error;
      }
      // PROD:MULTI_ACCOUNT_FAILURE_ISOLATION
      tradeLog.error(
        `account cycle failed | account=${scope.storage.account.slug}`,
        error,
      );
      await slowTradingNotifications.operationalError.notify({
        source: `cycle.account.${scope.storage.account.slug}`,
        error,
      });
    }
  }

  return slowTradingCycleAccounts.results.combine({
    catalog,
    request: params.request,
    results,
  });
}

const slowTradingCycleCoordinator = {
  execute,
} as const;

export default slowTradingCycleCoordinator;
