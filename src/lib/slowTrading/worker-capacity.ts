import { MINIMAL_USDT_TO_TRADE } from "@/lib/trading/constants";
import entryOpenPositionGuard from "@/lib/trading/execute/entry-open-position-guard";
import type { Position } from "@/lib/trading/models";
import slowTradingWatchReserve from "./watch-reserve";

export interface SlowWorkerCapacity {
  availableWorkers: number;
  balanceAvailableWorkers: number;
  bailoutBufferUsdt: number;
  currentOpenPositions: number;
  entryBudgetUsdt: number;
  entryMarginUsdt: number;
  existingBailoutBufferUsdt: number;
  maxOpenPositions: number;
  projectedBailoutBufferUsdt: number;
  remainingPositionSlots: number | null;
  spendableUsdt: number;
  workerCostUsdt: number;
}

export interface SlowWorkerCapacityConfig {
  enableWatchLogic?: boolean;
  maxEntryMargin?: number;
  maxEntryMarginPct?: number;
  maxOpenPositions?: number;
  watchMaxNextAveragingLevels?: number;
  watchReserveLevels?: number;
  watchReservePctAlloc?: number;
}

interface CapacityPartsParams {
  entryMarginUsdt: number;
  existingBailoutBufferUsdt: number;
  maxNextLevels: number;
  pctAlloc: number;
  requiredMultiplier: number;
  reserveLevels: number;
  spendableUsdt: number;
  watchEnabled: boolean;
}

/**
 * Builds the derived worker costs for a candidate entry margin.
 */
function buildCapacityParts(params: CapacityPartsParams) {
  const workerCostUsdt =
    slowTradingWatchReserve.money.roundUsdt(
      params.entryMarginUsdt * params.requiredMultiplier,
    );
  const projectedWatchState = params.watchEnabled
    ? slowTradingWatchReserve.reserve.buildState({
        baseMarginUsdt: params.entryMarginUsdt,
        direction: "LONG",
        entryLevel: 0,
        maxNextLevels: params.maxNextLevels,
        pctAlloc: params.pctAlloc,
        reserveLevels: params.reserveLevels,
      })
    : undefined;
  const projectedBailoutBufferUsdt =
    slowTradingWatchReserve.balance.getLargestUnreservedWatchStateStepMarginUsdt(
      projectedWatchState,
    );
  const bailoutBufferUsdt = slowTradingWatchReserve.money.roundUsdt(
    Math.max(
      params.existingBailoutBufferUsdt,
      projectedBailoutBufferUsdt,
    ),
  );
  const entryBudgetUsdt = Math.max(0, params.spendableUsdt - bailoutBufferUsdt);

  return {
    bailoutBufferUsdt,
    entryBudgetUsdt,
    projectedBailoutBufferUsdt,
    workerCostUsdt,
  };
}

/**
 * Shrinks an uncapped preview margin until one worker preserves bailout cash.
 */
function fitPreviewMarginToBailoutBuffer(
  params: CapacityPartsParams,
): number {
  if (params.entryMarginUsdt <= 0) {
    return 0;
  }

  const currentParts = buildCapacityParts(params);
  if (currentParts.workerCostUsdt <= currentParts.entryBudgetUsdt) {
    return slowTradingWatchReserve.money.roundUsdt(params.entryMarginUsdt);
  }

  let low = 0;
  let high = params.entryMarginUsdt;
  for (let i = 0; i < 40; i += 1) {
    const midpoint = (low + high) / 2;
    const candidateParts = buildCapacityParts({
      ...params,
      entryMarginUsdt: midpoint,
    });

    if (candidateParts.workerCostUsdt <= candidateParts.entryBudgetUsdt) {
      low = midpoint;
    } else {
      high = midpoint;
    }
  }

  return slowTradingWatchReserve.money.roundUsdt(low);
}

/**
 * Calculates how many new SLOW entry workers the current balance can afford.
 */
