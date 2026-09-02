import slowTradingBalanceSummary, {
  type SlowTradingBalanceSummary,
} from "../balance-summary";
import slowTradingStorage from "../storage";
import slowTradingMcpAccountScope from "./account-scope";

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
  const scope = await slowTradingMcpAccountScope.resolve({
    defaultMode: "active",
    requestedMode: params.requestedMode,
  });
  const storages = await slowTradingMcpAccountScope.loadStorages(scope, {
    includeHistory: true,
  });
  for (const storage of storages) {
    storage.runtime.sandboxEnabled = scope.mode === "sandbox";
  }

  const dashboardState =
    await slowTradingStorage.dashboard.buildCombinedStateRealtime(storages);

  return slowTradingBalanceSummary.create({
    activeMode: scope.activeMode,
    dashboardState,
    instanceName: params.instanceName,
    mode: scope.mode,
  });
}

const slowTradingMcpBalance = { read } as const;

export default slowTradingMcpBalance;
