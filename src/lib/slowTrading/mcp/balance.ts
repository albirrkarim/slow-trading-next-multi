import slowTradingBalanceSummary, {
  type SlowTradingBalanceSummary,
} from "../balance-summary";
import slowTradingStorage from "../storage";
import type { SlowTradingMode } from "../types";

// PROD:MCP_BALANCE
// PROD:MULTI_ACCOUNT_COMBINED_MCP_BALANCE

interface SlowTradingMcpBalanceReadParams {
  instanceName: string;
  requestedMode: unknown;
}

/** Reads and combines the requested balance mode across every enabled account. */
async function read(
  params: SlowTradingMcpBalanceReadParams,
): Promise<SlowTradingBalanceSummary> {
  const catalog = await slowTradingStorage.data.load({ modeScope: "active" });
  const activeMode = slowTradingStorage.mode.getActive(catalog);
  const requestedMode = String(params.requestedMode ?? "active");
  const mode: SlowTradingMode =
    requestedMode === "live" || requestedMode === "sandbox"
      ? requestedMode
      : activeMode;
  const enabledAccounts = catalog.runtime.exchangeAccounts.filter(
    (account) => account.enabled,
  );

  if (enabledAccounts.length === 0) {
    throw new Error(
      "SLOW has no enabled exchange accounts to include in balance.",
    );
  }

  const storages = [];
  for (const account of enabledAccounts) {
    const storage = await slowTradingStorage.data.load({
      account: account.slug,
      includeHistory: true,
      modeScope: "all",
    });
    storage.runtime.sandboxEnabled = mode === "sandbox";
    storages.push(storage);
  }

  const dashboardState =
    await slowTradingStorage.dashboard.buildCombinedStateRealtime(storages);

  return slowTradingBalanceSummary.create({
    activeMode,
    dashboardState,
    instanceName: params.instanceName,
    mode,
  });
}

const slowTradingMcpBalance = { read } as const;

export default slowTradingMcpBalance;
