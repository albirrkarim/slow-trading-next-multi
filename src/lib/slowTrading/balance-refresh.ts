import { getExchange } from "@/lib/exchange";
import slowTradingBalance from "./balance";
import slowTradingMutationQueue from "./mutation-queue";
import slowTradingStorage from "./storage";

export interface SlowTradingManualBalanceRefreshResult {
  account: string;
  availableQuoteAsset: number;
  refreshedAt: number;
}

/**
 * Refreshes and persists one live account balance after an explicit request.
 */
async function refreshAccount(
  account: string,
): Promise<SlowTradingManualBalanceRefreshResult> {
  return slowTradingMutationQueue.runExclusive(async () => {
    const storage = await slowTradingStorage.data.load({
      account,
      modeScope: "active",
    });
    const activeMode = slowTradingStorage.mode.getActive(storage);
    if (activeMode !== "live") {
      throw new Error(
        `${storage.account.name} is in sandbox mode; its balance is managed locally.`,
      );
    }

    const exchange = getExchange(storage.config.exchangeType, {
      defaultTradingMode: storage.config.tradingMode,
    });
    const balance = await slowTradingStorage.account.runWithExchangeAccount(
      storage,
      () => exchange.getBalance("USDT_USDT"),
    );
    if (!balance || !Number.isFinite(balance.quoteAsset)) {
      throw new Error(`Can't fetch live balance for ${storage.account.name}.`);
    }

    const modeState = storage.modes.live;
    slowTradingBalance.live.applyAvailableQuoteAsset({
      dynamicTradeMemory: modeState.dynamicTradeMemory,
      quoteAsset: balance.quoteAsset,
    });
    await slowTradingStorage.mode.saveState("live", modeState, {
      account: storage.account.slug,
    });

    return {
      account: storage.account.slug,
      availableQuoteAsset: balance.quoteAsset,
      refreshedAt: Date.now(),
    };
  });
}

const slowTradingBalanceRefresh = {
  live: {
    refreshAccount,
  },
} as const;

export default slowTradingBalanceRefresh;
