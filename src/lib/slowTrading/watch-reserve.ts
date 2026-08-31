import {
  type AdaptiveAveragingConfig,
  type DynamicTradeConfig,
} from "@/lib/dynamic";
import { type VolatilityPoint } from "@lib/dynamic/utils/volatility";
import { type AveragingRecommendation } from "@lib/brain/algorithms/type-execute";
import { VOLATILITY_THRESHOLD } from "@/lib/brain/constants";
import type {
  Position,
  PositionAveragingState,
  PositionReserveStep,
} from "@/lib/trading/models";
import adaptiveAveraging from "@/lib/trading/adaptive-averaging";

/** One step in the SLOW averaging reserve ladder. */
export type WatchReserveStep = PositionReserveStep;
export type WatchReserveState = PositionAveragingState;

const DEFAULT_ADAPTIVE_AVERAGING_TARGET_MOVE_PCT = VOLATILITY_THRESHOLD;
const EXTREME_VPOINT_THRESHOLD_MULTIPLIER = 1.5;

export type AveragingRescueProjectionReason =
  | "READY"
  | "GUARD_DISABLED"
  | "EXTREME_VPOINT_BYPASS"
  | "INVALID_INPUT"
  | "DOES_NOT_IMPROVE_ENTRY"
  | "INSUFFICIENT_BALANCE"
  | "PROJECTED_PROFIT_BELOW_TARGET";

export interface AveragingRescueProjection {
  canExecute: boolean;
  marginUsdt: number;
  multiplier: number;
  projectedProfitPct: number;
  rescueTargetPrice: number;
  reason: AveragingRescueProjectionReason;
}

/**
 * Rounds usdt to the SLOW USDT precision.
 */
export function roundUsdt(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
}

/**
 * Builds slow watch reserve state from the latest SLOW storage and runtime data.
 */
export function buildSlowWatchReserveState(params: {
  direction: "LONG" | "SHORT";
  baseMarginUsdt: number;
  entryLevel: number;
  reserveLevels?: number;
  maxNextLevels?: number;
  pctAlloc?: number;
}): WatchReserveState {
  // BOTH:WATCH_MECHANISM
  // A. Normalize reserve settings from config defaults.
  const {
    direction,
    baseMarginUsdt,
    entryLevel = 0,
    reserveLevels = 2,
    maxNextLevels = reserveLevels,
    pctAlloc = 2,
  } = params;

  const steps: WatchReserveStep[] = [];
  let rollingTotalMarginUsdt = baseMarginUsdt;
  const reservedLevelCount = Math.max(0, Math.floor(reserveLevels));
  const totalLevelCount = Math.max(
    reservedLevelCount,
    Math.floor(maxNextLevels),
  );

  // B. Build reserved and future unreserved averaging steps.
  for (let i = 0; i < totalLevelCount; i++) {
    const marginUsdt = roundUsdt(rollingTotalMarginUsdt * pctAlloc);
    rollingTotalMarginUsdt += marginUsdt;

    const level =
      direction === "LONG" ? entryLevel - i - 1 : entryLevel + i + 1;

    steps.push({
      level,
      marginUsdt,
      allocationPct: pctAlloc,
      status: i < reservedLevelCount ? "RESERVED" : "UNRESERVED",
    });
  }

  // C. Summarize the currently reserved capital.
  const reservedRemainingMarginUsdt = roundUsdt(
    steps
      .filter((step) => step.status === "RESERVED")
      .reduce((sum, step) => sum + step.marginUsdt, 0),
  );

  return {
    entryLevel,
    lastHandledLevel: entryLevel,
    reserveBaseMarginUsdt: roundUsdt(baseMarginUsdt),
    reservedRemainingMarginUsdt,
    steps,
  };
}

/**
 * Gets slow watch reserve required margin multiplier from SLOW state or storage.
 */
export function getSlowWatchReserveRequiredMarginMultiplier(params: {
  reserveLevels?: number;
  pctAlloc?: number;
}): number {
  const reserveLevels = Math.max(0, Math.floor(params.reserveLevels ?? 2));
  const pctAlloc = params.pctAlloc ?? 2;

  if (reserveLevels <= 0 || !Number.isFinite(pctAlloc) || pctAlloc <= 0) {
    return 1;
  }

  let rollingTotalMarginUsdt = 1;

  for (let i = 0; i < reserveLevels; i++) {
    rollingTotalMarginUsdt += rollingTotalMarginUsdt * pctAlloc;
  }

  return rollingTotalMarginUsdt;
}

/**
 * Fits entry margin to slow watch reserve into the configured SLOW budget.
 */
