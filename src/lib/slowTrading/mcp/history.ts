import slowTradingStorage from "../storage";
import type { SlowTradingHistoryPosition } from "../types";
import slowTradingMcpAccountScope from "./account-scope";

export interface SlowTradingMcpHistoryAccount {
  mode: "live" | "sandbox";
  name: string;
  slug: string;
}

export interface SlowTradingMcpCombinedHistory {
  accounts: SlowTradingMcpHistoryAccount[];
  activeMode: "live" | "sandbox";
  closed: SlowTradingHistoryPosition[];
  mode: "live" | "sandbox";
  open: SlowTradingHistoryPosition[];
}

/** Reads closed and optional open positions across every enabled account. */
async function read(params: {
  defaultMode: "active" | "live" | "sandbox";
  includeOpenPositions: boolean;
  requestedMode: unknown;
  symbol?: string;
}): Promise<SlowTradingMcpCombinedHistory> {
  // PROD:MULTI_ACCOUNT_COMBINED_MCP_DATA
  const scope = await slowTradingMcpAccountScope.resolve({
    defaultMode: params.defaultMode,
    requestedMode: params.requestedMode,
  });
  const symbol = String(params.symbol ?? "").trim().toUpperCase();
  const accountSlugs = scope.accounts.map((account) => account.slug);
  const closed = await slowTradingStorage.history.readAccounts({
    accountSlugs,
    mode: scope.mode,
    symbol: symbol || undefined,
  });
  let open: SlowTradingHistoryPosition[] = [];

  if (params.includeOpenPositions) {
    const storages = await slowTradingMcpAccountScope.loadStorages(scope);
    open = storages
      .flatMap((storage) =>
        slowTradingStorage.history.getOpen(storage, scope.mode),
      )
      .filter((position) => !symbol || position.symbol === symbol)
      .sort((left, right) => left.opened.t - right.opened.t);
  }

  return {
    accounts: scope.accounts.map((account) => ({
      mode: scope.mode,
      name: account.name,
      slug: account.slug,
    })),
    activeMode: scope.activeMode,
    closed,
    mode: scope.mode,
    open,
  };
}

const slowTradingMcpHistory = { read } as const;

export default slowTradingMcpHistory;
