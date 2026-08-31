import { VOLATILITY_THRESHOLD } from "@/lib/brain/constants";
import { getExchange } from "@/lib/exchange";
import { resolveMarketTypeForTradingMode } from "@/lib/exchange/utils";
import { clone } from "./common";
import {
  getSlowTradingHistory,
  getSlowTradingOpenPositions,
} from "./history";
import { appendSlowTradingErrorLog } from "./logs";
import { getActiveSlowTradingMode } from "./mode";
import { runWithSlowTradingExchangeAccount } from "./account";
import slowTradingReporting from "../reporting";
import slowTradingWatchReserve from "../watch-reserve";
import type {
  SlowTradingDashboardState,
  SlowTradingDashboardRuntimeConfig,
  SlowTradingHistoryPosition,
  SlowTradingStorageData,
} from "../types";
import { tradeLog } from "@/lib/trading/helper/log";
import blackSwan from "@/lib/trading/black-swan";

/**
 * Gets slow trading latest price map from SLOW state or storage.
 */
async function getSlowTradingLatestPriceMap(
  storage: SlowTradingStorageData,
  positions: SlowTradingHistoryPosition[],
): Promise<Record<string, number>> {
  // A. De-duplicate symbols that need fresh floating-PnL prices.
  const symbols = Array.from(
    new Set(
      positions
        .map((position) => position.symbol)
        .filter((symbol): symbol is string => Boolean(symbol)),
    ),
  );

  if (symbols.length === 0) {
    return {};
  }

  // B. Fetch the latest candle close for each symbol through the active account.
  const entries = await runWithSlowTradingExchangeAccount(storage, async () => {
    const marketType = resolveMarketTypeForTradingMode(
      storage.config.tradingMode,
    );
    const exchange = getExchange(storage.config.exchangeType, {
      defaultTradingMode: storage.config.tradingMode,
    });

    return Promise.all(
      symbols.map(async (symbol) => {
        try {
          const tradingSymbol = symbol.includes("_")
            ? symbol
            : `${symbol}_USDT`;
          const klines = await exchange.getKlines({
            symbol: tradingSymbol,
            interval: "1m",
            simpleTime: "5minute",
            limit: 5,
            marketType,
          });

          const latestPrice = Number.parseFloat(klines.at(-1)?.[4] ?? "");
          if (!Number.isFinite(latestPrice) || latestPrice <= 0) {
            return null;
          }

          return [symbol, latestPrice] as const;
        } catch (error) {
          tradeLog.warn(
            `[slow-trading] failed to refresh floating pnl for ${symbol}`,
            error,
          );
          return null;
        }
      }),
    );
  });

  // C. Return only successful symbol-price pairs.
  return Object.fromEntries(
    entries.filter(
      (entry): entry is readonly [string, number] =>
        Array.isArray(entry) &&
        typeof entry[0] === "string" &&
        typeof entry[1] === "number",
    ),
  );
}

/**
 * Gets slow trading live quote balance from SLOW state or storage.
 */
async function getSlowTradingLiveQuoteBalance(
  storage: SlowTradingStorageData,
): Promise<number | null> {
  return runWithSlowTradingExchangeAccount(storage, async () => {
    const exchange = getExchange(storage.config.exchangeType, {
      defaultTradingMode: storage.config.tradingMode,
    });

    try {
      const balance = await exchange.getBalance("USDT_USDT");
      if (!balance || !Number.isFinite(balance.quoteAsset)) {
        return null;
      }

      return balance.quoteAsset;
    } catch (error) {
      // PROD:ERROR_LOG
      await appendSlowTradingErrorLog({
        source: "slow-trading.dashboard.live-balance",
        error,
        details: {
          exchangeType: storage.config.exchangeType,
          tradingMode: storage.config.tradingMode,
        },
      }).catch((logError) => {
        tradeLog.error(
          "[slow-trading] failed to write live balance error log",
          logError,
        );
      });
      tradeLog.warn(
        "[slow-trading] failed to refresh live quote balance",
        error,
      );
      return null;
    }
  });
}

/**
 * Runs the callback with floating pnl selected.
 */
