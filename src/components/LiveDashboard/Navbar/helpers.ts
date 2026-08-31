"use client";

import type { BacktestConfig } from "@/components/dev/DynamicTrade/Config";
import { PRODUCTION_DECISION_ENGINE } from "@/components/constants";
import { DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION } from "@/lib/dynamic/constants";
import { TradingMode } from "@/lib/exchange/types";
import type { TradingModelConfig } from "@/lib/trading/models";
import adaptiveAveraging from "@/lib/trading/adaptive-averaging";
import postAverageRescue from "@/lib/trading/post-average-rescue";
import postAverageStopLoss from "@/lib/trading/post-average-stop-loss";
import blackSwan from "@/lib/trading/black-swan";
import type { Theme } from "@mui/material";

import {
  computeDailyPnlPercentStats,
} from "../Reporting/utils";
import type {
  BalanceSummary,
  ConfigDraft,
  DashboardState,
  DayPreviewSummary,
  OpenPositionSummary,
} from "./types";
import slowTradingClient from "@/lib/slowTrading/client";
import slowTradingDailyPnlLimit from "@/lib/slowTrading/daily-pnl-limit";

function computeLockedPositionValue(
  position: NonNullable<DashboardState>["openPositions"][number],
): number {
  return slowTradingClient.watchReserve.balance.getLockedPositionMarginUsdt(
    position,
  );
}

export function cloneModelConfig(
  modelConfig: TradingModelConfig,
): TradingModelConfig {
  const {
    takeProfitPercent,
    stopLossPercent,
    exitOnVPointAbsLevel,
    stopLossUSDT,
    volatilityTargetStopLossPercent,
    postAverageRescueExit,
    postAverageStopLoss: rawPostAverageStopLoss,
    maxHoldMinutes,
    orderType,
    useStopLossPlus,
    stopLossPlusTrigger,
    balanceUSDT,
    maxRiskPercent,
    maxBuyUSDT,
    onlyTPFromDate,
    dcaDipPercent,
    maxDcaRounds,
    confidenceBase,
    safeUSDTPerMonth,
    safePercentPerMonth,
    minimalAssetOnTrade,
  } = modelConfig;

  return {
    takeProfitPercent,
    stopLossPercent,
    exitOnVPointAbsLevel,
    stopLossUSDT,
    volatilityTargetStopLossPercent,
    postAverageRescueExit: postAverageRescue.config.normalize(
      postAverageRescueExit,
    ),
    postAverageStopLoss: postAverageStopLoss.config.normalize(
      rawPostAverageStopLoss,
    ),
    maxHoldMinutes,
    orderType,
    useStopLossPlus,
    stopLossPlusTrigger,
    balanceUSDT,
    maxRiskPercent,
    maxBuyUSDT,
    onlyTPFromDate,
    dcaDipPercent,
    maxDcaRounds,
    confidenceBase,
    safeUSDTPerMonth,
    safePercentPerMonth,
    minimalAssetOnTrade,
  };
}

export function mapBacktestTradingMode(
  backtestConfig: BacktestConfig,
): TradingMode {
  if (backtestConfig.tradingMode === TradingMode.FUTURES) {
    return TradingMode.FUTURES;
  }

  if (
    backtestConfig.tradingMode === TradingMode.MARGIN_CROSS ||
    backtestConfig.marginMode === "CROSS"
  ) {
    return TradingMode.MARGIN_CROSS;
  }

  if (
    backtestConfig.tradingMode === TradingMode.MARGIN_ISOLATED ||
    backtestConfig.marginMode === "ISOLATED"
  ) {
    return TradingMode.MARGIN_ISOLATED;
  }

  return TradingMode.SPOT;
}

