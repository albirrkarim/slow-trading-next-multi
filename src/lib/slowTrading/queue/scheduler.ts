import { getAmountToSave } from "@/lib/dynamic/utils/safeHaven";

import slowTradingStorage from "../storage";
import slowTradingSafeHavenSchedule from "../safe-haven-schedule";
import slowTradingWithdrawalSchedule from "../withdrawal-schedule";
import type {
  SlowTradingSafeHavenQueueItem,
  SlowTradingWithdrawalSchedule,
} from "../types";
import {
  loadSlowTradingQueues,
  mutateSlowTradingQueues,
} from "./persistence";

export const SLOW_TRADING_QUEUE_RETRY_INTERVAL_MS = 5 * 60 * 1000;

/** Formats a timestamp as the UTC month key used by Safe Haven scheduling. */
function getUtcMonthKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Checks whether an optional legacy marker belongs to the current UTC month. */
function isSameUtcMonth(first: number | undefined, second: number): boolean {
  return Boolean(first && getUtcMonthKey(first) === getUtcMonthKey(second));
}

/** Rounds queue currency values without introducing display-only precision. */
function roundUSDT(value: number): number {
  return Number(Math.max(0, value).toFixed(8));
}

/** Resolves the wallet target currently selected by a withdrawal schedule. */
function getWithdrawalTarget(
  schedule: SlowTradingWithdrawalSchedule,
  storage: Awaited<ReturnType<typeof slowTradingStorage.data.load>>,
): {
  targetNetwork: string;
  targetWalletAddress: string;
} {
  const wallet = schedule.walletId
    ? storage.runtime.withdrawal.walletBook.find(
        (item) => item.id === schedule.walletId,
      )
    : undefined;

  return {
    targetNetwork: String(wallet?.network ?? schedule.targetNetwork)
      .trim()
      .toUpperCase(),
    targetWalletAddress: String(
      wallet?.address ?? schedule.targetWalletAddress,
    ).trim(),
  };
}

/**
 * Creates due queue items and refreshes pending withdrawal details.
 *
 * Safe Haven and withdrawal schedules use configured UTC calendar days, with
 * short months clamped to their final day and overdue work created on the next
 * active runner pass.
 */
