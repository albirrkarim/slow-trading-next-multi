import slowTradingStorage from "../storage";
import type {
  SlowTradingManualQueueCreateInput,
  SlowTradingQueueItem,
  SlowTradingSafeHavenQueueItem,
  SlowTradingWithdrawalQueueItem,
} from "../types";
import {
  loadSlowTradingQueues,
  mutateSlowTradingQueues,
} from "./persistence";

/** Formats a timestamp as the UTC month key used by Safe Haven queues. */
function getUtcMonthKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Creates one queue item from the dashboard and advances its normal scheduler
 * marker so deleting the item cannot immediately recreate it.
 */
export async function createManualSlowTradingQueueItem(
  input: SlowTradingManualQueueCreateInput,
  currentTimeMs = Date.now(),
): Promise<SlowTradingQueueItem> {
  const storage = await slowTradingStorage.data.load();
  const activeMode = slowTradingStorage.mode.getActive(storage);
  const queueLoadOptions = {
    legacySafeHavenMode: activeMode,
  } as const;

  if (input.kind === "safe_haven") {
    const amountUSDT = Number(
      Math.max(0, Number(input.amountUSDT) || 0).toFixed(8),
    );
    if (!(amountUSDT > 0)) {
      throw new Error("Safe Haven queue amount must be greater than 0 USDT.");
    }

    const period = getUtcMonthKey(currentTimeMs);
    const item = await mutateSlowTradingQueues(
      (queues) => {
        if (
          queues.safeHaven.some(
            (candidate) =>
              candidate.mode === activeMode && !candidate.scheduleId,
          )
        ) {
          throw new Error(
            `A ${activeMode} Safe Haven queue item is already pending.`,
          );
        }

        const created: SlowTradingSafeHavenQueueItem = {
          id: `safe-haven-manual-${activeMode}-${currentTimeMs}`,
          kind: "safe_haven",
          mode: activeMode,
          period,
          requestedUSDT: amountUSDT,
          remainingUSDT: amountUSDT,
          createdAt: currentTimeMs,
          nextAttemptAt: currentTimeMs,
          lastMessage: `Manually queued ${amountUSDT} USDT for ${activeMode} Safe Haven.`,
        };
        queues.safeHaven.push(created);
        return created;
      },
      queueLoadOptions,
    );

    storage.modes[activeMode].dynamicTradeMemory.lastSafeHavenRequest =
      currentTimeMs;
    const queues = await loadSlowTradingQueues(queueLoadOptions);
    storage.modes[activeMode].dynamicTradeMemory.safeHavenRequest =
      queues.safeHaven.reduce(
        (total, candidate) =>
          total +
          (candidate.mode === activeMode ? candidate.remainingUSDT : 0),
        0,
      );
    await slowTradingStorage.mode.saveState(
      activeMode,
      storage.modes[activeMode],
    );
    return item;
  }

  const scheduleId = String(input.scheduleId ?? "").trim();
  const schedule = storage.runtime.withdrawal.schedules.find(
    (candidate) => candidate.id === scheduleId,
  );
  if (!schedule) {
    throw new Error("Choose an existing withdrawal schedule.");
  }

  const amountUSDT = Math.max(0, Number(schedule.amountUSDT) || 0);
  if (!(amountUSDT > 0)) {
    throw new Error("Withdrawal schedule amount must be greater than 0 USDT.");
  }

  const wallet = schedule.walletId
    ? storage.runtime.withdrawal.walletBook.find(
        (candidate) => candidate.id === schedule.walletId,
      )
    : undefined;
  const targetNetwork = String(wallet?.network ?? schedule.targetNetwork)
    .trim()
    .toUpperCase();
  const targetWalletAddress = String(
    wallet?.address ?? schedule.targetWalletAddress,
  ).trim();
  const item = await mutateSlowTradingQueues(
    (queues) => {
      if (
        queues.withdrawals.some(
          (candidate) => candidate.scheduleId === schedule.id,
        )
      ) {
        throw new Error(
          `A withdrawal queue item for schedule "${schedule.name}" is already pending.`,
        );
      }

      const created: SlowTradingWithdrawalQueueItem = {
        id: `withdrawal-manual-${schedule.id}-${currentTimeMs}`,
        kind: "withdrawal",
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        amountUSDT,
        targetNetwork,
        targetWalletAddress,
        clientWithdrawId: `slow-${schedule.id}-${currentTimeMs}`.slice(0, 64),
        createdAt: currentTimeMs,
        nextAttemptAt: currentTimeMs,
        lastMessage: `Manually queued automatic withdrawal schedule "${schedule.name}" for ${amountUSDT} USDT.`,
      };
      queues.withdrawals.push(created);
      return created;
    },
    queueLoadOptions,
  );

  await slowTradingStorage.data.update({
    withdrawal: {
      schedules: storage.runtime.withdrawal.schedules.map((candidate) =>
        candidate.id === schedule.id
          ? { ...candidate, lastQueuedAt: currentTimeMs }
          : candidate,
      ),
    },
  });

  return item;
}