export function fitEntryMarginToSlowWatchReserve(params: {
  desiredMarginUsdt: number;
  spendableUsdt: number;
  reserveLevels?: number;
  pctAlloc?: number;
}): number {
  // BOTH:ADJUST_ENTRY_AMOUNT
  const desiredMarginUsdt = params.desiredMarginUsdt;
  const spendableUsdt = params.spendableUsdt;

  if (
    !Number.isFinite(desiredMarginUsdt) ||
    desiredMarginUsdt <= 0 ||
    !Number.isFinite(spendableUsdt) ||
    spendableUsdt <= 0
  ) {
    return 0;
  }

  const reserveLevels = Math.max(0, Math.floor(params.reserveLevels ?? 2));
  const pctAlloc = params.pctAlloc ?? 2;

  if (reserveLevels <= 0 || !Number.isFinite(pctAlloc) || pctAlloc <= 0) {
    return roundUsdt(Math.min(desiredMarginUsdt, spendableUsdt));
  }

  const requiredMultiplier = getSlowWatchReserveRequiredMarginMultiplier({
    reserveLevels,
    pctAlloc,
  });

  // Keep one base-margin buffer spendable after entry + reserve, matching README_SLOW.
  const maxMarginUsdt = Math.floor(spendableUsdt / (requiredMultiplier + 1));

  return roundUsdt(Math.min(desiredMarginUsdt, maxMarginUsdt));
}

/** Applies the 24h-volume liquidity cap to the temporary entry sizing budget. */
export function capSpendableByVolume24h(params: {
  maxEntryBased24HourVolPct?: number;
  spendableUsdt: number;
  volume24h?: number;
}): number {
  const { maxEntryBased24HourVolPct = 0.2, spendableUsdt, volume24h } = params;

  if (
    !Number.isFinite(spendableUsdt) ||
    spendableUsdt <= 0 ||
    !Number.isFinite(maxEntryBased24HourVolPct) ||
    maxEntryBased24HourVolPct <= 0 ||
    !Number.isFinite(volume24h) ||
    volume24h === undefined ||
    volume24h <= 0
  ) {
    return spendableUsdt;
  }

  const volumeBudgetUsdt = volume24h * (maxEntryBased24HourVolPct / 100);
  if (!Number.isFinite(volumeBudgetUsdt) || volumeBudgetUsdt <= 0) {
    return spendableUsdt;
  }

  return Math.min(spendableUsdt, volumeBudgetUsdt);
}

/**
 * Handles the adjust entry margin for slow config SLOW flow from input through output.
 */
export function adjustEntryMarginForSlowConfig(params: {
  desiredMarginUsdt: number;
  spendableUsdt: number;
  enableWatchLogic?: boolean;
  reserveLevels?: number;
  pctAlloc?: number;
  maxEntryBased24HourVolPct?: number;
  volume24h?: number;
  maxEntryMarginPct?: number;
  maxEntryMargin?: number;
}): number {
  // BOTH:ADJUST_ENTRY_AMOUNT
  const {
    desiredMarginUsdt,
    spendableUsdt,
    enableWatchLogic = true,
    reserveLevels = 2,
    pctAlloc = 2,
    maxEntryBased24HourVolPct = 0.2,
    volume24h,
    maxEntryMarginPct = 0,
    maxEntryMargin = 0,
  } = params;

  if (
    !Number.isFinite(desiredMarginUsdt) ||
    desiredMarginUsdt <= 0 ||
    !Number.isFinite(spendableUsdt) ||
    spendableUsdt <= 0
  ) {
    return 0;
  }

  /**
   * Entry sizing is centralized at the margin layer for both production and
   * backtest. Percent and fixed caps are real account margin budgets, not
   * futures notional size. Callers that need notional must convert the returned
   * margin using their own marginRate/leverage.
   */
  const effectiveSpendableUsdt = capSpendableByVolume24h({
    spendableUsdt,
    volume24h,
    maxEntryBased24HourVolPct,
  });

  let marginUsdt = enableWatchLogic
    ? fitEntryMarginToSlowWatchReserve({
        desiredMarginUsdt,
        spendableUsdt: effectiveSpendableUsdt,
        reserveLevels,
        pctAlloc,
      })
    : Math.min(desiredMarginUsdt, effectiveSpendableUsdt);

  const requiredMultiplier =
    enableWatchLogic && reserveLevels > 0 && pctAlloc > 0
      ? getSlowWatchReserveRequiredMarginMultiplier({ reserveLevels, pctAlloc })
      : 1;

  if (
    Number.isFinite(maxEntryMarginPct) &&
    maxEntryMarginPct > 0 &&
    requiredMultiplier > 0
  ) {
    const spendableCapPct = Math.min(100, maxEntryMarginPct);
    const maxTotalBudgetUsdt = (effectiveSpendableUsdt * spendableCapPct) / 100;
    marginUsdt = Math.min(
      marginUsdt,
      Math.floor(maxTotalBudgetUsdt / requiredMultiplier),
    );
  }

  if (maxEntryMargin > 0) {
    marginUsdt = Math.min(marginUsdt, maxEntryMargin);
  }

  return roundUsdt(marginUsdt);
}

