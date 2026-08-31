import { timeMsToReadable } from "@/lib/datasets/utils"; // optional; fallback below
import type { DynamicTradeMemory, SafeHavenConfig } from "..";

/** UTC month equality check */
function isSameUtcMonth(aMs: number, bMs: number) {
  const a = new Date(aMs);
  const b = new Date(bMs);
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth()
  );
}

/** Compute desired amount to save (same as your helper) */
export function getAmountToSave({
  config,
  currentAsset,
}: {
  config: SafeHavenConfig;
  currentAsset: number;
}) {
  let amount = 0;

  const fixedAmount = Number(config.safeUSDTPerMonth) || 0;
  const percentAmount = Number(config.safePercentPerMonth) || 0;

  if (fixedAmount > 0) {
    amount = fixedAmount;
  } else if (percentAmount > 0) {
    amount = currentAsset * percentAmount;
  }

  if (config.minimalAssetOnTrade !== undefined) {
    if (currentAsset - amount < config.minimalAssetOnTrade) {
      amount = currentAsset - config.minimalAssetOnTrade;
    }
  }

  return Math.max(0, amount);
}

/**
 * Schedule a monthly safe-haven request.
 *
 * - only schedules once per UTC month (uses lastSafeHavenRequest to throttle)
 * - computes amount (percent or fixed)
 * - clamps the scheduled request so it won't immediately exhaust quoteAsset below minReservePercent
 *
 * Returns the amount scheduled (could be 0).
 */
export function scheduleSafeHavenRequest({
  currentTimeMs,
  config,
  currentAsset,
  memory,
  minReservePercent = 0.1, // do not let quoteAsset fall below 10% of current quoteAsset
}: {
  currentTimeMs: number;
  config: SafeHavenConfig;
  currentAsset: number;
  memory: DynamicTradeMemory;
  minReservePercent?: number;
}): number {
  // nothing to do if nothing configured
  if (
    config.safePercentPerMonth === undefined &&
    config.safeUSDTPerMonth === undefined
  ) {
    memory.safeHavenRequest = 0;
    return 0;
  }

  // if already scheduled this UTC month, skip scheduling
  if (
    memory.lastSafeHavenRequest &&
    isSameUtcMonth(memory.lastSafeHavenRequest, currentTimeMs)
  ) {
    return memory.safeHavenRequest ?? 0;
  }

  // compute desired amount for the month
  const desired = getAmountToSave({
    config,
    currentAsset,
  });

  if (desired <= 0) {
    memory.safeHavenRequest = 0;
    memory.lastSafeHavenRequest = currentTimeMs;
    return 0;
  }

  // ensure we keep at least minReservePercent of the *current* quoteAsset available
  const minReserve = memory.quoteAsset * minReservePercent;
  const maxAllowedToTake = Math.max(0, memory.quoteAsset - minReserve);

  const amountToRequest = Math.max(0, Math.min(desired, maxAllowedToTake));

  // schedule
  memory.safeHavenRequest = amountToRequest;
  memory.lastSafeHavenRequest = currentTimeMs;

  return amountToRequest;
}

/**
 * Attempt to actually withdraw (transfer) up to `maxTakeThisTick` from quoteAsset into safeHaven.
 *
 * - This will never reduce quoteAsset below the `minReservePercent` of its current value at call-time.
 * - Decrements memory.safeHavenRequest by the taken amount.
 * - Records a history event.
 *
 * Returns the taken amount (0 if nothing taken).
 */
export function performSafeHavenWithdrawal({
  currentTimeMs,
  memory,
  maxTakeThisTick = Infinity,
  minReservePercent = 0.1,
}: {
  currentTimeMs: number;
  memory: DynamicTradeMemory;
  maxTakeThisTick?: number;
  minReservePercent?: number;
}) {
  if (!memory || memory.safeHavenRequest <= 0) return 0;

  // compute current minimum reserve (based on current quoteAsset)
  const minReserve = memory.quoteAsset * minReservePercent;
  const allowedToTake = Math.max(0, memory.quoteAsset - minReserve);

  if (allowedToTake <= 0) return 0;

  const take = Math.min(
    memory.safeHavenRequest,
    allowedToTake,
    maxTakeThisTick
  );

  if (take <= 0) return 0;

  // move funds
  memory.quoteAsset = memory.quoteAsset - take;
  memory.safeHaven = (memory.safeHaven ?? 0) + take;
  memory.safeHavenRequest = Math.max(0, memory.safeHavenRequest - take);

  memory.safeHavenHistory = memory.safeHavenHistory ?? [];
  memory.safeHavenHistory.push({
    timeMs: currentTimeMs,
    timeHuman: timeMsToReadable(currentTimeMs),
    amount: take,
    remainingRequest: memory.safeHavenRequest,
    remainingQuote: memory.quoteAsset,
  });

  return take;
}
