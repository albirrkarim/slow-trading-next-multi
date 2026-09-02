import slowTradingStorage from "../storage";
import type {
  SlowTradingAccount,
  SlowTradingMode,
  SlowTradingStorageData,
} from "../types";

export interface SlowTradingMcpAccountScope {
  accounts: SlowTradingAccount[];
  activeMode: SlowTradingMode;
  mode: SlowTradingMode;
}

/** Resolves the enabled accounts and concrete mode included in an MCP read. */
async function resolve(params: {
  defaultMode: "active" | SlowTradingMode;
  requestedMode: unknown;
}): Promise<SlowTradingMcpAccountScope> {
  const catalog = await slowTradingStorage.data.load({ modeScope: "active" });
  const activeMode = slowTradingStorage.mode.getActive(catalog);
  const requestedMode = String(params.requestedMode ?? params.defaultMode);
  const mode: SlowTradingMode =
    requestedMode === "live" || requestedMode === "sandbox"
      ? requestedMode
      : activeMode;
  const accounts = catalog.runtime.exchangeAccounts.filter(
    (account) => account.enabled,
  );

  if (accounts.length === 0) {
    throw new Error(
      "SLOW has no enabled exchange accounts to include in MCP data.",
    );
  }

  return { accounts, activeMode, mode };
}

/** Loads isolated mode memory for every account in an MCP account scope. */
async function loadStorages(
  scope: SlowTradingMcpAccountScope,
  options: { includeHistory?: boolean } = {},
): Promise<SlowTradingStorageData[]> {
  const storages: SlowTradingStorageData[] = [];

  for (const account of scope.accounts) {
    storages.push(
      await slowTradingStorage.data.load({
        account: account.slug,
        includeHistory: options.includeHistory,
        modeScope: "all",
      }),
    );
  }

  return storages;
}

const slowTradingMcpAccountScope = {
  loadStorages,
  resolve,
} as const;

export default slowTradingMcpAccountScope;