/**
 * Gets reserved remaining usdt from SLOW state or storage.
 */
export function getReservedRemainingUsdt(
  averaging?: Pick<PositionAveragingState, "reservedRemainingMarginUsdt">,
): number {
  const value = averaging?.reservedRemainingMarginUsdt;
  return typeof value === "number" && Number.isFinite(value)
    ? roundUsdt(value)
    : 0;
}

type VolatilityPointOwner = {
  volatility?: {
    lastVolatility?: VolatilityPoint[];
  };
};

function findEntrySignalVolatilityPoint(params: {
  entrySignal: Pick<VolatilityPoint, "id" | "symbol">;
  modelMemory?: VolatilityPointOwner;
  volatilityPoints?: VolatilityPoint[];
}): VolatilityPoint | undefined {
  const entryId = String(params.entrySignal.id || "").trim();
  if (!entryId) {
    return undefined;
  }

  const sourcePoints =
    params.volatilityPoints ??
    params.modelMemory?.volatility?.lastVolatility ??
    [];

  return sourcePoints.find(
    (point) => String(point.id || "").trim() === entryId,
  );
}

/**
 * Checks whether the source volatility point for an entry signal is already used.
 */
export function isEntrySignalVolatilityPointUsed(params: {
  entrySignal: Pick<VolatilityPoint, "id" | "symbol">;
  modelMemory?: VolatilityPointOwner;
  volatilityPoints?: VolatilityPoint[];
}): boolean {
  // BOTH:ENTRY_ONLY_IN_UNIQUE_VOLATILITY_POINT_ID
  return findEntrySignalVolatilityPoint(params)?.used === true;
}

/**
 * Checks whether a volatility point is strong enough to trigger averaging.
 * Level `0` and absolute level `1` remain observation-only for averaging even
 * when entry is configured to allow absolute level `1`.
 */
export function isActionableAveragingVolatilityLevel(
  volatilityPoint: Pick<VolatilityPoint, "lvl">,
): boolean {
  // PROD:LOW_LEVEL_NO_ACTION_AVERAGING
  return (
    typeof volatilityPoint.lvl === "number" &&
    Number.isFinite(volatilityPoint.lvl) &&
    Math.abs(volatilityPoint.lvl) > 1
  );
}

/**
 * Finds the first post-entry target vPoint reached by a position.
 */
export function findPositionTargetVolatilityPoint<
  TPoint extends Pick<VolatilityPoint, "l" | "t">,
>(params: {
  position: Pick<Position, "direction" | "opened">;
  volatilityPoints: TPoint[];
}): TPoint | undefined {
  // BOTH:AVERAGING_STOPS_AFTER_TARGET_VPOINT
  const targetLabel = params.position.direction === "SHORT" ? "B" : "T";
  const entryTime = params.position.opened.t ?? 0;

  return params.volatilityPoints.reduce<TPoint | undefined>(
    (firstTarget, point) => {
      if (point.l !== targetLabel || point.t < entryTime) {
        return firstTarget;
      }

      return !firstTarget || point.t < firstTarget.t ? point : firstTarget;
    },
    undefined,
  );
}

/**
 * Checks whether a position has reached its post-entry target vPoint.
 */
export function hasPositionHitTargetVolatilityPoint(params: {
  position: Pick<Position, "direction" | "opened">;
  volatilityPoints: Array<Pick<VolatilityPoint, "l" | "t">>;
}): boolean {
  return Boolean(findPositionTargetVolatilityPoint(params));
}

/**
 * Marks an entry signal's source volatility point as used after entry succeeds.
 */
export function markEntrySignalVolatilityPointUsed(params: {
  entrySignal: Pick<VolatilityPoint, "id" | "symbol">;
  modelMemory?: VolatilityPointOwner;
  volatilityPoints?: VolatilityPoint[];
}): boolean {
  // BOTH:ENTRY_ONLY_IN_UNIQUE_VOLATILITY_POINT_ID
  const point = findEntrySignalVolatilityPoint(params);
  if (!point) {
    return false;
  }

  point.used = true;
  return true;
}

/**
 * Gets the margin currently locked by one open position.
 */
export function getLockedPositionMarginUsdt(
  position: Pick<Position, "exposure">,
): number {
  const explicitMargin =
    typeof position.exposure.marginUsdt === "number" &&
    Number.isFinite(position.exposure.marginUsdt)
      ? position.exposure.marginUsdt
      : 0;

  if (explicitMargin > 0) {
    return roundUsdt(explicitMargin);
  }

  const positionUsdt =
    typeof position.exposure.notionalUsdt === "number" && Number.isFinite(position.exposure.notionalUsdt)
      ? position.exposure.notionalUsdt
      : 0;

  if (positionUsdt <= 0) {
    return 0;
  }

  const leverage =
    typeof position.exposure.leverage === "number" && Number.isFinite(position.exposure.leverage)
      ? Math.max(1, position.exposure.leverage)
      : 1;

  return roundUsdt(positionUsdt / leverage);
}

