import { tradeLog } from "@/lib/trading/helper/log";
import slowTradingNotifications from "../notifications";
import slowTradingStorage from "../storage";
import type { SlowTradingStorageData } from "../types";
import type {
  RunSlowTradingCycleParams,
  SlowTradingCycleResult,
} from "./types";

export interface SlowTradingCycleAccountScope {
  request: RunSlowTradingCycleParams;
  storage: SlowTradingStorageData;
}

/** Loads cycle-eligible accounts without performing any public market I/O. */
async function loadEligible(request?: RunSlowTradingCycleParams): Promise<{
  catalog: SlowTradingStorageData;
  scopes: SlowTradingCycleAccountScope[];
}> {
  const catalog = await slowTradingStorage.data.load({ modeScope: "active" });
  const accountSlugs = request?.account
    ? [request.account]
    : catalog.runtime.exchangeAccounts.map((account) => account.slug);
  const scopes: SlowTradingCycleAccountScope[] = [];

  // PROD:MULTI_ACCOUNT_SEQUENTIAL_CYCLE
  for (const accountSlug of accountSlugs) {
    try {
      const storage = await slowTradingStorage.data.load({
        account: accountSlug,
        modeScope: "active",
      });
      const activeMode = slowTradingStorage.mode.getActive(storage);
      const hasOpenPositions = storage.modes[activeMode].tradeSettings.some(
        (tradeSetting) =>
          (tradeSetting.model_memory.positions ?? []).some(
            (position) => !position.closed,
          ),
      );
      if (!request?.account && !storage.account.enabled && !hasOpenPositions) {
        continue;
      }

      // PROD:MULTI_ACCOUNT_DISABLED_ENTRY_ONLY
      scopes.push({
        storage,
        request: {
          ...request,
          account: storage.account.slug,
          disableAutoEntry:
            request?.disableAutoEntry || !storage.account.enabled,
        },
      });
    } catch (error) {
      if (request?.account) {
        throw error;
      }
      // PROD:MULTI_ACCOUNT_FAILURE_ISOLATION
      tradeLog.error(`account load failed | account=${accountSlug}`, error);
      await slowTradingNotifications.operationalError.notify({
        source: `cycle.account.${accountSlug}`,
        error,
      });
    }
  }

  return { catalog, scopes };
}

/** Combines sequential account results into the public cycle result shape. */
function combine(params: {
  catalog: SlowTradingStorageData;
  request?: RunSlowTradingCycleParams;
  results: SlowTradingCycleResult[];
}): SlowTradingCycleResult {
  const first = params.results[0];
  if (!first) {
    const activeMode = slowTradingStorage.mode.getActive(params.catalog);
    const modeState = params.catalog.modes[activeMode];
    return {
      mode: activeMode,
      stage: params.request?.stage,
      symbols: [],
      reports: [],
      executedEntrySignals: 0,
      skippedEntrySignals: [],
      availableQuoteAsset: 0,
      lastRunAt: modeState.lastRunAt,
      skipped: true,
    };
  }

  return {
    ...first,
    symbols: Array.from(
      new Set(params.results.flatMap((result) => result.symbols)),
    ),
    reports: params.results.flatMap((result) => result.reports),
    executedEntrySignals: params.results.reduce(
      (total, result) => total + result.executedEntrySignals,
      0,
    ),
    skippedEntrySignals: params.results.flatMap(
      (result) => result.skippedEntrySignals,
    ),
    availableQuoteAsset: params.results.reduce(
      (total, result) => total + result.availableQuoteAsset,
      0,
    ),
    lastRunAt: Math.max(
      ...params.results.map((result) => result.lastRunAt ?? 0),
    ),
  };
}

const slowTradingCycleAccounts = {
  results: {
    combine,
  },
  scopes: {
    loadEligible,
  },
} as const;

export default slowTradingCycleAccounts;
