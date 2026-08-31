import adaptiveAveraging from "@/lib/trading/adaptive-averaging";
import type { BacktestConfigDynamic } from "@/lib/dynamic";

import type { BacktestConfig } from "./Config";

type BacktestUiRuntimeConfig = {
  [Key in Exclude<keyof BacktestConfigDynamic, "countLastRecord">]-?:
    BacktestConfigDynamic[Key];
};

type BacktestOuterRequestKey =
  | "algorithm"
  | "decisionEngineVersion"
  | "endTime"
  | "mode"
  | "range"
  | "startTime"
  | "symbols"
  | "upToDateDecisionBacktest"
  | "upToDateKlines";

type BacktestHistoryMetadataKey = "description" | "name";
type AssertNever<Value extends never> = Value;

/** Compile-time guard requiring every UI config key to have an explicit role. */
export type BacktestConfigKeysAreClassified = AssertNever<
  Exclude<
    keyof BacktestConfig,
    | keyof BacktestUiRuntimeConfig
    | BacktestOuterRequestKey
    | BacktestHistoryMetadataKey
  >
>;

/** Normalizes an integer setting that uses zero to disable its limit. */
function normalizeNonNegativeInteger(value?: number): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

/** Normalizes the minimum vPoint level accepted by compatible entry engines. */
function normalizeMinActionableLevel(value?: number): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 2;
  }

  return Math.max(1, Math.floor(numericValue));
}

const backtestRequestConfig = {
  config: {
    /** Builds the runtime config sent from the backtest UI to the API. */
    build(config: BacktestConfig): BacktestUiRuntimeConfig {
      // BTEST:BACKTEST_ENTRY_CONFIG_FORWARDING
      return {
        adaptiveAveraging: adaptiveAveraging.config.normalize(
          config.adaptiveAveraging,
          false,
        ),
        averagingRescueProjectionGuardEnabled:
          config.averagingRescueProjectionGuardEnabled ?? true,
        enableWatchLogic: config.enableWatchLogic !== false,
        exactLeverage: normalizeNonNegativeInteger(config.exactLeverage),
        exitSidewaysToFreeWorkersForStrongCandidates:
          config.exitSidewaysToFreeWorkersForStrongCandidates ?? false,
        marginMode: config.marginMode ?? "ISOLATED",
        maxEntryBased24HourVolPct:
          config.maxEntryBased24HourVolPct ?? 0.2,
        maxEntryMargin: config.maxEntryMargin ?? 0,
        maxEntryMarginPct: config.maxEntryMarginPct ?? 0,
        maxLeverage: normalizeNonNegativeInteger(config.maxLeverage),
        maxOpenPositions: normalizeNonNegativeInteger(config.maxOpenPositions),
        minActionableAbsoluteLevel: normalizeMinActionableLevel(
          config.minActionableAbsoluteLevel,
        ),
        modelConfig: config.modelConfig,
        startingBalanceUSDT: config.startingBalanceUSDT,
        tradingMode: config.tradingMode,
        watchMaxNextAveragingLevels:
          config.watchMaxNextAveragingLevels ?? 2,
        watchReserveLevels: config.watchReserveLevels ?? 2,
        watchReservePctAlloc: config.watchReservePctAlloc ?? 2,
      };
    },
  },
};

export default backtestRequestConfig;
