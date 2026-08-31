"use client";

import type { Dispatch, SetStateAction } from "react";
import type { AdaptiveAveragingConfig } from "@/lib/dynamic";
import type { ExchangeType, TradingMode } from "@/lib/exchange/types";
import type { DashboardNotificationConfig } from "@/lib/notification/config";
import type {
  SlowTradingAccount,
  SlowTradingDashboardState,
} from "@/lib/slowTrading";
import type { TradingModelConfig } from "@/lib/trading/models";
import type { BlackSwanConfig } from "@/lib/trading/black-swan";

export type DashboardState = NonNullable<SlowTradingDashboardState>;

export interface WithdrawalWalletDraft {
  id: string;
  name: string;
  network: string;
  address: string;
}

export interface WithdrawalScheduleDraft {
  id: string;
  account: string;
  name: string;
  enabled: boolean;
  amountUSDT: string;
  dayOfMonth: string;
  walletId: string;
  targetNetwork: string;
  targetWalletAddress: string;
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  lastQueuedAt?: number;
  lastStatus?: string;
}

export interface SafeHavenScheduleDraft {
  id: string;
  name: string;
  enabled: boolean;
  amountUSDT: string;
  pct: string;
  dayOfMonth: string;
  lastQueuedAt?: Partial<Record<"live" | "sandbox", number>>;
}

export interface ConfigDraft {
  name: string;
  description: string;
  decisionEngineVersion: string;
  exchangeAccountSlug: string;
  exchangeAccounts: SlowTradingAccount[];
  exchangeType: ExchangeType;
  tradingMode: TradingMode;
  symbolsText: string;
  modelConfig: TradingModelConfig;
  runnerEnabled: boolean;
  autoEntryEnabled: boolean;
  autoEntryDailyPnlLimitUSDT?: number;
  autoExitEnabled: boolean;
  entrySignalBypass: boolean;
  autoRemoveSymbolAbsLevel: number;
  autoRemoveSymbolMinMarketCapUSD?: number;
  autoRemoveSymbolMinPrice?: number;
  autoRemoveSymbolMinVPointPct?: number;
  pnlHistoryBucketMinutes?: number;
  blackSwan?: BlackSwanConfig;
  blackSwanStageIntervalMinutes?: number;
  speedupStageIntervalMinutes?: number;
  speedupStagePositivePnlThresholdPct?: number;
  speedupStageNegativePnlThresholdPct?: number;
  speedupStageTakeProfitOffsetPct?: number;
  standardMonitoringStageIntervalMinutes?: number;
  managementStageIntervalMinutes?: number;
  captureEntryStageIntervalMinutes?: number;
  notification: DashboardNotificationConfig;
  sandboxEnabled: boolean;
  sandboxInitialBalanceUSDT: string;
  safeHavenUSDT: string;
  safeHavenAutoEnabled?: boolean;
  safeHavenSchedules?: SafeHavenScheduleDraft[];
  withdrawalAutoEnabled: boolean;
  withdrawalSchedules: WithdrawalScheduleDraft[];
  withdrawalWalletBook: WithdrawalWalletDraft[];
  enableWatchLogic?: boolean;
  watchReserveLevels?: number;
  watchMaxNextAveragingLevels?: number;
  watchReservePctAlloc?: number;
  adaptiveAveraging?: AdaptiveAveragingConfig;
  averagingRescueProjectionGuardEnabled?: boolean;
  exitSidewaysToFreeWorkersForStrongCandidates?: boolean;
  maxEntryMarginPct?: number;
  maxEntryBased24HourVolPct?: number;
  maxEntryMargin?: number;
  maxOpenPositions?: number;
  minActionableAbsoluteLevel?: number;
  maxLeverage?: number;
  exactLeverage?: number;
}

export type ConfigDraftSetter = Dispatch<SetStateAction<ConfigDraft | null>>;

export interface OpenPositionSummary {
  totalPnlUSDT: number;
  avgPnlPercent: number;
  lockedCapitalUSDT: number;
}

export interface DayPreviewSummary {
  dailyUsdtProfit: number;
  dailyPnlPercentSum: number;
}

export interface BalanceSummary {
  available: number;
  reserved: number;
  spendable: number;
  safeHaven: number;
  startingBalance: number;
  locked: number;
  total: number;
}

export interface LiveDashboardNavbarProps {
  coinTags?: Record<string, string[]>;
  dashboardState: SlowTradingDashboardState | null;
  onRefresh: () => Promise<void>;
  onReinitialize: () => Promise<void>;
  reinitializing: boolean;
  tagColors?: Record<string, string>;
  tagDescriptions?: Record<string, string>;
}
