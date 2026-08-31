import slowTradingEntrySequences from "./entry-sequences";
import slowTradingStages from "./stages";
import slowTradingWatchReserve from "./watch-reserve";
import slowTradingWorkerCapacity from "./worker-capacity";

/**
 * Client-safe grouped SLOW trading API.
 *
 * Browser components must use this facade instead of the full server SLOW API,
 * because the server API includes storage, runner, and notification modules.
 */
const slowTradingClient = {
  entrySequences: slowTradingEntrySequences,
  stages: slowTradingStages,
  watchReserve: slowTradingWatchReserve,
  workerCapacity: slowTradingWorkerCapacity,
} as const;

export default slowTradingClient;
export { slowTradingClient };
export type {
  SlowEntrySequenceCount,
  SlowEntrySequenceInterval,
  SlowSystemCapacityEstimate,
  SlowSystemCapacitySequence,
  SlowWorkerNeededEstimate,
} from "./entry-sequences";
export type { SlowWorkerCapacity } from "./worker-capacity";
export type * from "./types";