export function makeConfigDraft(state: DashboardState): ConfigDraft {
  const persistedExchangeAccounts = state.runtime.exchangeAccounts ?? [];
  const exchangeAccounts =
    persistedExchangeAccounts.length > 0
      ? persistedExchangeAccounts.map((account) => ({
          ...account,
          credentials: { ...account.credentials },
        }))
      : [
          {
            id: state.runtime.exchangeAccountId ?? "1",
            type: "binance" as const,
            name: "Binance 1",
            description: "",
            credentials: {
              apiKey: "",
              apiSecret: "",
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];
  const exchangeAccountId = exchangeAccounts.some(
    (account) => account.id === state.runtime.exchangeAccountId,
  )
    ? state.runtime.exchangeAccountId
    : (exchangeAccounts[0]?.id ?? "1");

  return {
    name: state.config.name ?? "",
    description: state.config.description ?? "",
    decisionEngineVersion:
      state.config.decisionEngineVersion ?? PRODUCTION_DECISION_ENGINE,
    exchangeAccountId,
    exchangeAccounts,
    exchangeType: state.config.exchangeType,
    tradingMode: state.config.tradingMode,
    symbolsText: state.config.symbols.join(", "),
    modelConfig: cloneModelConfig(
      state.config.modelConfig ??
        DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION.modelConfig,
    ),
    runnerEnabled: state.runtime.runnerEnabled,
    autoEntryEnabled: state.runtime.autoEntryEnabled,
    autoEntryDailyPnlLimitUSDT:
      state.runtime.autoEntryDailyPnlLimitUSDT ??
      slowTradingDailyPnlLimit.config.defaultThresholdUsdt,
    autoExitEnabled: state.runtime.autoExitEnabled,
    entrySignalBypass: state.runtime.entrySignalBypass,
    autoRemoveSymbolAbsLevel: state.runtime.autoRemoveSymbolAbsLevel ?? 0,
    autoRemoveSymbolMinMarketCapUSD:
      state.runtime.autoRemoveSymbolMinMarketCapUSD ?? 0,
    autoRemoveSymbolMinPrice: state.runtime.autoRemoveSymbolMinPrice ?? 0,
    autoRemoveSymbolMinVPointPct:
      state.runtime.autoRemoveSymbolMinVPointPct ?? 15,
    pnlHistoryBucketMinutes: state.runtime.pnlHistoryBucketMinutes ?? 60,
    blackSwan: blackSwan.config.normalize(state.config.blackSwan),
    blackSwanStageIntervalMinutes:
      state.runtime.blackSwanStageIntervalMinutes ?? 1,
    speedupStageIntervalMinutes: state.runtime.speedupStageIntervalMinutes ?? 1,
    speedupStagePositivePnlThresholdPct:
      state.runtime.speedupStagePositivePnlThresholdPct ?? 1.5,
    speedupStageNegativePnlThresholdPct:
      state.runtime.speedupStageNegativePnlThresholdPct ?? 1.5,
    speedupStageTakeProfitOffsetPct:
      state.runtime.speedupStageTakeProfitOffsetPct ?? 0.5,
    standardMonitoringStageIntervalMinutes:
      state.runtime.standardMonitoringStageIntervalMinutes ?? 5,
    managementStageIntervalMinutes:
      state.runtime.managementStageIntervalMinutes ?? 5,
    captureEntryStageIntervalMinutes:
      state.runtime.captureEntryStageIntervalMinutes ?? 5,
    notification: {
      telegram: {
        ...state.runtime.notification.telegram,
        types: state.runtime.notification.telegram.types.map((item) => ({
          ...item,
          params: item.params ? { ...item.params } : undefined,
        })),
      },
      email: {
        ...state.runtime.notification.email,
        types: state.runtime.notification.email.types.map((item) => ({
          ...item,
          params: item.params ? { ...item.params } : undefined,
        })),
      },
    },
    sandboxEnabled: state.runtime.sandboxEnabled,
    sandboxInitialBalanceUSDT: String(
      state.runtime.sandboxInitialBalanceUSDT ?? 0,
    ),
    safeHavenUSDT: String(state.balances.safeHaven ?? 0),
    safeHavenAutoEnabled: state.runtime.safeHaven?.autoEnabled ?? false,
    safeHavenSchedules: (state.runtime.safeHaven?.schedules ?? []).map(
      (schedule) => ({
        ...schedule,
        amountUSDT: String(schedule.amountUSDT ?? 0),
        pct: String(schedule.pct ?? 0),
        dayOfMonth: String(schedule.dayOfMonth ?? 1),
      }),
    ),
    withdrawalAutoEnabled: state.runtime.withdrawal?.autoEnabled ?? false,
    withdrawalSchedules: (state.runtime.withdrawal?.schedules ?? []).map(
      (schedule) => ({
        ...schedule,
        amountUSDT: String(schedule.amountUSDT ?? 0),
        dayOfMonth: String(schedule.dayOfMonth ?? 1),
        walletId: schedule.walletId ?? "",
      }),
    ),
    withdrawalWalletBook: (state.runtime.withdrawal?.walletBook ?? []).map(
      (wallet) => ({ ...wallet }),
    ),
    enableWatchLogic: state.config.enableWatchLogic ?? false,
    watchReserveLevels: state.config.watchReserveLevels,
    watchMaxNextAveragingLevels: state.config.watchMaxNextAveragingLevels,
    watchReservePctAlloc: state.config.watchReservePctAlloc,
    adaptiveAveraging: adaptiveAveraging.config.normalize(
      state.config.adaptiveAveraging,
      false,
    ),
    averagingRescueProjectionGuardEnabled:
      state.config.averagingRescueProjectionGuardEnabled ?? true,
    exitSidewaysToFreeWorkersForStrongCandidates:
      state.config.exitSidewaysToFreeWorkersForStrongCandidates ?? false,
    maxEntryBased24HourVolPct: state.config.maxEntryBased24HourVolPct ?? 0.2,
    maxEntryMarginPct: state.config.maxEntryMarginPct,
    maxEntryMargin: state.config.maxEntryMargin,
    maxOpenPositions: state.config.maxOpenPositions ?? 0,
    minActionableAbsoluteLevel: state.config.minActionableAbsoluteLevel ?? 2,
    maxLeverage: state.config.maxLeverage,
    exactLeverage: state.config.exactLeverage ?? 0,
  };
}

export function applyBacktestConfigToDraft(
  currentDraft: ConfigDraft,
  backtestConfig: BacktestConfig,
): ConfigDraft {
  return {
    ...currentDraft,
    name: backtestConfig.name ?? "",
    description: backtestConfig.description ?? "",
    decisionEngineVersion:
      backtestConfig.decisionEngineVersion ??
      currentDraft.decisionEngineVersion,
    tradingMode: mapBacktestTradingMode(backtestConfig),
    symbolsText: backtestConfig.symbols.join(", "),
    modelConfig: cloneModelConfig(
      backtestConfig.modelConfig ??
        DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION.modelConfig,
    ),
    enableWatchLogic: backtestConfig.enableWatchLogic,
    watchReserveLevels: backtestConfig.watchReserveLevels,
    watchMaxNextAveragingLevels: backtestConfig.watchMaxNextAveragingLevels,
    watchReservePctAlloc: backtestConfig.watchReservePctAlloc,
    adaptiveAveraging: adaptiveAveraging.config.normalize(
      backtestConfig.adaptiveAveraging,
      false,
    ),
    averagingRescueProjectionGuardEnabled:
      backtestConfig.averagingRescueProjectionGuardEnabled,
    exitSidewaysToFreeWorkersForStrongCandidates:
      backtestConfig.exitSidewaysToFreeWorkersForStrongCandidates,
    maxEntryBased24HourVolPct: backtestConfig.maxEntryBased24HourVolPct,
    maxEntryMarginPct: backtestConfig.maxEntryMarginPct,
    maxEntryMargin: backtestConfig.maxEntryMargin,
    maxOpenPositions: backtestConfig.maxOpenPositions ?? 0,
    minActionableAbsoluteLevel: backtestConfig.minActionableAbsoluteLevel ?? 2,
    maxLeverage: backtestConfig.maxLeverage,
    exactLeverage: backtestConfig.exactLeverage,
  };
}

export function parseSymbols(symbolsText: string): string[] {
  return Array.from(
    new Set(
      symbolsText
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

/**
 * Returns whether automatic entries can currently run.
 */
export function computeAutoEntryActive(
  dashboardState: DashboardState | null,
): boolean {
  const dailyPnlLimit = slowTradingDailyPnlLimit.guard.evaluate({
    positions: dashboardState?.history ?? [],
    thresholdUsdt: dashboardState?.runtime.autoEntryDailyPnlLimitUSDT,
  });

  return Boolean(
    dashboardState?.runtime.runnerEnabled &&
    dashboardState.runtime.autoEntryEnabled &&
    !dailyPnlLimit.reached,
  );
}

export function getPnlPercentBg(theme: Theme, value: number) {
  if (value > 0) return theme.palette.success.main;
  if (value > -40) return theme.palette.info.light;
  if (value < -40) return theme.palette.warning.main;
  return theme.palette.error.main;
}

export function computeOpenPositionSummary(
  dashboardState: DashboardState | null,
): OpenPositionSummary {
  const positions = dashboardState?.openPositions ?? [];
  if (positions.length === 0) {
    return {
      totalPnlUSDT: 0,
      avgPnlPercent: 0,
      lockedCapitalUSDT: 0,
    };
  }

  const totalPnlUSDT = positions.reduce(
    (acc, position) => acc + (Number(position.pnl.netUsdt) || 0),
    0,
  );
  const lockedCapitalUSDT = positions.reduce(
    (acc, position) => acc + computeLockedPositionValue(position),
    0,
  );
  const pnlPercents = positions
    .map((position) =>
      typeof position.pnl.netPct === "number"
        ? position.pnl.netPct
        : Number(position.pnl.netPct),
    )
    .filter((value) => Number.isFinite(value)) as number[];

  return {
    totalPnlUSDT,
    avgPnlPercent:
      pnlPercents.length > 0
        ? pnlPercents.reduce((acc, value) => acc + value, 0) /
          pnlPercents.length
        : 0,
    lockedCapitalUSDT,
  };
}

export function computeDayPreview(
  dashboardState: DashboardState | null,
  now = new Date(),
): DayPreviewSummary {
  const history = dashboardState?.history ?? [];
  const percentStats = computeDailyPnlPercentStats(history);
  const todayKey = now.toISOString().slice(0, 10);
  const todayPercent = percentStats.find((stat) => stat.day === todayKey);

  return {
    dailyUsdtProfit: slowTradingDailyPnlLimit.pnl.sumForUtcDay(
      history,
      todayKey,
    ),
    dailyPnlPercentSum: todayPercent?.pnlPercentSum ?? 0,
  };
}

/** Formats the live browser-tab title from the deployment name and UTC-day PnL. */
export function formatDailyPnlMetaTitle(
  appName: string,
  dailyUsdtProfit: number,
): string {
  const normalizedAppName = appName.trim() || "SLOW";
  const normalizedPnl = Number.isFinite(dailyUsdtProfit)
    ? dailyUsdtProfit
    : 0;
  const sign = normalizedPnl >= 0 ? "+" : "-";

  return `${normalizedAppName} | ${sign}$${Math.abs(normalizedPnl).toFixed(2)}`;
}

export function computeBalanceSummary(
  dashboardState: DashboardState | null,
  openPositionSummary: OpenPositionSummary,
): BalanceSummary {
  const available = dashboardState?.balances.availableQuoteAsset ?? 0;
  const reserved = dashboardState?.balances.reservedQuoteAsset ?? 0;
  const safeHaven = dashboardState?.balances.safeHaven ?? 0;
  const startingBalance = dashboardState?.balances.startingBalanceUSDT ?? 0;
  const locked =
    dashboardState?.balances.lockedQuoteAsset ??
    openPositionSummary.lockedCapitalUSDT;
  const spendable =
    dashboardState?.balances.spendableQuoteAsset ??
    Math.max(0, available - reserved - safeHaven);

  return {
    available,
    reserved,
    spendable,
    safeHaven,
    startingBalance,
    locked,
    total: available + locked,
  };
}