export function calculateSlowWorkerCapacity(params: {
  activePositions: Array<Pick<Position, "strategy">>;
  config: SlowWorkerCapacityConfig;
  spendableUsdt: number;
}): SlowWorkerCapacity {
  const { activePositions, config } = params;
  const spendableUsdt = Math.max(0, params.spendableUsdt);
  const existingBailoutBufferUsdt =
    slowTradingWatchReserve.balance.getLargestUnreservedWatchStepMarginUsdt(
      activePositions,
    );
  const sizingBudgetUsdt = Math.max(
    0,
    spendableUsdt - existingBailoutBufferUsdt,
  );
  const watchEnabled = config.enableWatchLogic !== false;
  const reserveLevels = watchEnabled ? config.watchReserveLevels ?? 2 : 0;
  const maxNextLevels = watchEnabled
    ? config.watchMaxNextAveragingLevels ?? reserveLevels
    : 0;
  const pctAlloc = config.watchReservePctAlloc ?? 2;
  const initialEntryMarginUsdt =
    slowTradingWatchReserve.entry.adjustMarginForConfig({
      desiredMarginUsdt: sizingBudgetUsdt,
      spendableUsdt: sizingBudgetUsdt,
      enableWatchLogic: watchEnabled,
      reserveLevels,
      pctAlloc,
      maxEntryMarginPct: config.maxEntryMarginPct ?? 0,
      maxEntryMargin: config.maxEntryMargin ?? 0,
    });
  const requiredMultiplier = watchEnabled
    ? slowTradingWatchReserve.reserve.getRequiredMarginMultiplier({
        reserveLevels,
        pctAlloc,
      })
    : 1;
  const hasFixedEntryMarginCap =
    Number.isFinite(config.maxEntryMargin) &&
    (config.maxEntryMargin ?? 0) > 0;
  const entryMarginUsdt = hasFixedEntryMarginCap
    ? initialEntryMarginUsdt
    : fitPreviewMarginToBailoutBuffer({
        entryMarginUsdt: initialEntryMarginUsdt,
        existingBailoutBufferUsdt,
        maxNextLevels,
        pctAlloc,
        requiredMultiplier,
        reserveLevels,
        spendableUsdt,
        watchEnabled,
      });
  const {
    bailoutBufferUsdt,
    entryBudgetUsdt,
    projectedBailoutBufferUsdt,
    workerCostUsdt,
  } = buildCapacityParts({
    entryMarginUsdt,
    existingBailoutBufferUsdt,
    maxNextLevels,
    pctAlloc,
    requiredMultiplier,
    reserveLevels,
    spendableUsdt,
    watchEnabled,
  });
  const balanceAvailableWorkers =
    entryMarginUsdt >= MINIMAL_USDT_TO_TRADE && workerCostUsdt > 0
      ? Math.floor(entryBudgetUsdt / workerCostUsdt)
      : 0;
  const maxOpenPositions = entryOpenPositionGuard.limit.resolve(
    config.maxOpenPositions,
  );
  const currentOpenPositions = activePositions.length;
  const remainingPositionSlots =
    maxOpenPositions > 0
      ? Math.max(0, maxOpenPositions - currentOpenPositions)
      : null;
  const availableWorkers =
    remainingPositionSlots === null
      ? balanceAvailableWorkers
      : Math.min(balanceAvailableWorkers, remainingPositionSlots);

  return {
    availableWorkers,
    balanceAvailableWorkers,
    bailoutBufferUsdt,
    currentOpenPositions,
    entryBudgetUsdt,
    entryMarginUsdt,
    existingBailoutBufferUsdt,
    maxOpenPositions,
    projectedBailoutBufferUsdt,
    remainingPositionSlots,
    spendableUsdt,
    workerCostUsdt,
  };
}

/**
 * Grouped worker-capacity API for production, backtest, and UI callers.
 */
const slowTradingWorkerCapacity = {
  calculate: calculateSlowWorkerCapacity,
} as const;

export default slowTradingWorkerCapacity;
