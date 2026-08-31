import slowTradingStorage from "../storage";
import type {
  SlowTradingSafeHavenQueueItem,
  SlowTradingWithdrawalQueueItem,
} from "../types";
import slowTradingWithdrawal from "../withdrawal";
import { mutateSlowTradingQueues } from "./persistence";
import { SLOW_TRADING_QUEUE_RETRY_INTERVAL_MS } from "./scheduler";

/** Rounds queue currency values to the persisted SLOW precision. */
function roundUSDT(value: number): number {
  return Number(Math.max(0, value).toFixed(8));
}

/** Updates the shared debugging fields after one queue attempt. */
function updateAttempt(
  item: SlowTradingSafeHavenQueueItem | SlowTradingWithdrawalQueueItem,
  currentTimeMs: number,
  message: string,
) {
  item.lastAttemptAt = currentTimeMs;
  item.nextAttemptAt =
    currentTimeMs + SLOW_TRADING_QUEUE_RETRY_INTERVAL_MS;
  item.lastMessage = message;
}

/** Processes due Safe Haven items before external withdrawals. */
async function processSafeHavenQueues(currentTimeMs: number): Promise<number> {
  return mutateSlowTradingQueues(
    async (queues) => {
      let processed = 0;

      for (let index = queues.safeHaven.length - 1; index >= 0; index -= 1) {
        const item = queues.safeHaven[index];
        const storage = await slowTradingStorage.data.load({
          account: item.account,
          modeScope: "active",
        });
        const activeMode = slowTradingStorage.mode.getActive(storage);
        if (
          item.mode !== activeMode ||
          item.nextAttemptAt > currentTimeMs
        ) {
          continue;
        }

        processed += 1;
        const dashboard = slowTradingStorage.dashboard.buildState(storage);
        const spendableUSDT = roundUSDT(
          dashboard.balances.spendableQuoteAsset,
        );
        const minimumTradingCapitalUSDT = Math.max(
          0,
          Number(storage.config.modelConfig.minimalAssetOnTrade) || 0,
        );
        const currentTradingCapitalUSDT = roundUSDT(
          dashboard.balances.availableQuoteAsset -
            dashboard.balances.safeHaven +
            dashboard.balances.lockedQuoteAsset,
        );
        const availableAboveMinimumUSDT = roundUSDT(
          currentTradingCapitalUSDT - minimumTradingCapitalUSDT,
        );
        const amountUSDT = roundUSDT(
          Math.min(
            item.remainingUSDT,
            spendableUSDT,
            availableAboveMinimumUSDT,
          ),
        );

        if (!(amountUSDT > 0)) {
          updateAttempt(
            item,
            currentTimeMs,
            `Waiting for ${activeMode} spendable balance. ${item.remainingUSDT} USDT remains for Safe Haven.`,
          );
          continue;
        }

        const modeState = storage.modes[activeMode];
        const previousUSDT =
          Number(modeState.dynamicTradeMemory.safeHaven) || 0;
        const remainingUSDT = roundUSDT(item.remainingUSDT - amountUSDT);
        const { nextUSDT } = slowTradingStorage.safeHaven.applyUpdate(
          modeState,
          previousUSDT + amountUSDT,
        );
        modeState.dynamicTradeMemory.safeHavenRequest = roundUSDT(
          queues.safeHaven.reduce(
            (total, candidate, candidateIndex) =>
              total +
              (candidate.mode !== activeMode
                ? 0
                : candidateIndex === index
                  ? remainingUSDT
                  : candidate.remainingUSDT),
            0,
          ),
        );
        await slowTradingStorage.mode.saveState(activeMode, modeState, {
          account: storage.account.slug,
        });
        await slowTradingStorage.logs.appendSafeHaven({
          account: storage.account.slug,
          mode: activeMode,
          previousUSDT,
          nextUSDT,
          source: "safe_haven_queue",
          reason: `Safe Haven queue ${item.id}`,
          timestamp: currentTimeMs,
        });

        if (remainingUSDT <= 0) {
          queues.safeHaven.splice(index, 1);
          continue;
        }

        item.remainingUSDT = remainingUSDT;
        updateAttempt(
          item,
          currentTimeMs,
          `Moved ${amountUSDT} USDT into ${activeMode} Safe Haven. ${remainingUSDT} USDT remains.`,
        );
      }

      return processed;
    },
    {},
  );
}

