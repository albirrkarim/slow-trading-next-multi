import { tradeLog } from "@/lib/trading/helper/log";
import slowTradingNotifications from "../notifications";
import slowTradingStorage from "../storage";
import type {
  RunSlowTradingCycleParams,
  SlowTradingCycleResult,
} from "./types";

/** Runs enabled accounts plus disabled accounts that still own open positions. */
async function execute(params: {
  executeOne: (
    request: RunSlowTradingCycleParams,
  ) => Promise<SlowTradingCycleResult>;
  request?: RunSlowTradingCycleParams;
}): Promise<SlowTradingCycleResult> {
  const catalog = await slowTradingStorage.data.load({ modeScope: "active" });
  const results: SlowTradingCycleResult[] = [];

  // PROD:MULTI_ACCOUNT_SEQUENTIAL_CYCLE
  for (const account of catalog.runtime.exchangeAccounts) {
    try {
      const scopedStorage = await slowTradingStorage.data.load({
        account: account.slug,
        modeScope: "active",
      });
      const activeMode = slowTradingStorage.mode.getActive(scopedStorage);
      const hasOpenPositions = scopedStorage.modes[
        activeMode
      ].tradeSettings.some((tradeSetting) =>
        (tradeSetting.model_memory.positions ?? []).some(
          (position) => !position.closed,
        ),
      );
      if (!account.enabled && !hasOpenPositions) continue;

      // PROD:MULTI_ACCOUNT_DISABLED_ENTRY_ONLY
      results.push(
        await params.executeOne({
          ...params.request,
          account: account.slug,
          disableAutoEntry:
            params.request?.disableAutoEntry || !account.enabled,
        }),
      );
    } catch (error) {
      // PROD:MULTI_ACCOUNT_FAILURE_ISOLATION
      tradeLog.error(`account cycle failed | account=${account.slug}`, error);
      await slowTradingNotifications.operationalError.notify({
        source: `cycle.account.${account.slug}`,
        error,
      });
    }
  }

  const first = results[0];
  if (!first) {
    const activeMode = slowTradingStorage.mode.getActive(catalog);
    const modeState = catalog.modes[activeMode];
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
    symbols: Array.from(new Set(results.flatMap((result) => result.symbols))),
    reports: results.flatMap((result) => result.reports),
    executedEntrySignals: results.reduce(
      (total, result) => total + result.executedEntrySignals,
      0,
    ),
    skippedEntrySignals: results.flatMap(
      (result) => result.skippedEntrySignals,
    ),
    availableQuoteAsset: results.reduce(
      (total, result) => total + result.availableQuoteAsset,
      0,
    ),
    lastRunAt: Math.max(...results.map((result) => result.lastRunAt ?? 0)),
  };
}

const slowTradingCycleAccounts = {
  execute,
} as const;

export default slowTradingCycleAccounts;
