"use client";

import { useEffect, useMemo, useState } from "react";

import axios from "axios";

import { endpoints } from "@/components/endpoints";
import { tradeLog } from "@/lib/trading/helper/log";

import {
  computeAutoEntryActive,
  computeDayPreview,
  computeOpenPositionSummary,
  makeConfigDraft,
  parseSymbols,
} from "./helpers";
import type {
  ConfigDraft,
  ConfigDraftSetter,
  DashboardState,
  LiveDashboardNavbarProps,
} from "./types";

interface SlowTradingRunResponse {
  mode: "live" | "sandbox";
  reports: Array<{ message: string }>;
  executedEntrySignals: number;
  availableQuoteAsset: number;
  lastRunAt?: number;
  skipped?: boolean;
}

interface SlowTradingWithdrawTryResponse {
  message: string;
}

interface UseLiveDashboardNavbarArgs {
  dashboardState: DashboardState | null;
  onRefresh: LiveDashboardNavbarProps["onRefresh"];
}

function buildWithdrawalPayload(configDraft: ConfigDraft) {
  return {
    autoEnabled: configDraft.withdrawalAutoEnabled,
    schedules: configDraft.withdrawalSchedules.map((schedule, index) => ({
      id: schedule.id || `schedule-${index + 1}`,
      account: schedule.account || configDraft.exchangeAccountSlug,
      name: schedule.name || `Schedule ${index + 1}`,
      enabled: schedule.enabled,
      amountUSDT: Math.max(0, Number(schedule.amountUSDT) || 0),
      dayOfMonth: Math.min(
        31,
        Math.max(1, Math.floor(Number(schedule.dayOfMonth) || 1)),
      ),
      walletId: schedule.walletId || undefined,
      targetNetwork: schedule.targetNetwork,
      targetWalletAddress: schedule.targetWalletAddress,
      lastAttemptAt: schedule.lastAttemptAt,
      lastSuccessAt: schedule.lastSuccessAt,
      lastQueuedAt: schedule.lastQueuedAt,
      lastStatus: schedule.lastStatus,
    })),
    walletBook: configDraft.withdrawalWalletBook.map((wallet, index) => ({
      id: wallet.id || `wallet-${index + 1}`,
      name: wallet.name || `Wallet ${index + 1}`,
      network: wallet.network,
      address: wallet.address,
    })),
  };
}

function buildSafeHavenPayload(configDraft: ConfigDraft) {
  return {
    autoEnabled: Boolean(configDraft.safeHavenAutoEnabled),
    schedules: (configDraft.safeHavenSchedules ?? []).map((schedule, index) => ({
      id: schedule.id || `safe-haven-${index + 1}`,
      name: schedule.name || `Safe Haven ${index + 1}`,
      enabled: schedule.enabled,
      amountUSDT: Math.max(0, Number(schedule.amountUSDT) || 0),
      pct: Math.min(100, Math.max(0, Number(schedule.pct) || 0)),
      dayOfMonth: Math.min(
        31,
        Math.max(1, Math.floor(Number(schedule.dayOfMonth) || 1)),
      ),
      lastQueuedAt: schedule.lastQueuedAt,
    })),
  };
}

