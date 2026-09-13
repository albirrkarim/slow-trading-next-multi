import type { DynamicTradeMemory } from "@/lib/dynamic";
import type { getExchange } from "@/lib/exchange";
import type { TradingModelMemory } from "@/lib/trading/models";
import type { SlowTradingCycleProfiler } from "./performance";
import type { SlowTradingModeState } from "./types";
import slowTradingWatchReserve from "./watch-reserve";

/**
 * Applies an authoritative exchange quote balance to SLOW live memory.
 */
export function applyLiveAvailableQuoteAsset(params: {
  dynamicTradeMemory: DynamicTradeMemory;
  quoteAsset: number;
}): number {
  const available =
    params.quoteAsset - params.dynamicTradeMemory.safeHaven;
  params.dynamicTradeMemory.quoteAsset = available;
  if (!params.dynamicTradeMemory.startingBalanceUSDT) {
    params.dynamicTradeMemory.startingBalanceUSDT = available;
  }

  return available;
}

/**
 * Refreshes live spendable quote balance at an order authorization boundary.
 */
export async function refreshLiveAvailableQuoteAsset(params: {
  dynamicTradeMemory: DynamicTradeMemory;
  exchange: ReturnType<typeof getExchange>;
  profiler: SlowTradingCycleProfiler;
}): Promise<number> {
  const realQuote = await params.profiler.time("cycle.balanceRefresh", () =>
    params.exchange.getBalance("USDT_USDT"),
  );
  if (realQuote == null) {
    throw new Error("Can't fetch real balance!");
  }

  return applyLiveAvailableQuoteAsset({
    dynamicTradeMemory: params.dynamicTradeMemory,
    quoteAsset: realQuote.quoteAsset,
  });
}

/**
 * Seed sandbox balance memory when the mode has not traded yet.
 */
export function ensureSandboxBalance(
  modeState: SlowTradingModeState,
  initialBalanceUSDT: number,
) {
  const hasHistory = modeState.tradeSettings.some(
    (item) =>
      (item.model_memory.positions?.length ?? 0) > 0 ||
      (item.model_memory.positionsSell?.length ?? 0) > 0,
  );

  if (!hasHistory && modeState.dynamicTradeMemory.startingBalanceUSDT <= 0) {
    modeState.dynamicTradeMemory.startingBalanceUSDT = initialBalanceUSDT;
    modeState.dynamicTradeMemory.quoteAsset = initialBalanceUSDT;
  }
}

/**
 * Adds reserved quote asset to the current SLOW state.
 */
export function addReservedQuoteAsset(
  dynamicTradeMemory: DynamicTradeMemory,
  amount: number,
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  dynamicTradeMemory.reservedQuoteAsset =
    slowTradingWatchReserve.money.roundUsdt(
      (dynamicTradeMemory.reservedQuoteAsset ?? 0) + amount,
    );
}

/**
 * Subtracts reserved quote asset from the current SLOW state.
 */
export function subtractReservedQuoteAsset(
  dynamicTradeMemory: DynamicTradeMemory,
  amount: number,
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  dynamicTradeMemory.reservedQuoteAsset =
    slowTradingWatchReserve.money.roundUsdt(
      Math.max(0, (dynamicTradeMemory.reservedQuoteAsset ?? 0) - amount),
    );
}

/**
 * Gets open reserved quote asset from SLOW state or storage.
 */
export function getOpenReservedQuoteAsset(
  modelMemory?: TradingModelMemory,
): number {
  return slowTradingWatchReserve.money.roundUsdt(
    (modelMemory?.positions ?? []).reduce(
      (sum, position) =>
        sum +
        slowTradingWatchReserve.reserve.getReservedRemainingUsdt(
          position.strategy.averaging,
        ),
      0,
    ),
  );
}

/**
 * Adds reserve for latest entry to the current SLOW state.
 */
export function addReserveForLatestEntry(
  dynamicTradeMemory: DynamicTradeMemory,
  modelMemory?: TradingModelMemory,
) {
  const latestPosition = modelMemory?.positions?.at(-1);
  addReservedQuoteAsset(
    dynamicTradeMemory,
    slowTradingWatchReserve.reserve.getReservedRemainingUsdt(
      latestPosition?.strategy.averaging,
    ),
  );
}

/**
 * Releases closed position reserve back into spendable SLOW balance.
 */
export function releaseClosedPositionReserve(
  modelMemory?: TradingModelMemory,
) {
  for (const position of modelMemory?.positionsSell ?? []) {
    slowTradingWatchReserve.reserve.releaseRemaining(
      position.strategy.averaging,
    );
  }
}

/**
 * Grouped balance API for SLOW runtime balance mutations.
 */
const slowTradingBalance = {
  live: {
    applyAvailableQuoteAsset: applyLiveAvailableQuoteAsset,
    refreshAvailableQuoteAsset: refreshLiveAvailableQuoteAsset,
  },
  reserve: {
    add: addReservedQuoteAsset,
    addForLatestEntry: addReserveForLatestEntry,
    getOpen: getOpenReservedQuoteAsset,
    releaseClosedPosition: releaseClosedPositionReserve,
    subtract: subtractReservedQuoteAsset,
  },
  sandbox: {
    ensureBalance: ensureSandboxBalance,
  },
} as const;

export default slowTradingBalance;
export { slowTradingBalance };
