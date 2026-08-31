import {
  createUniqueExchangeAccountSlug,
  loadSlowTradingExchangeAccounts,
  normalizeExchangeAccountSlug,
  runWithSlowTradingExchangeAccount,
  saveSlowTradingExchangeAccounts,
} from "./account";
import {
  readSlowTradingBalanceSnapshots,
  upsertSlowTradingBalanceSnapshot,
} from "./balance-snapshots";
import {
  buildSlowTradingDashboardState,
  buildSlowTradingDashboardStateRealtime,
  buildCombinedSlowTradingDashboardStateRealtime,
} from "./dashboard";
import {
  clearSlowTradingHistory,
  deleteSlowTradingHistoryEntry,
  getSlowTradingHistory,
  getSlowTradingOpenPositions,
  updateSlowTradingHistoryEntryNotes,
} from "./history";
import {
  hydrateSlowTradingHistoryFromFiles,
  readHistoryRange,
} from "./history-files";
import {
  appendSlowTradingErrorLog,
  appendSlowTradingManagementLog,
  appendSlowTradingSafeHavenLog,
  appendSlowTradingWithdrawalLog,
  clearSlowTradingLogEntries,
  deleteSlowTradingLogEntry,
  loadSlowTradingLogs,
  updateSlowTradingErrorLogStatuses,
} from "./logs";
import {
  applySlowTradingSafeHavenUpdate,
  createModeState,
  ensureTradeSettings,
  getActiveSlowTradingMode,
} from "./mode";
import {
  createDefaultSlowTradingStorage,
  deleteSlowTradingAccountState,
  loadSlowTradingStorage,
  resetSandboxSlowTrading,
  saveSlowTradingModeState,
  saveSlowTradingStorage,
  updateSlowTradingStorage,
} from "./persistence";

/**
 * Grouped storage API for SLOW callers that need related persistence and
 * dashboard operations without importing many standalone helpers.
 */
const slowTradingStorage = {
  logs: {
    appendError: appendSlowTradingErrorLog,
    appendManagement: appendSlowTradingManagementLog,
    appendSafeHaven: appendSlowTradingSafeHavenLog,
    appendWithdrawal: appendSlowTradingWithdrawalLog,
    clearEntries: clearSlowTradingLogEntries,
    deleteEntry: deleteSlowTradingLogEntry,
    load: loadSlowTradingLogs,
    updateErrorStatuses: updateSlowTradingErrorLogStatuses,
  },
  account: {
    createUniqueSlug: createUniqueExchangeAccountSlug,
    loadAccounts: loadSlowTradingExchangeAccounts,
    normalizeSlug: normalizeExchangeAccountSlug,
    runWithExchangeAccount: runWithSlowTradingExchangeAccount,
    saveAccounts: saveSlowTradingExchangeAccounts,
    deleteState: deleteSlowTradingAccountState,
  },
  mode: {
    createState: createModeState,
    ensureTradeSettings,
    getActive: getActiveSlowTradingMode,
    saveState: saveSlowTradingModeState,
  },
  data: {
    createDefault: createDefaultSlowTradingStorage,
    load: loadSlowTradingStorage,
    resetSandbox: resetSandboxSlowTrading,
    save: saveSlowTradingStorage,
    update: updateSlowTradingStorage,
  },
  safeHaven: {
    applyUpdate: applySlowTradingSafeHavenUpdate,
  },
  history: {
    clear: clearSlowTradingHistory,
    deleteEntry: deleteSlowTradingHistoryEntry,
    getClosed: getSlowTradingHistory,
    getOpen: getSlowTradingOpenPositions,
    hydrate: hydrateSlowTradingHistoryFromFiles,
    readRange: readHistoryRange,
    updateNotes: updateSlowTradingHistoryEntryNotes,
  },
  dashboard: {
    buildState: buildSlowTradingDashboardState,
    buildStateRealtime: buildSlowTradingDashboardStateRealtime,
    buildCombinedStateRealtime: buildCombinedSlowTradingDashboardStateRealtime,
  },
  balanceSnapshots: {
    read: readSlowTradingBalanceSnapshots,
    upsert: upsertSlowTradingBalanceSnapshot,
  },
} as const;

export default slowTradingStorage;
export { slowTradingStorage };
export type { SlowTradingBalanceSnapshot } from "./balance-snapshots";