/**
 * Gets total margin locked by active open positions.
 */
export function getLockedQuoteAssetValue(params: {
  activePositions?: Array<Pick<Position, "exposure">>;
}): number {
  return roundUsdt(
    (params.activePositions ?? []).reduce(
      (total, position) => total + getLockedPositionMarginUsdt(position),
      0,
    ),
  );
}

/**
 * Gets spendable quote asset value from SLOW state or storage.
 *
 * The quote balance is exchange-free capital, so open-position margin has
 * already been excluded and must not be deducted again.
 */
export function getSpendableQuoteAssetValue(params: {
  quoteAsset?: number;
  reservedQuoteAsset?: number;
  safeHaven?: number;
}): number {
  const quoteAsset =
    typeof params.quoteAsset === "number" && Number.isFinite(params.quoteAsset)
      ? params.quoteAsset
      : 0;
  const reservedQuoteAsset =
    typeof params.reservedQuoteAsset === "number" &&
    Number.isFinite(params.reservedQuoteAsset)
      ? params.reservedQuoteAsset
      : 0;
  const safeHaven =
    typeof params.safeHaven === "number" && Number.isFinite(params.safeHaven)
      ? params.safeHaven
      : 0;

  return roundUsdt(Math.max(0, quoteAsset - reservedQuoteAsset - safeHaven));
}

/**
 * Finds the largest unreserved margin in one watch reserve state.
 */
export function getLargestUnreservedWatchStateStepMarginUsdt(
  watchState?: Pick<WatchReserveState, "steps">,
): number {
  const largest = (watchState?.steps ?? []).reduce(
    (currentLargest, step) => {
      if (
        step.status !== "UNRESERVED" ||
        !Number.isFinite(step.marginUsdt) ||
        step.marginUsdt <= currentLargest
      ) {
        return currentLargest;
      }

      return step.marginUsdt;
    },
    0,
  );

  return roundUsdt(largest);
}

/**
 * Finds the largest unreserved watch step needed to bail out current positions.
 */
export function getLargestUnreservedWatchStepMarginUsdt(
  activePositions: Array<Pick<Position, "strategy">>,
): number {
  // BOTH:ALWAYS_HAVE_SPENDABLE_TO_BAILING_OUT
  const largest = activePositions.reduce(
    (currentLargest, position) =>
      Math.max(
        currentLargest,
        getLargestUnreservedWatchStateStepMarginUsdt(
          position.strategy.averaging,
        ),
      ),
    0,
  );

  return roundUsdt(largest);
}

/**
 * Checks whether a new entry leaves enough spendable balance for bailout.
 */
export function canKeepSpendableForLargestUnreservedBailout(params: {
  activePositions: Array<Pick<Position, "strategy">>;
  entryMarginUsdt: number;
  projectedWatchState?: WatchReserveState;
  reserveBudgetUsdt: number;
  spendableUsdt: number;
}): {
  canEnter: boolean;
  largestUnreservedBailoutUsdt: number;
  spendableAfterEntryUsdt: number;
} {
  // BOTH:ALWAYS_HAVE_SPENDABLE_TO_BAILING_OUT
  const spendableAfterEntryUsdt = roundUsdt(
    Math.max(
      0,
      params.spendableUsdt -
        Math.max(0, params.entryMarginUsdt) -
        Math.max(0, params.reserveBudgetUsdt),
    ),
  );
  const largestUnreservedBailoutUsdt = roundUsdt(
    Math.max(
      getLargestUnreservedWatchStepMarginUsdt(params.activePositions),
      getLargestUnreservedWatchStateStepMarginUsdt(
        params.projectedWatchState,
      ),
    ),
  );

  return {
    canEnter: spendableAfterEntryUsdt >= largestUnreservedBailoutUsdt,
    largestUnreservedBailoutUsdt,
    spendableAfterEntryUsdt,
  };
}

/**
 * Checks whether spend watch step margin can be used by the SLOW flow.
 */
export function canSpendWatchStepMargin(params: {
  step: WatchReserveStep;
  quoteAsset?: number;
  reservedQuoteAsset?: number;
  minimalUsdt?: number;
}): boolean {
  // BOTH:HAVE_ENOUGH_TO_RESERVED
  const amount = params.step.marginUsdt;

  if (!Number.isFinite(amount) || amount < (params.minimalUsdt ?? 0)) {
    return false;
  }

  const quoteAsset =
    typeof params.quoteAsset === "number" && Number.isFinite(params.quoteAsset)
      ? params.quoteAsset
      : 0;

  if (quoteAsset < amount) {
    return false;
  }

  if (params.step.status !== "UNRESERVED") {
    const reservedCoverage =
      typeof params.step.reservedMarginUsdt === "number" &&
      Number.isFinite(params.step.reservedMarginUsdt) &&
      params.step.reservedMarginUsdt > 0
        ? params.step.reservedMarginUsdt
        : params.step.marginUsdt;
    const spendable = getSpendableQuoteAssetValue({
      quoteAsset,
      reservedQuoteAsset: params.reservedQuoteAsset,
    });

    return amount <= reservedCoverage + spendable;
  }

  return (
    getSpendableQuoteAssetValue({
      quoteAsset,
      reservedQuoteAsset: params.reservedQuoteAsset,
    }) >= amount
  );
}