function withFloatingPnl(
  position: SlowTradingHistoryPosition,
  latestPrice?: number,
  exchangeType?: SlowTradingStorageData["config"]["exchangeType"],
): SlowTradingHistoryPosition {
  const next = clone(position);
  const entryPrice = Number(next.exposure.averageEntryPrice) || 0;

  if (!(entryPrice > 0)) {
    return next;
  }

  const hasLatestPrice =
    typeof latestPrice === "number" &&
    Number.isFinite(latestPrice) &&
    latestPrice > 0;
  const safePrice = hasLatestPrice ? latestPrice : entryPrice;
  const storedMarkPrice = next.pnl.markPrice;
  slowTradingReporting.pnl.applyFloatingMetrics(next, safePrice, exchangeType);
  if (!hasLatestPrice) {
    next.pnl.markPrice = storedMarkPrice;
  }

  return next;
}

/**
 * Strips MCP token hashes from runtime data before returning dashboard state.
 */
function toDashboardRuntime(
  runtime: SlowTradingStorageData["runtime"],
): SlowTradingDashboardRuntimeConfig {
  const runtimeClone = clone(runtime);
  return {
    ...runtimeClone,
    mcp: {
      tokens: (runtimeClone.mcp?.tokens ?? []).map(
        ({
          tokenHash: _tokenHash,
          tokenSecretEncrypted: _tokenSecretEncrypted,
          ...token
        }) => ({
          ...token,
          secretAvailable: Boolean(_tokenSecretEncrypted),
        }),
      ),
    },
  };
}

/** Combines account-scoped dashboard snapshots without mixing persisted state. */
export async function buildCombinedSlowTradingDashboardStateRealtime(
  storages: SlowTradingStorageData[],
): Promise<SlowTradingDashboardState> {
  if (storages.length === 0) {
    throw new Error("Cannot build a combined dashboard without accounts.");
  }

  const states: SlowTradingDashboardState[] = [];
  for (const storage of storages) {
    states.push(await buildSlowTradingDashboardStateRealtime(storage));
  }
  const primary = states[0];
  // PROD:MULTI_ACCOUNT_COMBINED_DASHBOARD
  const history = states
    .flatMap((state) => state.history)
    .sort((left, right) => (right.closed?.t ?? 0) - (left.closed?.t ?? 0));
  const openPositions = states
    .flatMap((state) => state.openPositions)
    .sort((left, right) => left.opened.t - right.opened.t);
  const latestState = states.reduce((latest, state) =>
    (state.stats.lastRunAt ?? 0) > (latest.stats.lastRunAt ?? 0)
      ? state
      : latest,
  );

  return {
    ...primary,
    accountFilter: null,
    accountSummaries: states.flatMap((state) => state.accountSummaries),
    balances: {
      availableQuoteAsset: states.reduce(
        (total, state) => total + state.balances.availableQuoteAsset,
        0,
      ),
      reservedQuoteAsset: states.reduce(
        (total, state) => total + state.balances.reservedQuoteAsset,
        0,
      ),
      spendableQuoteAsset: states.reduce(
        (total, state) => total + state.balances.spendableQuoteAsset,
        0,
      ),
      safeHaven: states.reduce(
        (total, state) => total + state.balances.safeHaven,
        0,
      ),
      lockedQuoteAsset: states.reduce(
        (total, state) => total + state.balances.lockedQuoteAsset,
        0,
      ),
      startingBalanceUSDT: states.reduce(
        (total, state) => total + state.balances.startingBalanceUSDT,
        0,
      ),
    },
    history,
    openPositions,
    stats: {
      ...latestState.stats,
      closedTrades: history.length,
      openPositions: openPositions.length,
      safeHavenLastScheduledAt: Math.max(
        0,
        ...states.map((state) => state.stats.safeHavenLastScheduledAt ?? 0),
      ),
    },
  };
}

/**
 * Convert persisted storage into the dashboard response model.
 *
 * @param storage - Slow-trading storage.
 * @returns Dashboard-friendly state snapshot.
 */