/** Writes one changed queue failure without repeating the same log every tick. */
async function writeChangedWithdrawalFailure(params: {
  item: SlowTradingWithdrawalQueueItem;
  previousMessage: string;
  message: string;
  availableSafeHavenUSDT: number;
  currentTimeMs: number;
}) {
  if (params.message === params.previousMessage) {
    return;
  }

  await slowTradingStorage.logs.appendWithdrawal({
    account: params.item.account,
    trigger: "automatic",
    status: "failed",
    mode: "live",
    scheduleId: params.item.scheduleId,
    scheduleName: params.item.scheduleName,
    amountUSDT: params.item.amountUSDT,
    availableSafeHavenUSDT: params.availableSafeHavenUSDT,
    targetNetwork: params.item.targetNetwork,
    targetWalletAddress: params.item.targetWalletAddress,
    message: params.message,
    timestamp: params.currentTimeMs,
  });
}

/** Processes due withdrawal items all-or-nothing. */
async function processWithdrawalQueues(
  currentTimeMs: number,
): Promise<number> {
  return mutateSlowTradingQueues(async (queues) => {
    let processed = 0;

    for (let index = queues.withdrawals.length - 1; index >= 0; index -= 1) {
      const item = queues.withdrawals[index];
      if (item.nextAttemptAt > currentTimeMs) {
        continue;
      }

      processed += 1;
      const previousMessage = item.lastMessage;
      const storage = await slowTradingStorage.data.load({
        account: item.account,
        modeScope: "active",
      });
      const activeMode = slowTradingStorage.mode.getActive(storage);
      const schedule = storage.runtime.withdrawal.schedules.find(
        (candidate) => candidate.id === item.scheduleId,
      );
      const availableSafeHavenUSDT = roundUSDT(
        storage.modes[activeMode].dynamicTradeMemory.safeHaven,
      );

      if (activeMode !== "live") {
        updateAttempt(
          item,
          currentTimeMs,
          "Waiting for SLOW to return to live mode.",
        );
        continue;
      }

      if (!storage.runtime.withdrawal.autoEnabled) {
        updateAttempt(
          item,
          currentTimeMs,
          "Waiting because automatic withdrawal is disabled.",
        );
        continue;
      }

      if (!schedule) {
        const message =
          "Withdrawal schedule no longer exists. Delete this queue item or restore the schedule.";
        updateAttempt(item, currentTimeMs, message);
        await writeChangedWithdrawalFailure({
          item,
          previousMessage,
          message,
          availableSafeHavenUSDT,
          currentTimeMs,
        });
        continue;
      }

      if (!schedule.enabled) {
        updateAttempt(
          item,
          currentTimeMs,
          "Waiting because this withdrawal schedule is disabled.",
        );
        continue;
      }

      if (availableSafeHavenUSDT < item.amountUSDT) {
        updateAttempt(
          item,
          currentTimeMs,
          `Waiting for Safe Haven balance. ${item.amountUSDT} USDT is required; ${availableSafeHavenUSDT} USDT is available.`,
        );
        continue;
      }

      try {
        const result = await slowTradingWithdrawal.schedules.execute({
          scheduleId: item.scheduleId,
          trigger: "automatic",
          clientWithdrawId: item.clientWithdrawId,
          logAttempts: false,
        });

        await slowTradingStorage.logs.appendWithdrawal({
          account: item.account,
          trigger: "automatic",
          status: "executed",
          mode: "live",
          scheduleId: item.scheduleId,
          scheduleName: item.scheduleName,
          amountUSDT: result.amountUSDT,
          availableSafeHavenUSDT,
          targetNetwork: result.targetNetwork,
          targetWalletAddress: result.targetWalletAddress,
          message: result.message,
          ...(result.withdrawId ? { withdrawId: result.withdrawId } : {}),
          timestamp: currentTimeMs,
        });
        queues.withdrawals.splice(index, 1);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Automatic withdrawal failed.";
        updateAttempt(item, currentTimeMs, message);
        await writeChangedWithdrawalFailure({
          item,
          previousMessage,
          message,
          availableSafeHavenUSDT,
          currentTimeMs,
        });
      }
    }

    return processed;
  });
}

/** Attempts every due queue item in Safe Haven then withdrawal order. */
export async function processDueSlowTradingQueues(
  currentTimeMs = Date.now(),
): Promise<{
  safeHavenAttempts: number;
  withdrawalAttempts: number;
}> {
  const safeHavenAttempts = await processSafeHavenQueues(currentTimeMs);
  const withdrawalAttempts = await processWithdrawalQueues(currentTimeMs);

  return {
    safeHavenAttempts,
    withdrawalAttempts,
  };
}