export async function synchronizeSlowTradingQueues(
  currentTimeMs = Date.now(),
  account?: string,
) {
  const storage = await slowTradingStorage.data.load({
    account,
    modeScope: "active",
  });
  const activeMode = slowTradingStorage.mode.getActive(storage);

  if (!storage.runtime.runnerEnabled) {
    return loadSlowTradingQueues({
      legacySafeHavenMode: activeMode,
    });
  }

  const modeState = storage.modes[activeMode];
  const safeConfig = storage.config.modelConfig;
  const period = getUtcMonthKey(currentTimeMs);
  const queueLoadOptions = {
    legacySafeHavenMode: activeMode,
  } as const;
  const initialQueues = await loadSlowTradingQueues(queueLoadOptions);
  const dueSafeHavenSchedules = storage.runtime.safeHaven.autoEnabled
    ? storage.runtime.safeHaven.schedules.filter(
        (schedule) =>
          !initialQueues.safeHaven.some(
            (item) =>
              item.account === storage.account.slug &&
              item.mode === activeMode && item.scheduleId === schedule.id,
          ) &&
          slowTradingSafeHavenSchedule.timing.isDue(
            schedule,
            activeMode,
            currentTimeMs,
          ),
      )
    : [];
  const dashboard =
    activeMode === "live" &&
    dueSafeHavenSchedules.length > 0 &&
    process.env.NODE_ENV !== "test"
    ? await slowTradingStorage.dashboard.buildStateRealtime(storage)
    : slowTradingStorage.dashboard.buildState(storage);

  const synchronization = await mutateSlowTradingQueues(
    (queues) => {
      const safeHavenQueuedAt: Record<string, number> = {};
      const withdrawalQueuedAt: Record<string, number> = {};

      // PROD:SAFE_HAVEN_SCHEDULE_QUEUE
      for (const schedule of storage.runtime.safeHaven.schedules) {
        const existing = queues.safeHaven.find(
          (item) =>
            item.account === storage.account.slug &&
            item.mode === activeMode &&
            (item.scheduleId === schedule.id ||
              (!item.scheduleId && schedule.id === "legacy-safe-haven")),
        );
        if (existing) {
          existing.scheduleId = schedule.id;
          existing.scheduleName = schedule.name;
          if (!schedule.lastQueuedAt?.[activeMode]) {
            safeHavenQueuedAt[schedule.id] = existing.createdAt;
          }
          continue;
        }
        if (
          schedule.id === "legacy-safe-haven" &&
          !schedule.lastQueuedAt?.[activeMode] &&
          isSameUtcMonth(
            modeState.dynamicTradeMemory.lastSafeHavenRequest,
            currentTimeMs,
          )
        ) {
          safeHavenQueuedAt[schedule.id] =
            modeState.dynamicTradeMemory.lastSafeHavenRequest as number;
          continue;
        }
        if (
          !storage.runtime.safeHaven.autoEnabled ||
          !slowTradingSafeHavenSchedule.timing.isDue(
            schedule,
            activeMode,
            currentTimeMs,
          )
        ) {
          continue;
        }

        const currentAsset =
          dashboard.balances.availableQuoteAsset +
          dashboard.balances.lockedQuoteAsset;
        const amountUSDT = roundUSDT(
          getAmountToSave({
            config: {
              safeUSDTPerMonth: schedule.amountUSDT,
              safePercentPerMonth: schedule.pct / 100,
              minimalAssetOnTrade: safeConfig.minimalAssetOnTrade,
            },
            currentAsset,
          }),
        );
        safeHavenQueuedAt[schedule.id] = currentTimeMs;

        if (amountUSDT > 0) {
          const item: SlowTradingSafeHavenQueueItem = {
            account: storage.account.slug,
            id: `safe-haven-${activeMode}-${schedule.id}-${currentTimeMs}`,
            kind: "safe_haven",
            mode: activeMode,
            period,
            scheduleId: schedule.id,
            scheduleName: schedule.name,
            requestedUSDT: amountUSDT,
            remainingUSDT: amountUSDT,
            createdAt: currentTimeMs,
            nextAttemptAt: currentTimeMs,
            lastMessage: `Queued Safe Haven schedule "${schedule.name}" for ${amountUSDT} USDT.`,
          };
          queues.safeHaven.push(item);
        }
      }

      // PROD:WITHDRAW_QUEUE
      const scheduleById = new Map(
        storage.runtime.withdrawal.schedules
          .filter((schedule) => schedule.account === storage.account.slug)
          .map((schedule) => [
          schedule.id,
          schedule,
          ]),
      );

      for (const item of queues.withdrawals) {
        const schedule = scheduleById.get(item.scheduleId);
        if (!schedule) {
          continue;
        }

        const target = getWithdrawalTarget(schedule, storage);
        item.scheduleName = schedule.name;
        const amountUSDT = Math.max(0, Number(schedule.amountUSDT) || 0);
        if (amountUSDT > 0) {
          item.amountUSDT = amountUSDT;
        }
        item.targetNetwork = target.targetNetwork;
        item.targetWalletAddress = target.targetWalletAddress;
        if (!schedule.lastQueuedAt) {
          withdrawalQueuedAt[schedule.id] = item.createdAt;
        }
      }

      if (
        activeMode === "live" &&
        storage.config.exchangeType === "binance" &&
        storage.runtime.withdrawal.autoEnabled
      ) {
        for (const schedule of storage.runtime.withdrawal.schedules) {
          if (schedule.account !== storage.account.slug) continue;
          const alreadyQueued = queues.withdrawals.some(
            (item) =>
              item.account === storage.account.slug &&
              item.scheduleId === schedule.id,
          );
          if (
            alreadyQueued ||
            !slowTradingWithdrawalSchedule.timing.isDue(
              schedule,
              currentTimeMs,
            )
          ) {
            continue;
          }

          const amountUSDT = Math.max(0, Number(schedule.amountUSDT) || 0);
          if (!(amountUSDT > 0)) {
            continue;
          }

          const target = getWithdrawalTarget(schedule, storage);
          const id = `withdrawal-${schedule.id}-${currentTimeMs}`;
          queues.withdrawals.push({
            account: storage.account.slug,
            id,
            kind: "withdrawal",
            scheduleId: schedule.id,
            scheduleName: schedule.name,
            amountUSDT,
            targetNetwork: target.targetNetwork,
            targetWalletAddress: target.targetWalletAddress,
            clientWithdrawId: `slow-${schedule.id}-${currentTimeMs}`.slice(0, 64),
            createdAt: currentTimeMs,
            nextAttemptAt: currentTimeMs,
            lastMessage: `Queued automatic withdrawal schedule "${schedule.name}" for ${amountUSDT} USDT.`,
          });
          withdrawalQueuedAt[schedule.id] = currentTimeMs;
        }
      }

      return {
        safeHavenQueuedAt,
        withdrawalQueuedAt,
      };
    },
    queueLoadOptions,
  );

  if (Object.keys(synchronization.safeHavenQueuedAt).length > 0) {
    const latestQueues = await loadSlowTradingQueues(queueLoadOptions);
    const activeItems = latestQueues.safeHaven.filter(
      (item) =>
        item.account === storage.account.slug && item.mode === activeMode,
    );
    modeState.dynamicTradeMemory.lastSafeHavenRequest = Math.max(
      currentTimeMs,
      ...activeItems.map((item) => item.createdAt),
    );
    modeState.dynamicTradeMemory.safeHavenRequest = roundUSDT(
      activeItems.reduce((total, item) => total + item.remainingUSDT, 0),
    );
    await slowTradingStorage.mode.saveState(activeMode, modeState, {
      account: storage.account.slug,
    });
    await slowTradingStorage.data.update({
      exchangeAccountSlug: storage.account.slug,
      safeHaven: {
        schedules: storage.runtime.safeHaven.schedules.map((schedule) => ({
          ...schedule,
          ...(synchronization.safeHavenQueuedAt[schedule.id]
            ? {
                lastQueuedAt: {
                  ...schedule.lastQueuedAt,
                  [activeMode]:
                    synchronization.safeHavenQueuedAt[schedule.id],
                },
              }
            : {}),
        })),
      },
    });
  }

  if (Object.keys(synchronization.withdrawalQueuedAt).length > 0) {
    await slowTradingStorage.data.update({
      exchangeAccountSlug: storage.account.slug,
      withdrawal: {
        schedules: storage.runtime.withdrawal.schedules.map((schedule) => ({
          ...schedule,
          ...(synchronization.withdrawalQueuedAt[schedule.id]
            ? {
                lastQueuedAt:
                  synchronization.withdrawalQueuedAt[schedule.id],
              }
            : {}),
        })),
      },
    });
  }

  return loadSlowTradingQueues(queueLoadOptions);
}