export function buildSlowTradingDashboardState(
  storage: SlowTradingStorageData,
): SlowTradingDashboardState {
  // PROD:STORAGE_SOURCE_OF_TRUTH
  const activeMode = getActiveSlowTradingMode(storage);
  const modeState = storage.modes[activeMode];
  const history = slowTradingReporting.positions.normalizeMany(
    getSlowTradingHistory(storage, activeMode),
    storage.config.exchangeType,
  );
  const openPositions = slowTradingReporting.positions.normalizeMany(
    getSlowTradingOpenPositions(storage, activeMode),
    storage.config.exchangeType,
  );
  const safeHaven = modeState.dynamicTradeMemory.safeHaven ?? 0;
  const availableQuoteAsset =
    (modeState.dynamicTradeMemory.quoteAsset ?? 0) + safeHaven;
  const reservedQuoteAsset = modeState.dynamicTradeMemory.reservedQuoteAsset ?? 0;
  const lockedQuoteAsset = slowTradingWatchReserve.balance.getLockedQuoteAssetValue({
    activePositions: openPositions,
  });

  return {
    accountFilter: storage.account.slug,
    accountSummaries: [
      {
        slug: storage.account.slug,
        name: storage.account.name,
        enabled: storage.account.enabled,
        activeMode,
        balances: {
          availableQuoteAsset,
          reservedQuoteAsset,
          spendableQuoteAsset:
            slowTradingWatchReserve.balance.getSpendableQuoteAssetValue({
              quoteAsset: availableQuoteAsset,
              reservedQuoteAsset,
              safeHaven,
            }),
          safeHaven,
          lockedQuoteAsset,
          startingBalanceUSDT:
            modeState.dynamicTradeMemory.startingBalanceUSDT ?? 0,
        },
      },
    ],
    activeMode,
    globalConfig: {
      volatilityThresholdPct: VOLATILITY_THRESHOLD,
    },
    config: clone(storage.config),
    runtime: toDashboardRuntime(storage.runtime),
    blackSwan: clone(
      modeState.blackSwan ?? blackSwan.state.create(),
    ),
    balances: {
      availableQuoteAsset,
      reservedQuoteAsset,
      spendableQuoteAsset: slowTradingWatchReserve.balance.getSpendableQuoteAssetValue({
        quoteAsset: availableQuoteAsset,
        reservedQuoteAsset,
        safeHaven,
      }),
      safeHaven,
      lockedQuoteAsset,
      startingBalanceUSDT:
        modeState.dynamicTradeMemory.startingBalanceUSDT ?? 0,
    },
    history,
    openPositions,
    stats: {
      closedTrades: history.length,
      openPositions: openPositions.length,
      lastRunAt: modeState.lastRunAt,
      lastRunDurationMs: modeState.lastRunDurationMs,
      lastRunPerformance: modeState.lastRunPerformance,
      lastRunSummary: modeState.lastRunSummary,
      stageRuns: clone(modeState.stageRuns ?? {}),
      safeHavenLastScheduledAt:
        modeState.dynamicTradeMemory.lastSafeHavenRequest,
    },
  };
}

/**
 * Build a dashboard snapshot and refresh floating PnL for open positions using
 * the latest market prices available from the configured exchange.
 *
 * @param storage - Slow-trading storage.
 * @returns Dashboard snapshot with refreshed open-position metrics.
 */
export async function buildSlowTradingDashboardStateRealtime(
  storage: SlowTradingStorageData,
): Promise<SlowTradingDashboardState> {
  let snapshot = buildSlowTradingDashboardState(storage);

  if (snapshot.activeMode === "live") {
    const liveQuoteBalance = await getSlowTradingLiveQuoteBalance(storage);
    if (liveQuoteBalance != null) {
      const safeHaven = snapshot.balances.safeHaven;
      const reservedQuoteAsset = snapshot.balances.reservedQuoteAsset;
      snapshot = {
        ...snapshot,
        accountSummaries: snapshot.accountSummaries.map((summary) =>
          summary.slug === storage.account.slug
            ? {
                ...summary,
                balances: {
                  ...summary.balances,
                  availableQuoteAsset: liveQuoteBalance,
                  spendableQuoteAsset:
                    slowTradingWatchReserve.balance.getSpendableQuoteAssetValue(
                      {
                        quoteAsset: liveQuoteBalance,
                        reservedQuoteAsset,
                        safeHaven,
                      },
                    ),
                },
              }
            : summary,
        ),
        balances: {
          ...snapshot.balances,
          availableQuoteAsset: liveQuoteBalance,
          spendableQuoteAsset: slowTradingWatchReserve.balance.getSpendableQuoteAssetValue({
            quoteAsset: liveQuoteBalance,
            reservedQuoteAsset,
            safeHaven,
          }),
        },
      };
    }
  }

  if (snapshot.openPositions.length === 0) {
    return snapshot;
  }

  const latestPriceMap = await getSlowTradingLatestPriceMap(
    storage,
    snapshot.openPositions,
  );

  return {
    ...snapshot,
    openPositions: snapshot.openPositions.map((position) =>
      withFloatingPnl(
        position,
        latestPriceMap[position.symbol],
        storage.config.exchangeType,
      ),
    ),
  };
}