export function useLiveDashboardNavbar({
  dashboardState,
  onRefresh,
}: UseLiveDashboardNavbarArgs) {
  const [configDraft, setConfigDraftState] = useState<ConfigDraft | null>(null);
  const [runningCycle, setRunningCycle] = useState(false);
  const [resettingSandboxAccount, setResettingSandboxAccount] = useState<
    string | null
  >(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [syncingOnlineStorage, setSyncingOnlineStorage] = useState(false);
  const [tryingWithdraw, setTryingWithdraw] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isConfigDraftDirty, setIsConfigDraftDirty] = useState(false);

  useEffect(() => {
    if (!dashboardState) {
      setConfigDraftState(null);
      return;
    }

    if (isSettingsDialogOpen && isConfigDraftDirty) {
      return;
    }

    setConfigDraftState(makeConfigDraft(dashboardState));
  }, [dashboardState, isConfigDraftDirty, isSettingsDialogOpen]);

  const setConfigDraft: ConfigDraftSetter = (value) => {
    if (isSettingsDialogOpen) {
      setIsConfigDraftDirty(true);
    }

    setConfigDraftState((prev) =>
      typeof value === "function" ? value(prev) : value,
    );
  };

  const openSettingsDialog = () => {
    setIsSettingsDialogOpen(true);
    setIsConfigDraftDirty(false);
  };

  const closeSettingsDialog = () => {
    setIsSettingsDialogOpen(false);
    setIsConfigDraftDirty(false);
  };

  const saveConfig = async (handleClose?: () => void) => {
    if (!configDraft) {
      return;
    }

    setSavingConfig(true);
    try {
      const symbolsParsed = parseSymbols(configDraft.symbolsText);
      if (symbolsParsed.length === 0) {
        alert("Please define at least one symbol");
        return;
      }

      const sandboxInitialBalanceUSDT = Math.max(
        0,
        Number(configDraft.sandboxInitialBalanceUSDT) || 0,
      );
      const safeHavenUSDT = Math.max(
        0,
        Number(configDraft.safeHavenUSDT) || 0,
      );

      await axios.put(endpoints.slow.prod.exchangeAccounts, {
        accounts: configDraft.exchangeAccounts,
        exchangeAccountSlug: configDraft.exchangeAccountSlug,
      });

      await axios.put(endpoints.slow.prod.storage, {
        config: {
          name: configDraft.name,
          description: configDraft.description,
          decisionEngineVersion: configDraft.decisionEngineVersion,
          exchangeType: configDraft.exchangeType,
          tradingMode: configDraft.tradingMode,
          symbols: symbolsParsed,
          modelConfig: configDraft.modelConfig,
          enableWatchLogic: configDraft.enableWatchLogic,
          watchReserveLevels: configDraft.watchReserveLevels,
          watchMaxNextAveragingLevels: configDraft.watchMaxNextAveragingLevels,
          watchReservePctAlloc: configDraft.watchReservePctAlloc,
          adaptiveAveraging: configDraft.adaptiveAveraging,
          averagingRescueProjectionGuardEnabled:
            configDraft.averagingRescueProjectionGuardEnabled,
          exitSidewaysToFreeWorkersForStrongCandidates:
            configDraft.exitSidewaysToFreeWorkersForStrongCandidates,
          maxEntryBased24HourVolPct: configDraft.maxEntryBased24HourVolPct,
          maxEntryMarginPct: configDraft.maxEntryMarginPct,
          maxEntryMargin: configDraft.maxEntryMargin,
          maxOpenPositions: Math.max(
            0,
            Math.floor(Number(configDraft.maxOpenPositions) || 0),
          ),
          minActionableAbsoluteLevel:
            configDraft.minActionableAbsoluteLevel,
          maxLeverage: configDraft.maxLeverage,
          exactLeverage: configDraft.exactLeverage,
          blackSwan: configDraft.blackSwan,
        },
        exchangeAccountSlug: configDraft.exchangeAccountSlug,
        runnerEnabled: configDraft.runnerEnabled,
        autoEntryEnabled: configDraft.autoEntryEnabled,
        autoEntryDailyPnlLimitUSDT: Math.min(
          0,
          Number.isFinite(Number(configDraft.autoEntryDailyPnlLimitUSDT))
            ? Number(configDraft.autoEntryDailyPnlLimitUSDT)
            : -50,
        ),
        autoExitEnabled: configDraft.autoExitEnabled,
        entrySignalBypass: configDraft.entrySignalBypass,
        autoRemoveSymbolAbsLevel: Math.max(
          0,
          Math.floor(Number(configDraft.autoRemoveSymbolAbsLevel) || 0),
        ),
        autoRemoveSymbolMinPrice: Math.max(
          0,
          Number(configDraft.autoRemoveSymbolMinPrice) || 0,
        ),
        autoRemoveSymbolMinMarketCapUSD: Math.max(
          0,
          Number(configDraft.autoRemoveSymbolMinMarketCapUSD) || 0,
        ),
        autoRemoveSymbolMinVPointPct: Math.max(
          0,
          Number(configDraft.autoRemoveSymbolMinVPointPct) || 0,
        ),
        pnlHistoryBucketMinutes: Math.max(
          1,
          Math.floor(Number(configDraft.pnlHistoryBucketMinutes) || 60),
        ),
        blackSwanStageIntervalMinutes: Math.max(
          1,
          Math.floor(Number(configDraft.blackSwanStageIntervalMinutes) || 1),
        ),
        speedupStageIntervalMinutes: Math.max(
          1,
          Math.floor(Number(configDraft.speedupStageIntervalMinutes) || 1),
        ),
        speedupStagePositivePnlThresholdPct: Math.max(
          0,
          Number.isFinite(
            Number(configDraft.speedupStagePositivePnlThresholdPct),
          )
            ? Number(configDraft.speedupStagePositivePnlThresholdPct)
            : 1.5,
        ),
        speedupStageNegativePnlThresholdPct: Math.max(
          0,
          Number.isFinite(
            Number(configDraft.speedupStageNegativePnlThresholdPct),
          )
            ? Number(configDraft.speedupStageNegativePnlThresholdPct)
            : 1.5,
        ),
        speedupStageTakeProfitOffsetPct: Math.max(
          0,
          Number.isFinite(Number(configDraft.speedupStageTakeProfitOffsetPct))
            ? Number(configDraft.speedupStageTakeProfitOffsetPct)
            : 0.5,
        ),
        standardMonitoringStageIntervalMinutes: Math.max(
          1,
          Math.floor(
            Number(configDraft.standardMonitoringStageIntervalMinutes) || 5,
          ),
        ),
        managementStageIntervalMinutes: Math.max(
          1,
          Math.floor(Number(configDraft.managementStageIntervalMinutes) || 5),
        ),
        captureEntryStageIntervalMinutes: Math.max(
          1,
          Math.floor(Number(configDraft.captureEntryStageIntervalMinutes) || 5),
        ),
        notification: configDraft.notification,
        sandboxEnabled: configDraft.sandboxEnabled,
        sandboxInitialBalanceUSDT,
        safeHavenUSDT,
        safeHaven: buildSafeHavenPayload(configDraft),
        withdrawal: buildWithdrawalPayload(configDraft),
      });

      setIsConfigDraftDirty(false);
      handleClose?.();
      await onRefresh();
    } catch (error: any) {
      tradeLog.error(error);
      alert(error.response?.data?.error ?? "Save config failed");
    } finally {
      setSavingConfig(false);
    }
  };

  const tryWithdrawNow = async (scheduleId: string) => {
    if (!configDraft) {
      return;
    }

    const schedule = configDraft.withdrawalSchedules.find(
      (item) => item.id === scheduleId,
    );
    if (!schedule) {
      alert("Please choose a withdrawal schedule first.");
      return;
    }

    setTryingWithdraw(true);
    try {
      const safeHavenUSDT = Math.max(
        0,
        Number(configDraft.safeHavenUSDT) || 0,
      );

      await axios.put(endpoints.slow.prod.storage, {
        safeHavenUSDT,
        withdrawal: buildWithdrawalPayload(configDraft),
      });

      const response = await axios.post<SlowTradingWithdrawTryResponse>(
        endpoints.slow.prod.withdraw,
        { scheduleId },
      );
      alert(response.data.message);
      setIsConfigDraftDirty(false);
      await onRefresh();
    } catch (error: any) {
      tradeLog.error(error);
      alert(
        error?.response?.data?.message ??
          error?.response?.data?.error ??
          "Try withdraw flow failed",
      );
    } finally {
      setTryingWithdraw(false);
    }
  };

  const runCycle = async () => {
    setRunningCycle(true);
    try {
      await axios.post<SlowTradingRunResponse>(endpoints.slow.prod.run, {});
      await onRefresh();
    } catch (error) {
      tradeLog.error(error);
      alert("Run cycle failed");
    } finally {
      setRunningCycle(false);
    }
  };

  const resetSandbox = async (accountSlug: string) => {
    if (!configDraft) {
      return;
    }
    const account = configDraft.exchangeAccounts.find(
      (candidate) => candidate.slug === accountSlug,
    );
    if (!account) {
      alert("Account not found");
      return;
    }

    if (
      !confirm(
        `Reset ${account.name} sandbox positions, history, and balance to its configured initial balance?`,
      )
    ) {
      return;
    }

    setResettingSandboxAccount(account.slug);
    try {
      const sandboxInitialBalanceUSDT = Math.max(
        0,
        Number(account.sandbox.initialBalanceUSDT) || 0,
      );
      await axios.post(endpoints.slow.prod.reset, {
        account: account.slug,
        sandboxInitialBalanceUSDT,
      });
      await onRefresh();
    } catch (error) {
      tradeLog.error(error);
      alert("Reset sandbox failed");
    } finally {
      setResettingSandboxAccount(null);
    }
  };

  const syncOnlineStorageToLocal = async (onlineBaseUrl: string) => {
    const normalizedOnlineBaseUrl = onlineBaseUrl.trim();

    if (!normalizedOnlineBaseUrl) {
      alert("Please enter the online base URL to sync from.");
      return;
    }

    if (
      !confirm(
        `Replace this server's persistent storage with storage from ${normalizedOnlineBaseUrl}? A timestamped backup of this server will be created first.`,
      )
    ) {
      return;
    }

    setSyncingOnlineStorage(true);
    try {
      const response = await axios.post(endpoints.slow.prod.syncOnlineToLocal, {
        onlineBaseUrl: normalizedOnlineBaseUrl,
      });
      const backupPath = response.data?.backupPath
        ? `\nBackup: ${response.data.backupPath}`
        : "";
      alert(
        `Storage cloned from ${normalizedOnlineBaseUrl} to this server.${backupPath}`,
      );
      setIsConfigDraftDirty(false);
    } catch (error: any) {
      tradeLog.error(error);
      alert(
        error?.response?.data?.error ??
          error?.response?.data?.message ??
          "Storage clone failed",
      );
    } finally {
      setSyncingOnlineStorage(false);
    }
  };

  const isActive = computeAutoEntryActive(dashboardState);

  const openPositionSummary = useMemo(
    () => computeOpenPositionSummary(dashboardState),
    [dashboardState],
  );

  const dayPreview = useMemo(
    () => computeDayPreview(dashboardState),
    [dashboardState],
  );

  return {
    configDraft,
    dayPreview,
    isActive,
    openPositionSummary,
    resetSandbox,
    resettingSandboxAccount,
    runCycle,
    runningCycle,
    saveConfig,
    savingConfig,
    syncOnlineStorageToLocal,
    syncingOnlineStorage,
    tryWithdrawNow,
    tryingWithdraw,
    closeSettingsDialog,
    openSettingsDialog,
    setConfigDraft,
  };
}
