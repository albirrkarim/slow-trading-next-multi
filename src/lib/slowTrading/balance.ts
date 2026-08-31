import type { DynamicTradeMemory } from "@/lib/dynamic";
import type { TradingModelMemory } from "@/lib/trading/models";
import type { SlowTradingModeState } from "./types";
import slowTradingWatchReserve from "./watch-reserve";

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
