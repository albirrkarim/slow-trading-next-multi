import slowTradingBalanceSummary from "./balance-summary";
import slowTradingDebugSync from "./debug-sync";
import slowTradingEntrySequences from "./entry-sequences";
import slowTradingExchangeSync from "./exchange-sync";
import slowTradingFinanceSummary from "./finance-summary";
import slowTradingMarketVolume from "./market-volume";
import slowTradingManagement from "./management";
import slowTradingMcp from "./mcp";
import slowQuickBacktest from "./quick-backtest";
import slowTradingReporting from "./reporting";
import { SlowTradingRunner } from "./runner";
import slowTradingCycle from "./cycle";
import slowTradingNotifications from "./notifications";
import slowTradingPerformance from "./performance";
import slowTradingQueue from "./queue";
import slowTradingSignals from "./signals";
import slowTradingStages from "./stages";
import slowTradingStorage from "./storage";
import slowTradingWatchReserve from "./watch-reserve";
import slowTradingWorkerCapacity from "./worker-capacity";
import slowTradingWithdrawal from "./withdrawal";
import slowTradingBlackSwan from "./black-swan";
import slowTradingDailyPnlLimit from "./daily-pnl-limit";

/**
 * Grouped SLOW trading API. Prefer this facade for new SLOW orchestration code
 * when a caller needs several related operations.
 */
const slowTrading = {
  balanceSummary: slowTradingBalanceSummary,
  blackSwan: slowTradingBlackSwan,
  debugSync: slowTradingDebugSync,
  dailyPnlLimit: slowTradingDailyPnlLimit,
  entrySequences: slowTradingEntrySequences,
  exchangeSync: slowTradingExchangeSync,
  financeSummary: slowTradingFinanceSummary,
  marketVolume: slowTradingMarketVolume,
  management: slowTradingManagement,
  mcp: slowTradingMcp,
  quickBacktest: slowQuickBacktest,
  reporting: slowTradingReporting,
  runner: {
    Instance: SlowTradingRunner,
    get: async () => {
      const { getSlowTradingRunner } = await import("./singleton");
      return getSlowTradingRunner();
    },
  },
  notifications: slowTradingNotifications,
  performance: slowTradingPerformance,
  queue: slowTradingQueue,
  service: {
    runSlowTradingCycle: slowTradingCycle.run,
  },
  signals: slowTradingSignals,
  stages: slowTradingStages,
  storage: slowTradingStorage,
  watchReserve: slowTradingWatchReserve,
  workerCapacity: slowTradingWorkerCapacity,
  withdrawal: slowTradingWithdrawal,
} as const;

export default slowTrading;
export { slowTrading };
export type {
  SlowTradingAccountBalanceSummary,
  SlowTradingBalance,
  SlowTradingBalanceSummary,
} from "./balance-summary";
export type {
  SlowEntrySequenceCount,
  SlowEntrySequenceInterval,
  SlowSystemCapacityEstimate,
  SlowSystemCapacitySequence,
  SlowWorkerNeededEstimate,
} from "./entry-sequences";
export type { SlowQuickBacktestResult } from "./quick-backtest";
export type {
  SlowTradingFinanceDailyPoint,
  SlowTradingFinanceSummary,
} from "./finance-summary";
export type { SlowTradingBalanceSnapshot } from "./storage";
export type { SlowTradingWithdrawalExecutionResult } from "./withdrawal";
export type { SlowWorkerCapacity } from "./worker-capacity";
export type {
  SlowTradingCyclePerformanceEntry,
  SlowTradingCyclePerformanceObserver,
  SlowTradingCycleProfiler,
  SlowTradingCycleSection,
} from "./performance";
export type { SlowTradingStage } from "./stages";
export { SLOW_TRADING_MCP_PERMISSIONS } from "./types";
export type * from "./types";
