import slowTradingStorage from "../storage";
import {
  deleteSlowTradingQueueItem,
  loadSlowTradingQueues,
  type SlowTradingQueueKind,
} from "./persistence";
import { createManualSlowTradingQueueItem } from "./manual";
import { processDueSlowTradingQueues } from "./processor";
import {
  SLOW_TRADING_QUEUE_RETRY_INTERVAL_MS,
  synchronizeSlowTradingQueues,
} from "./scheduler";

/** Loads queues while assigning legacy Safe Haven items to the active mode. */
async function loadActiveSlowTradingQueues() {
  const storage = await slowTradingStorage.data.load({
    modeScope: "active",
  });
  const activeMode = slowTradingStorage.mode.getActive(storage);
  return loadSlowTradingQueues({
    legacySafeHavenMode: activeMode,
  });
}

/** Cancels one pending item while preserving its scheduler timing marker. */
async function cancelSlowTradingQueueItem(
  kind: SlowTradingQueueKind,
  id: string,
): Promise<boolean> {
  const storage = await slowTradingStorage.data.load();
  const activeMode = slowTradingStorage.mode.getActive(storage);
  const queueLoadOptions = {
    legacySafeHavenMode: activeMode,
  } as const;
  const currentQueues = await loadSlowTradingQueues(queueLoadOptions);
  const safeHavenItem = currentQueues.safeHaven.find((item) => item.id === id);
  const deleted = await deleteSlowTradingQueueItem(
    kind,
    id,
    queueLoadOptions,
  );
  if (!deleted || kind !== "safe_haven") {
    return deleted;
  }

  const mode = safeHavenItem?.mode ?? activeMode;
  const queues = await loadSlowTradingQueues(queueLoadOptions);
  storage.modes[mode].dynamicTradeMemory.safeHavenRequest =
    queues.safeHaven.reduce(
      (total, item) =>
        total + (item.mode === mode ? item.remainingUSDT : 0),
      0,
    );
  await slowTradingStorage.mode.saveState(mode, storage.modes[mode]);
  return true;
}

/**
 * Grouped persistent queue API for SLOW schedulers, processors, and dashboard
 * management.
 */
const slowTradingQueue = {
  items: {
    cancel: cancelSlowTradingQueueItem,
    createManual: createManualSlowTradingQueueItem,
    load: loadActiveSlowTradingQueues,
  },
  processor: {
    processDue: processDueSlowTradingQueues,
  },
  scheduler: {
    retryIntervalMs: SLOW_TRADING_QUEUE_RETRY_INTERVAL_MS,
    synchronize: synchronizeSlowTradingQueues,
  },
} as const;

export default slowTradingQueue;
export { slowTradingQueue };
export type { SlowTradingQueueKind } from "./persistence";
