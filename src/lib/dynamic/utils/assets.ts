import type { GrowthOvertimeDetail } from "@/lib/dynamic/backtest-volatility/type";

import type { DynamicTradeMemory } from "../type-dynamic";
import type { TradingModelMemory } from "@/lib/trading/models";
import type { VolatilityPoint } from "./volatility";
import type { Kline } from "@/lib/exchange/platform/tokocrypto";
import { TRADE_MESSAGE } from "@/lib/trading/message";
import { tradeLog } from "@/lib/trading";
import { timeMsToReadable } from "@/lib/datasets/utils";

interface CountGrowthOvertimeProps {
  timeMs: number;
  dynamicTradeMemory: DynamicTradeMemory;
  modelMemoryMap: Record<string, TradingModelMemory>;

  // So we can track the floating asset
  volatilityMap?: Record<string, VolatilityPoint[]>;
  klinesMap?: Record<string, Kline[]>;

  verbose?: boolean;
}

/**
 * Calculates asset growth over time by combining the base and quote asset values
 * with real-time floating values derived from kline (price) data.
 *
 * The function iterates through all trading symbols in `modelMemoryMap`, merges
 * active positions, sums up the base asset values (split into "common" and "HIT"
 * categories), and computes the total floating asset value based on the given
 * timestamp (`timeMs`).
 *
 * @returns {GrowthOvertimeDetail} An object containing detailed metrics about asset growth at the given timestamp.
 * @returns {number} return.tMs - The evaluated timestamp (in ms).
 * @returns {string} return.tMsHuman - A human-readable version of the timestamp.
 * @returns {number} return.currentBalance - The base quote asset balance.
 * @returns {number} return.currentSpendableBalance - Quote balance after reserved watch capital is removed.
 * @returns {number} return.currentReservedBalance - Quote balance locked for watch averaging reserves.
 * @returns {number} return.currentAsset - The total asset value (base + quote).
 * @returns {number} return.currentAssetFloating - The total floating value calculated using current market prices.
 * @returns {number} return.currentBaseAsset - The total base asset value in quote terms.
 * @returns {number} return.currentBaseAssetCommon - The portion of base asset from regular buy operations.
 * @returns {number} return.currentBaseAssetHit - The portion of base asset from “HIT” buy messages.
 */
export function countGrowthOvertime({
  timeMs,
  dynamicTradeMemory,
  modelMemoryMap,
  volatilityMap,
  // klinesMap,
  verbose = false,
}: CountGrowthOvertimeProps): GrowthOvertimeDetail {
  const { quoteAsset, safeHaven } = dynamicTradeMemory;
  const currentReservedBalance = Number.isFinite(
    dynamicTradeMemory.reservedQuoteAsset,
  )
    ? dynamicTradeMemory.reservedQuoteAsset ?? 0
    : 0;
  const currentSpendableBalance = Math.max(
    0,
    quoteAsset - currentReservedBalance,
  );

  let currentBaseAsset = 0; // without quoteAsset
  let currentAssetFloating = quoteAsset;

  const USDTBaseMap: Record<string, number> = {};

  // more report
  const currentBaseAssetLabeled = {
    hit: 0,
    common: 0,
    dca: 0,
  };

  for (const symbol of Object.keys(modelMemoryMap)) {
    // A. Extract the entry positions on the model memory
    const memory = modelMemoryMap[symbol];
    const positions = memory.positions;

    if (positions.length === 0) continue;

    let symbolUsdt = 0;
    let price = 0;

    // Get Price
    // if (klinesMap && klinesMap[symbol]) {
    //     const kline = klinesMap[symbol].find((e) => e[0] == timeMs);
    //     if (kline) price = parseFloat(kline[4]);
    // }

    if (volatilityMap && volatilityMap[symbol]) {
      price = volatilityMap[symbol].at(-1)?.p || 0;
    }

    if (!price) {
      tradeLog.log(
        `Missing price for ${symbol} at ${timeMsToReadable(timeMs)}`,
      );
    }

    for (const pos of positions) {
      const lockedMarginUsdt = pos.exposure.marginUsdt;

      // B.1 Sum the Base
      currentBaseAsset += lockedMarginUsdt;
      symbolUsdt += lockedMarginUsdt;

      // B.2 Assign the labeled
      const entryLabel = pos.strategy.entry.label ?? "";
      if (entryLabel.includes(TRADE_MESSAGE.buy.HIT.replaceAll("[", "").replaceAll("]", ""))) {
        currentBaseAssetLabeled.hit += lockedMarginUsdt;
      } else if (entryLabel.includes("COMMON")) {
        currentBaseAssetLabeled.common += lockedMarginUsdt;
      } else if (entryLabel.includes(TRADE_MESSAGE.buy.DCA.replaceAll("[", "").replaceAll("]", ""))) {
        currentBaseAssetLabeled.dca += lockedMarginUsdt;
      } else {
        // tradeLog.log("Unknown label ", pos.message);
      }

      // B.3 Calculate the floating asset
      if (price) {
        const pnl =
          pos.direction === "SHORT"
            ? pos.exposure.quantity *
              (pos.exposure.averageEntryPrice - price)
            : pos.exposure.quantity *
              (price - pos.exposure.averageEntryPrice);

        currentAssetFloating += lockedMarginUsdt + pnl;
      } else {
        // Fallback to cost if price missing
        currentAssetFloating += lockedMarginUsdt;
      }
    }

    // B.4 Later we calculate percent with this. after we know the currentBaseAsset
    USDTBaseMap[symbol] = symbolUsdt;
  }

  // make percentage
  const currentBaseAssetPercentCoin: Record<string, number> = {};
  for (const symbol of Object.keys(USDTBaseMap)) {
    currentBaseAssetPercentCoin[symbol] =
      USDTBaseMap[symbol] / currentBaseAsset;
  }

  const currentAsset = quoteAsset + currentBaseAsset;

  if (verbose) {
    tradeLog.log(
      `Balance: ${quoteAsset.toFixed(2)} | Safe Haven: ${safeHaven.toFixed(
        2,
      )} | Spendable: ${currentSpendableBalance.toFixed(
        2,
      )} | Reserved: ${currentReservedBalance.toFixed(
        2,
      )} | Asset ${currentAssetFloating.toFixed(2)} / ${currentAsset.toFixed(
        2,
      )} (USDT) | BASE ${currentBaseAsset.toFixed(
        2,
      )} (COMMON: ${currentBaseAssetLabeled.common.toFixed(
        2,
      )} | HIT: ${currentBaseAssetLabeled.hit.toFixed(
        2,
      )} | DCA: ${currentBaseAssetLabeled.dca.toFixed(2)} ) | ${Object.keys(
        currentBaseAssetPercentCoin,
      ).map((e) => `${e}: ${currentBaseAssetPercentCoin[e].toFixed(2)}% `)}`,
    );
  }

  return {
    timeMs,
    timeMsHuman: timeMsToReadable(timeMs),
    currentBalance: quoteAsset,
    currentSpendableBalance,
    currentReservedBalance,
    currentSafeHaven: safeHaven,
    currentAsset,
    currentAssetFloating,
    currentBaseAsset,
    currentBaseAssetLabeled,
    currentBaseAssetPercentCoin,
  };
}