/**
 * Calculates projected profit after averaging at the executable price.
 */
export function calculateProjectedAveragingProfitPct(params: {
  direction: "LONG" | "SHORT";
  entryPrice: number;
  existingQuantity: number;
  leverage: number;
  executablePrice: number;
  rescueAnchorPrice: number;
  addMarginUsdt: number;
  targetMovePct?: number;
}): number {
  const {
    direction,
    entryPrice,
    existingQuantity,
    leverage,
    executablePrice,
    rescueAnchorPrice,
    addMarginUsdt,
    targetMovePct = DEFAULT_ADAPTIVE_AVERAGING_TARGET_MOVE_PCT,
  } = params;

  if (
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    !Number.isFinite(existingQuantity) ||
    existingQuantity <= 0 ||
    !Number.isFinite(leverage) ||
    leverage <= 0 ||
    !Number.isFinite(executablePrice) ||
    executablePrice <= 0 ||
    !Number.isFinite(rescueAnchorPrice) ||
    rescueAnchorPrice <= 0 ||
    !Number.isFinite(addMarginUsdt) ||
    addMarginUsdt <= 0
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  const addedQuantity = (addMarginUsdt * leverage) / executablePrice;
  const newQuantity = existingQuantity + addedQuantity;
  const newEntryPrice =
    (entryPrice * existingQuantity + executablePrice * addedQuantity) /
    newQuantity;
  const targetPrice =
    direction === "LONG"
      ? rescueAnchorPrice * (1 + targetMovePct / 100)
      : rescueAnchorPrice * (1 - targetMovePct / 100);
  const rawGain =
    direction === "LONG"
      ? (targetPrice - newEntryPrice) / newEntryPrice
      : (newEntryPrice - targetPrice) / newEntryPrice;

  return Number.isFinite(rawGain) ? rawGain * 100 : Number.NEGATIVE_INFINITY;
}

/**
 * Resolves whether a watch step improves the entry and reaches its rescue target.
 */
export function resolveAveragingRescueProjection(params: {
  position: Pick<Position, "direction" | "exposure">;
  step: WatchReserveStep;
  executablePrice: number;
  rescueAnchorPrice: number;
  quoteAsset?: number;
  reservedQuoteAsset?: number;
  adaptiveAveraging?: AdaptiveAveragingConfig;
  rescueProjectionGuardEnabled?: boolean;
  triggerVolatilityPct?: number;
  targetMovePct?: number;
}): AveragingRescueProjection {
  // BOTH:AVERAGING_IMPROVES_RESCUE_PROJECTION
  const {
    position,
    step,
    executablePrice,
    rescueAnchorPrice,
    adaptiveAveraging: adaptiveAveragingConfig,
    rescueProjectionGuardEnabled = true,
    targetMovePct = DEFAULT_ADAPTIVE_AVERAGING_TARGET_MOVE_PCT,
  } = params;
  const resolvedAdaptiveAveraging = adaptiveAveraging.config.normalize(
    adaptiveAveragingConfig,
    false,
  );
  const baseMarginUsdt =
    typeof position.exposure.marginUsdt === "number" &&
    Number.isFinite(position.exposure.marginUsdt)
      ? position.exposure.marginUsdt
      : 0;
  const baseMultiplier =
    Number.isFinite(step.allocationPct) && step.allocationPct > 0
      ? step.allocationPct
      : 2;
  const startMarginUsdt =
    Number.isFinite(step.marginUsdt) && step.marginUsdt > 0
      ? step.marginUsdt
      : baseMarginUsdt * baseMultiplier;
  const rescueTargetPrice =
    (position.direction ?? "LONG") === "LONG"
      ? rescueAnchorPrice * (1 + targetMovePct / 100)
      : rescueAnchorPrice * (1 - targetMovePct / 100);
  const invalidResult: AveragingRescueProjection = {
    canExecute: false,
    marginUsdt: roundUsdt(startMarginUsdt),
    multiplier: baseMultiplier,
    projectedProfitPct: Number.NEGATIVE_INFINITY,
    rescueTargetPrice,
    reason: "INVALID_INPUT",
  };
  const hasBalance =
    typeof params.quoteAsset === "number" &&
    Number.isFinite(params.quoteAsset);

  if (
    baseMarginUsdt <= 0 ||
    !Number.isFinite(position.exposure.averageEntryPrice) ||
    position.exposure.averageEntryPrice <= 0 ||
    !Number.isFinite(position.exposure.quantity) ||
    position.exposure.quantity <= 0 ||
    !Number.isFinite(executablePrice) ||
    executablePrice <= 0 ||
    !Number.isFinite(rescueAnchorPrice) ||
    rescueAnchorPrice <= 0 ||
    !Number.isFinite(rescueTargetPrice) ||
    rescueTargetPrice <= 0
  ) {
    if (!rescueProjectionGuardEnabled) {
      return {
        ...invalidResult,
        canExecute: true,
        reason: "GUARD_DISABLED",
      };
    }

    return invalidResult;
  }

  const direction = position.direction ?? "LONG";
  const improvesEntry =
    direction === "LONG"
      ? executablePrice < position.exposure.averageEntryPrice
      : executablePrice > position.exposure.averageEntryPrice;
  const bypassProjectionForExtremeVPoint =
    typeof params.triggerVolatilityPct === "number" &&
    Number.isFinite(params.triggerVolatilityPct) &&
    params.triggerVolatilityPct >
      VOLATILITY_THRESHOLD * EXTREME_VPOINT_THRESHOLD_MULTIPLIER;

  const baseProjectedProfitPct = calculateProjectedAveragingProfitPct({
    direction: position.direction ?? "LONG",
    entryPrice: position.exposure.averageEntryPrice,
    existingQuantity: position.exposure.quantity,
    leverage: position.exposure.leverage ?? 1,
    executablePrice,
    rescueAnchorPrice,
    addMarginUsdt: startMarginUsdt,
    targetMovePct,
  });

  if (!improvesEntry) {
    if (!rescueProjectionGuardEnabled) {
      return {
        canExecute: true,
        marginUsdt: roundUsdt(startMarginUsdt),
        multiplier: baseMultiplier,
        projectedProfitPct: baseProjectedProfitPct,
        rescueTargetPrice,
        reason: "GUARD_DISABLED",
      };
    }

    return {
      canExecute: false,
      marginUsdt: roundUsdt(startMarginUsdt),
      multiplier: baseMultiplier,
      projectedProfitPct: baseProjectedProfitPct,
      rescueTargetPrice,
      reason: "DOES_NOT_IMPROVE_ENTRY",
    };
  }

  const normalizedMaxMultiplier = Math.max(
    Math.ceil(baseMultiplier),
    resolvedAdaptiveAveraging.maxMultiplier,
  );
  const candidates = [
    {
      marginUsdt: roundUsdt(startMarginUsdt),
      multiplier: baseMultiplier,
    },
  ];

  if (resolvedAdaptiveAveraging.enabled) {
    for (
      let multiplier = Math.floor(baseMultiplier) + 1;
      multiplier <= normalizedMaxMultiplier;
      multiplier++
    ) {
      const marginUsdt = roundUsdt(baseMarginUsdt * multiplier);

      if (marginUsdt > startMarginUsdt) {
        candidates.push({ marginUsdt, multiplier });
      }
    }
  }

  let hasAffordableCandidate = false;
  let lastProjectedProfitPct = baseProjectedProfitPct;
  let lastAffordableCandidate:
    | {
        marginUsdt: number;
        multiplier: number;
        projectedProfitPct: number;
      }
    | undefined;

  for (const candidate of candidates) {
    const { marginUsdt, multiplier } = candidate;
    const isAffordable =
      !hasBalance ||
      canSpendWatchStepMargin({
        step: {
          ...step,
          reservedMarginUsdt: step.marginUsdt,
          marginUsdt,
          allocationPct: multiplier,
        },
        quoteAsset: params.quoteAsset,
        reservedQuoteAsset: params.reservedQuoteAsset,
      });

    if (!isAffordable) {
      continue;
    }

    hasAffordableCandidate = true;
    const projectedProfitPct = calculateProjectedAveragingProfitPct({
      direction: position.direction ?? "LONG",
      entryPrice: position.exposure.averageEntryPrice,
      existingQuantity: position.exposure.quantity,
      leverage: position.exposure.leverage ?? 1,
      executablePrice,
      rescueAnchorPrice,
      addMarginUsdt: marginUsdt,
      targetMovePct,
    });
    lastProjectedProfitPct = projectedProfitPct;
    lastAffordableCandidate = {
      marginUsdt,
      multiplier,
      projectedProfitPct,
    };

    if (
      projectedProfitPct >=
      resolvedAdaptiveAveraging.minProjectedProfitPct
    ) {
      return {
        canExecute: true,
        marginUsdt,
        multiplier,
        projectedProfitPct,
        rescueTargetPrice,
        reason: "READY",
      };
    }
  }

  if (bypassProjectionForExtremeVPoint && lastAffordableCandidate) {
    return {
      canExecute: true,
      ...lastAffordableCandidate,
      rescueTargetPrice,
      reason: "EXTREME_VPOINT_BYPASS",
    };
  }

  if (!rescueProjectionGuardEnabled) {
    return {
      canExecute: true,
      marginUsdt: roundUsdt(startMarginUsdt),
      multiplier: baseMultiplier,
      projectedProfitPct: baseProjectedProfitPct,
      rescueTargetPrice,
      reason: "GUARD_DISABLED",
    };
  }

  return {
    canExecute: false,
    marginUsdt: roundUsdt(startMarginUsdt),
    multiplier: baseMultiplier,
    projectedProfitPct: lastProjectedProfitPct,
    rescueTargetPrice,
    reason: hasAffordableCandidate
      ? "PROJECTED_PROFIT_BELOW_TARGET"
      : "INSUFFICIENT_BALANCE",
  };
}

/**
 * Gets next reserved watch step from SLOW state or storage.
 */
export function getNextReservedWatchStep(params: {
  averaging?: PositionAveragingState;
  handledLevel?: number;
}) {
  return getNextWatchStep({
    ...params,
    includeUnreserved: false,
  });
}

/**
 * Gets next watch step from SLOW state or storage.
 */
export function getNextWatchStep(params: {
  averaging?: PositionAveragingState;
  handledLevel?: number;
  includeUnreserved?: boolean;
}) {
  const steps: WatchReserveStep[] =
    params.averaging?.steps ?? [];
  const allowedStatuses = params.includeUnreserved
    ? new Set(["RESERVED", "UNRESERVED"])
    : new Set(["RESERVED"]);

  if (
    typeof params.handledLevel === "number" &&
    Number.isFinite(params.handledLevel)
  ) {
    return (
      steps.find(
        (step) =>
          allowedStatuses.has(step.status) &&
          step.level === params.handledLevel,
      ) ?? null
    );
  }

  return steps.find((step) => allowedStatuses.has(step.status)) ?? null;
}

/**
 * Handles the mark reserved watch step used SLOW flow from input through output.
 */
export function markReservedWatchStepUsed(params: {
  averaging?: PositionAveragingState;
  handledLevel?: number;
  executedPrice: number;
  usedAt: number;
  usedMarginUsdt?: number;
  usedPctAlloc?: number;
}) {
  const averaging = params.averaging;
  if (!averaging?.steps.length) {
    return null;
  }

  const step = getNextWatchStep({
    averaging,
    handledLevel: params.handledLevel,
    includeUnreserved: true,
  });
  if (!step) {
    return null;
  }

  averaging.steps = averaging.steps.map(
    (item: WatchReserveStep) =>
      item.level === step.level &&
      (item.status === "RESERVED" || item.status === "UNRESERVED")
        ? {
            ...item,
            reservedMarginUsdt: item.marginUsdt,
            marginUsdt:
              typeof params.usedMarginUsdt === "number" &&
              Number.isFinite(params.usedMarginUsdt) &&
              params.usedMarginUsdt > 0
                ? roundUsdt(params.usedMarginUsdt)
                : item.marginUsdt,
            allocationPct:
              typeof params.usedPctAlloc === "number" &&
              Number.isFinite(params.usedPctAlloc) &&
              params.usedPctAlloc > 0
                ? params.usedPctAlloc
                : item.allocationPct,
            status: "USED" as const,
            usedAt: params.usedAt,
            usedPrice: params.executedPrice,
          }
        : item,
  );

  averaging.reservedRemainingMarginUsdt = roundUsdt(
    averaging.steps
      .filter((item: WatchReserveStep) => item.status === "RESERVED")
      .reduce(
        (sum: number, item: WatchReserveStep) => sum + item.marginUsdt,
        0,
      ),
  );

  averaging.lastHandledLevel = step.level;

  return step;
}

/**
 * Releases remaining watch reserve back into spendable SLOW balance.
 */
export function releaseRemainingWatchReserve(
  averaging?: PositionAveragingState,
) {
  if (!averaging?.steps.length) {
    return;
  }

  const releasedAt = Date.now();
  averaging.steps = averaging.steps.map(
    (step: WatchReserveStep) =>
      step.status === "RESERVED" || step.status === "UNRESERVED"
        ? {
            ...step,
            status: "RELEASED" as const,
            releasedAt,
          }
        : step,
  );
  averaging.reservedRemainingMarginUsdt = 0;
}

/**
 * Generates averaging recommendations from the current SLOW watch state.
 */
export function generateAveragingRecommendations(params: {
  activePositions: Position[];
  volatilityPointsMap: Record<string, VolatilityPoint[]>;
  config: DynamicTradeConfig;
  currentTimeMs?: number;
  quoteAsset?: number;
  reservedQuoteAsset?: number;
}) {
  // BOTH:WATCH_MECHANISM
  // A. Normalize runtime input for the averaging scan.
  const {
    activePositions,
    volatilityPointsMap,
    config,
    currentTimeMs,
  } = params;
  const recommendations: AveragingRecommendation[] = [];
  const maxNextLevels = config.watchMaxNextAveragingLevels ?? 2;

  // B. Scan each active position against its latest volatility point.
  for (const position of activePositions) {
    if (!position.symbol) continue;

    const points = volatilityPointsMap[position.symbol];
    if (!points || points.length === 0) continue;

    const lastPoint = points.at(-1)!;
    // B.1 In backtest, only consume the volatility point for the current candle.
    if (
      typeof currentTimeMs === "number" &&
      Number.isFinite(currentTimeMs) &&
      lastPoint.t !== currentTimeMs
    ) {
      continue;
    }

    // Use the actual position margin as base — maxEntryMargin cap is handled by executeEntry
    const baseMargin = position.exposure.marginUsdt ?? 0;
    if (baseMargin <= 0) continue;

    // C. Resolve the next watch step that this position is allowed to consume.
    const entryLevel = position.opened.vPoint.lvl ?? 0;
    const nextStep = getNextWatchStep({
      averaging: position.strategy.averaging,
      includeUnreserved: true,
    });

    if (!nextStep) {
      continue;
    }

    // Check if we should recommend an averaging entry
    if (
      maxNextLevels > 0 &&
      isActionableAveragingVolatilityLevel(lastPoint)
    ) {
      const direction = position.direction || "LONG";

      // D. Do not restart averaging after the first post-entry target vPoint.
      if (
        hasPositionHitTargetVolatilityPoint({
          position,
          volatilityPoints: points,
        })
      ) {
        continue;
      }

      // E. Emit an averaging recommendation only when the new point is deeper.
      // For LONG: average down when price drops through the next reserved level.
      const isDeeperLong =
        direction === "LONG" &&
        lastPoint.lvl < entryLevel &&
        lastPoint.lvl <= nextStep.level;
      // For SHORT: average up when price rises through the next reserved level.
      const isDeeperShort =
        direction === "SHORT" &&
        lastPoint.lvl > entryLevel &&
        lastPoint.lvl >= nextStep.level;

      if (isDeeperLong || isDeeperShort) {
        const distance = Math.abs(lastPoint.lvl - entryLevel);

        if (distance <= maxNextLevels) {
          recommendations.push({
            ...lastPoint,
            // Compact backtest vPoints omit runtime-only ownership metadata.
            // The active position remains the source of truth in every mode.
            symbol: position.symbol,
            message: `Averaging ${direction} for ${position.symbol} at level ${lastPoint.lvl}`,
            maxLeverage: position.exposure.leverage ?? 1,
            investAmount: nextStep.marginUsdt,
          });
        }
      }
    }
  }

  return {
    recommendations,
  };
}

/**
 * Grouped watch-reserve API for SLOW callers that need related operations
 * without importing many standalone helpers.
 */
const slowTradingWatchReserve = {
  money: {
    roundUsdt,
  },
  reserve: {
    buildState: buildSlowWatchReserveState,
    getRequiredMarginMultiplier: getSlowWatchReserveRequiredMarginMultiplier,
    getReservedRemainingUsdt,
    releaseRemaining: releaseRemainingWatchReserve,
  },
  entry: {
    adjustMarginForConfig: adjustEntryMarginForSlowConfig,
    capSpendableByVolume24h,
    fitMarginToReserve: fitEntryMarginToSlowWatchReserve,
  },
  balance: {
    canKeepSpendableForLargestUnreservedBailout,
    canSpendWatchStepMargin,
    getLargestUnreservedWatchStateStepMarginUsdt,
    getLargestUnreservedWatchStepMarginUsdt,
    getLockedPositionMarginUsdt,
    getLockedQuoteAssetValue,
    getSpendableQuoteAssetValue,
  },
  volatilityPoint: {
    isActionableAveragingLevel: isActionableAveragingVolatilityLevel,
    isUsed: isEntrySignalVolatilityPointUsed,
    markUsed: markEntrySignalVolatilityPointUsed,
  },
  averaging: {
    calculateProjectedProfitPct: calculateProjectedAveragingProfitPct,
    findTargetVPoint: findPositionTargetVolatilityPoint,
    generateRecommendations: generateAveragingRecommendations,
    getNextReservedStep: getNextReservedWatchStep,
    getNextStep: getNextWatchStep,
    hasHitTargetVPoint: hasPositionHitTargetVolatilityPoint,
    markReservedStepUsed: markReservedWatchStepUsed,
    resolveRescueProjection: resolveAveragingRescueProjection,
  },
} as const;

export default slowTradingWatchReserve;
export { slowTradingWatchReserve };
