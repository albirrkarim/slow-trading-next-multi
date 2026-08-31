import {
  MINIMAL_USDT_TO_TRADE,
  MINIMAL_USDT_TO_TRADE_BYPASS,
} from "./constants";
import type { executeAveraging as executeAveragingType } from "./execute/execute-averaging";
import type { executeEntry as executeEntryType } from "./execute/execute-entry";
import type { executeExit as executeExitType } from "./execute/execute-exit";
import { tradeLog } from "./helper/log";
import { notif } from "./helper/notification";
import position from "./position";

export * from "./type";
export * from "./constants";
export * from "./helper/log";
export * from "./helper/notification";

const executeAveragingLazy: typeof executeAveragingType = async (...args) => {
  const { executeAveraging } = await import("./execute/execute-averaging");
  return executeAveraging(...args);
};

const executeEntryLazy: typeof executeEntryType = async (...args) => {
  const { executeEntry } = await import("./execute/execute-entry");
  return executeEntry(...args);
};

const executeExitLazy: typeof executeExitType = async (...args) => {
  const { executeExit } = await import("./execute/execute-exit");
  return executeExit(...args);
};

/**
 * Grouped trading API for callers that need related execution, notification,
 * and config helpers without importing many standalone functions.
 */
const trading = {
  constants: {
    MINIMAL_USDT_TO_TRADE,
    MINIMAL_USDT_TO_TRADE_BYPASS,
  },
  execution: {
    averaging: executeAveragingLazy,
    entry: executeEntryLazy,
    exit: executeExitLazy,
  },
  log: tradeLog,
  notif,
  position,
} as const;

export default trading;
export { trading };