export type PlainObject = Record<string, any>;

/**
 * Compare two objects for equality **excluding** keys in `exceptionKeys`.
 * - shallow compare for primitives
 * - uses JSON.stringify for objects/arrays (simple deep-ish fallback)
 */
function isEqualExceptKeys(
  a: PlainObject | undefined,
  b: PlainObject | undefined,
  exceptionKeys: string[] = [],
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  const excluded = new Set(exceptionKeys);
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);

  for (const k of keys) {
    if (excluded.has(k)) continue;

    const va = a[k];
    const vb = b[k];

    // both undefined -> equal
    if (va === undefined && vb === undefined) continue;

    // primitives or strict equality
    if (va === vb) continue;

    // for objects/arrays: fallback to JSON.stringify (works for plain data)
    const areObjects = (x: any) => x !== null && typeof x === "object";
    if (areObjects(va) && areObjects(vb)) {
      try {
        if (JSON.stringify(va) === JSON.stringify(vb)) continue;
      } catch {
        // stringify can throw for circular refs; fall through to not equal
      }
    }

    // not equal
    return false;
  }

  return true;
}

/**
 * Pushes an item into an array only if it differs from the last element.
 *
 * Performs equality comparison while ignoring specific keys (e.g., timestamps).
 * This is useful for avoiding duplicate entries in time-series data where
 * only the timestamp changes but values remain the same.
 *
 * @template T - Type extending PlainObject (record with string keys).
 * @param {T[]} arr - Target array to push into (will be mutated).
 * @param {T} item - Candidate item to potentially append.
 * @param {string[]} [exceptionKeys=[]] - Keys to ignore during equality comparison (e.g., ["timeMs", "id"]).
 * @returns {boolean} True if item was pushed, false if skipped as duplicate.
 *
 * @example
 * const data = [{ price: 100, timeMs: 1000 }];
 * onlyPushUnique(data, { price: 100, timeMs: 2000 }, ["timeMs"]); // returns false (same price)
 * onlyPushUnique(data, { price: 105, timeMs: 3000 }, ["timeMs"]); // returns true (different price)
 * console.log(data.length); // 2
 */
export function onlyPushUnique<T extends PlainObject>(
  arr: T[],
  item: T,
  exceptionKeys: string[] = [],
): boolean {
  const last = arr.length > 0 ? arr[arr.length - 1] : undefined;

  if (!last) {
    arr.push(item);
    return true;
  }

  // If last and item are equal (ignoring exceptionKeys), skip push
  const equal = isEqualExceptKeys(
    last as PlainObject,
    item as PlainObject,
    exceptionKeys,
  );
  if (!equal) {
    // tradeLog.log("backtest.growthOvertime length", arr.length);
    arr.push(item);
    return true;
  }

  return false;
}
