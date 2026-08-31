import type { DynamicTradeConfig, VolatilityPoint } from "@/lib/dynamic";
import {
  resolveBacktestExitDecision,
  type BacktestExitDecision,
} from "@/lib/dynamic/backtest-volatility/exit-policy";
import type { UnifiedKline } from "@/lib/exchange/types";
import blackSwan, { type BlackSwanConfig } from "@/lib/trading/black-swan";
import { TRADE_MESSAGE } from "@/lib/trading/message";
import type {
  Position,
  PositionCloseReason,
} from "@/lib/trading/models";
import { BACKTEST_ONE_SIDE_FEE_RATIO } from "@/lib/dynamic/backtest-volatility/constants";
import {
  buildSlowWatchReserveState,
  getNextWatchStep,
  getReservedRemainingUsdt,
  isActionableAveragingVolatilityLevel,
  markReservedWatchStepUsed,
  resolveAveragingRescueProjection,
} from "@/lib/slowTrading/watch-reserve";
import slowTradingStages from "@/lib/slowTrading/stages";
import type {
  BlackSwanBacktestResult,
  BlackSwanSavingsBacktestPoint,
  BlackSwanSavingsBacktestResult,
  BlackSwanSavingsExitReason,
  BlackSwanSavingsPositionResult,
  BlackSwanSavingsVPoint,
} from "./types";

const MINUTE_MS = 60_000;
const SURROUNDING_VPOINT_COUNT = 5;

interface ReplayLot {
  level: number;
  marginUsdt: number;
  multiplier: number;
  price: number;
  t: number;
}

interface ReplayPosition {
  baseline: Position;
  normal: ReplayOutcome;
  protected: ReplayOutcome;
}

interface ReplayOutcome {
  exit: ReplayExit;
  lots: ReplayLot[];
  monitoringReasonAtExit: string;
  monitoringStageAtExit: "speedup" | "standard";
  position: Position;
}

interface ReplayExit {
  pnlPct: number;
  pnlUsdt: number;
  price: number;
  reason: BlackSwanSavingsExitReason;
  t: number;
}

interface PositionMetrics {
  averageEntryPrice: number;
  marginUsdt: number;
  notionalUsdt: number;
  pnlPct: number;
  pnlUsdt: number;
  quantity: number;
}

function roundUsdt(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPct(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000) / 1_000;
}

/** Converts fee-aware USDT PnL into position PnL percent, not margin ROI. */
function calculatePnlPct(pnlUsdt: number, notionalUsdt: number): number {
  return notionalUsdt > 0 ? (pnlUsdt / notionalUsdt) * 100 : 0;
}

function candleCloseT(candle: UnifiedKline): number {
  const closeT = Number(candle[6]);
  return Number.isFinite(closeT) ? closeT : Number(candle[0]) + MINUTE_MS - 1;
}

/** Finds the newest valid closed-candle price visible at one replay time. */
function priceAtOrBefore(
  candles: UnifiedKline[],
  t: number,
): { price: number; t: number } | undefined {
  let low = 0;
  let high = candles.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (candleCloseT(candles[middle]) <= t) low = middle + 1;
    else high = middle;
  }

  for (let index = low - 1; index >= 0; index -= 1) {
    const price = Number(candles[index][4]);
    if (Number.isFinite(price) && price > 0) {
      return { price, t: candleCloseT(candles[index]) };
    }
  }
  return undefined;
}

/** Recovers only the original entry margin from a completed backtest position. */
function initialMarginUsdt(position: Position): number {
  const executions = position.strategy.averaging.executions ?? [];
  const averagingMargin = executions.reduce(
    (sum, execution) => sum + Math.max(0, Number(execution.marginUsdt) || 0),
    0,
  );
  return Math.max(
    0,
    Number(position.exposure.marginUsdt) - averagingMargin,
  );
}

/** Calculates fee-aware metrics from only the real lots visible at `t`. */
function calculateMetrics(params: {
  exitPrice: number;
  lots: ReplayLot[];
  oneSideFeeRatio: number;
  position: Position;
  t: number;
}): PositionMetrics {
  const activeLots = params.lots.filter((lot) => lot.t <= params.t);
  const leverage = Math.max(1, Number(params.position.exposure.leverage) || 1);
  const marginUsdt = activeLots.reduce(
    (sum, lot) => sum + lot.marginUsdt,
    0,
  );
  const notionalUsdt = activeLots.reduce(
    (sum, lot) => sum + lot.marginUsdt * leverage,
    0,
  );
  const quantity = activeLots.reduce(
    (sum, lot) => sum + (lot.marginUsdt * leverage) / lot.price,
    0,
  );
  const averageEntryPrice = quantity > 0 ? notionalUsdt / quantity : 0;
  const grossPnlUsdt =
    params.position.direction === "SHORT"
      ? (averageEntryPrice - params.exitPrice) * quantity
      : (params.exitPrice - averageEntryPrice) * quantity;
  // Keep parity with the standard backtest accounting: entry/add fees are
  // charged from margin while the exit fee is charged from exit notional.
  const entryFeeUsdt = marginUsdt * params.oneSideFeeRatio;
  const exitFeeUsdt = quantity * params.exitPrice * params.oneSideFeeRatio;
  const pnlUsdt = grossPnlUsdt - entryFeeUsdt - exitFeeUsdt;

  return {
    averageEntryPrice,
    marginUsdt,
    notionalUsdt,
    pnlPct: calculatePnlPct(pnlUsdt, notionalUsdt),
    pnlUsdt,
    quantity,
  };
}

function resolveDecisionReason(
  decision: BacktestExitDecision,
): PositionCloseReason {
  if (
    decision.category === TRADE_MESSAGE.sell.LIQUIDATED_GLOBAL ||
    decision.category === TRADE_MESSAGE.sell.LIQUIDATED_ISOLATED
  ) {
    return "LIQUIDATED";
  }

  const message = String(decision.message ?? "");
  if (message.includes("STOP_LOSS_BY_USDT_LOSS")) {
    return "STOP_LOSS_BY_USDT_LOSS";
  }
  if (message.includes("VOLATILITY_TARGET_SL")) {
    return "VOLATILITY_TARGET_SL";
  }
  if (message.includes("VOLATILITY_TARGET_TP")) {
    return "VOLATILITY_TARGET_TP";
  }
  if (message.includes("POST_AVERAGE_RESCUE_EXIT")) {
    return "POST_AVERAGE_RESCUE_EXIT";
  }
  if (message.includes("POST_AVERAGE_STOP_LOSS")) {
    return "POST_AVERAGE_STOP_LOSS";
  }
  if (message.includes("POST_AVERAGE_RESCUE_TP")) {
    return "POST_AVERAGE_RESCUE_TP";
  }
  if (message.includes("TRADITIONAL_TP_SL")) {
    return decision.category === TRADE_MESSAGE.sell.SL
      ? "STOP_LOSS"
      : "TAKE_PROFIT";
  }
  if (message.includes("FORCE_SELL")) return "FINAL";
  if (decision.category === TRADE_MESSAGE.sell.SL) return "STOP_LOSS";
  if (decision.category === TRADE_MESSAGE.sell.TP) return "TAKE_PROFIT";
  return "UNKNOWN";
}

/** Builds the exposure and averaging state that existed at one replay time. */
function positionAt(params: {
  exitPrice: number;
  lots: ReplayLot[];
  oneSideFeeRatio: number;
  position: Position;
  t: number;
}): { metrics: PositionMetrics; position: Position } {
  const metrics = calculateMetrics(params);
  return {
    metrics,
    position: {
      ...params.position,
      exposure: {
        averageEntryPrice: metrics.averageEntryPrice,
        leverage: params.position.exposure.leverage,
        marginUsdt: metrics.marginUsdt,
        notionalUsdt: metrics.notionalUsdt,
        quantity: metrics.quantity,
      },
      strategy: {
        ...params.position.strategy,
        averaging: {
          ...params.position.strategy.averaging,
          executions: (params.position.strategy.averaging.executions ?? [])
            .filter((execution) => execution.t <= params.t),
        },
      },
    },
  };
}

function exitFromDecision(params: {
  decision: BacktestExitDecision;
  metrics: PositionMetrics;
  t: number;
}): ReplayExit {
  const reason = resolveDecisionReason(params.decision);
  const isLiquidated = reason === "LIQUIDATED";
  return {
    pnlPct: isLiquidated ? -100 : params.metrics.pnlPct,
    pnlUsdt: isLiquidated
      ? -params.metrics.marginUsdt
      : params.metrics.pnlUsdt,
    price: params.decision.exitPrice,
    reason,
    t: params.t,
  };
}

function shouldAverageAtPoint(params: {
  entryLevel: number;
  maxNextLevels: number;
  point: VolatilityPoint;
  position: Position;
}): boolean {
  if (!isActionableAveragingVolatilityLevel(params.point)) return false;
  const distance = Math.abs(params.point.lvl - params.entryLevel);
  if (distance > params.maxNextLevels) return false;
  return params.position.direction === "LONG"
    ? params.point.l === "B" && params.point.lvl < params.entryLevel
    : params.point.l === "T" && params.point.lvl > params.entryLevel;
}

function applyAveraging(params: {
  executablePrice: number;
  lots: ReplayLot[];
  point: VolatilityPoint;
  position: Position;
  quoteAsset: number;
  reservedQuoteAsset: number;
  t: number;
  tradingConfig: DynamicTradeConfig;
}): { quoteAsset: number; reservedQuoteAsset: number } {
  const step = getNextWatchStep({
    averaging: params.position.strategy.averaging,
    includeUnreserved: true,
  });
  const reachesStep = step && (
    params.position.direction === "LONG"
      ? params.point.lvl <= step.level
      : params.point.lvl >= step.level
  );
  if (!step || !reachesStep) {
    return {
      quoteAsset: params.quoteAsset,
      reservedQuoteAsset: params.reservedQuoteAsset,
    };
  }

  const projection = resolveAveragingRescueProjection({
    adaptiveAveraging: params.tradingConfig.adaptiveAveraging,
    executablePrice: params.executablePrice,
    position: params.position,
    quoteAsset: params.quoteAsset,
    rescueAnchorPrice: params.point.p,
    rescueProjectionGuardEnabled:
      params.tradingConfig.averagingRescueProjectionGuardEnabled !== false,
    reservedQuoteAsset: params.reservedQuoteAsset,
    step,
    triggerVolatilityPct: params.point.pct,
  });
  if (!projection.canExecute) {
    return {
      quoteAsset: params.quoteAsset,
      reservedQuoteAsset: params.reservedQuoteAsset,
    };
  }

  const reservedBefore = getReservedRemainingUsdt(
    params.position.strategy.averaging,
  );
  const execution = {
    adaptiveMultiplier:
      params.tradingConfig.adaptiveAveraging?.enabled === true
        ? projection.multiplier
        : undefined,
    allocationPct: projection.multiplier,
    level: step.level,
    marginUsdt: projection.marginUsdt,
    price: params.executablePrice,
    projectedProfitPct:
      params.tradingConfig.adaptiveAveraging?.enabled === true
        ? projection.projectedProfitPct
        : undefined,
    reservedMarginUsdt: step.marginUsdt,
    t: params.t,
  };
  params.position.strategy.averaging.executions ??= [];
  params.position.strategy.averaging.executions.push(execution);
  params.lots.push({
    level: step.level,
    marginUsdt: projection.marginUsdt,
    multiplier: projection.multiplier,
    price: params.executablePrice,
    t: params.t,
  });
  markReservedWatchStepUsed({
    averaging: params.position.strategy.averaging,
    executedPrice: params.executablePrice,
    handledLevel: step.level,
    usedAt: params.t,
    usedMarginUsdt: projection.marginUsdt,
    usedPctAlloc: projection.multiplier,
  });
  const reservedAfter = getReservedRemainingUsdt(
    params.position.strategy.averaging,
  );
  const metrics = calculateMetrics({
    exitPrice: params.executablePrice,
    lots: params.lots,
    oneSideFeeRatio: 0,
    position: params.position,
    t: params.t,
  });
  params.position.exposure = {
    averageEntryPrice: metrics.averageEntryPrice,
    leverage: params.position.exposure.leverage,
    marginUsdt: metrics.marginUsdt,
    notionalUsdt: metrics.notionalUsdt,
    quantity: metrics.quantity,
  };

  return {
    quoteAsset: Math.max(0, params.quoteAsset - projection.marginUsdt),
    reservedQuoteAsset: Math.max(
      0,
      params.reservedQuoteAsset - Math.max(0, reservedBefore - reservedAfter),
    ),
  };
}

/** Seeds a live-like position from only its level-one entry signal. */
function seedPosition(params: {
  candles: UnifiedKline[];
  oneSideFeeRatio: number;
  position: Position;
  confirmationTById: Record<string, number>;
  tradingConfig: DynamicTradeConfig;
}): { lots: ReplayLot[]; position: Position } | null {
  const marginUsdt = initialMarginUsdt(params.position);
  const entrySignalT = params.confirmationTById[params.position.opened.vPoint.id]
    ?? params.position.opened.t;
  const execution = priceAtOrBefore(params.candles, entrySignalT);
  const entryPrice = execution?.price ?? params.position.opened.price;
  const entryT = execution?.t ?? entrySignalT;
  const leverage = Math.max(1, Number(params.position.exposure.leverage) || 1);
  if (!(marginUsdt > 0) || !(entryPrice > 0)) return null;
  const averaging = params.tradingConfig.enableWatchLogic === false
    ? buildSlowWatchReserveState({
        baseMarginUsdt: marginUsdt,
        direction: params.position.direction,
        entryLevel: params.position.opened.vPoint.lvl,
        maxNextLevels: 0,
        reserveLevels: 0,
      })
    : buildSlowWatchReserveState({
        baseMarginUsdt: marginUsdt,
        direction: params.position.direction,
        entryLevel: params.position.opened.vPoint.lvl,
        maxNextLevels:
          params.tradingConfig.watchMaxNextAveragingLevels
          ?? params.tradingConfig.watchReserveLevels
          ?? 2,
        pctAlloc: params.tradingConfig.watchReservePctAlloc ?? 2,
        reserveLevels: params.tradingConfig.watchReserveLevels ?? 2,
      });
  const position: Position = {
    ...params.position,
    closed: undefined,
    exposure: {
      averageEntryPrice: entryPrice,
      leverage,
      marginUsdt,
      notionalUsdt: marginUsdt * leverage,
      quantity: (marginUsdt * leverage) / entryPrice,
    },
    fees: {
      entryUsdt: marginUsdt * params.oneSideFeeRatio,
      estimatedExitUsdt: marginUsdt * params.oneSideFeeRatio,
    },
    opened: { ...params.position.opened, price: entryPrice, t: entryT },
    pnl: {},
    strategy: {
      ...params.position.strategy,
      averaging,
    },
  };
  return {
    lots: [{
      level: position.opened.vPoint.lvl,
      marginUsdt,
      multiplier: 1,
      price: entryPrice,
      t: entryT,
    }],
    position,
  };
}

/**
 * Replays one position from its L1 execution through every closed minute. A
 * vPoint may act only at its real 5m confirmation time, while its pivot price
 * remains the rescue anchor. Existing exits and liquidation run before adds.
 *
 * BTEST:BLACK_SWAN_LIVE_LIKE_AVERAGING
 */
function replayPosition(params: {
  candles: UnifiedKline[];
  config: BlackSwanConfig;
  confirmationTById: Record<string, number>;
  crisisT?: number;
  monitoringConfig?: {
    negativePnlThresholdPct?: number;
    positivePnlThresholdPct?: number;
    takeProfitOffsetPct?: number;
  };
  oneSideFeeRatio: number;
  position: Position;
  protectionEnabled: boolean;
  replayEndT: number;
  signal?: AbortSignal;
  startingBalanceUsdt: number;
  tradingConfig: DynamicTradeConfig;
  tradingMode: Position["tradingMode"];
  vPoints: VolatilityPoint[];
}): ReplayOutcome | null {
  const seed = seedPosition(params);
  if (!seed) return null;
  const { lots, position } = seed;
  const guardLabel = position.direction === "SHORT" ? "B" : "T";
  const orderedVPoints = params.vPoints
    .map((point) => ({
      confirmedT: params.confirmationTById[point.id] ?? point.t,
      point,
    }))
    .filter(({ confirmedT }) => confirmedT >= position.opened.t)
    .sort((left, right) => left.confirmedT - right.confirmedT);
  let vPointIndex = 0;
  let hasHitTargetZone = false;
  let lastVolatilityPrice: number | undefined;
  let latestConfirmedPoint: VolatilityPoint | undefined;
  let quoteAsset = Math.max(
    position.exposure.marginUsdt,
    params.startingBalanceUsdt - position.exposure.marginUsdt,
  );
  let reservedQuoteAsset = getReservedRemainingUsdt(
    position.strategy.averaging,
  );
  const maxNextLevels = params.tradingConfig.enableWatchLogic === false
    ? 0
    : Math.max(
        0,
        params.tradingConfig.watchMaxNextAveragingLevels
          ?? params.tradingConfig.watchReserveLevels
          ?? 2,
      );
  const shouldCrisisClose = params.protectionEnabled
    && params.crisisT !== undefined
    && blackSwan.emergency.shouldClose({
      direction: position.direction,
      exitPolicy: params.config.exitPolicy,
      tradingMode: params.tradingMode,
    });

  const finish = (exit: ReplayExit): ReplayOutcome => {
    const snapshot = positionAt({
      exitPrice: exit.price,
      lots,
      oneSideFeeRatio: params.oneSideFeeRatio,
      position,
      t: exit.t,
    });
    snapshot.position.pnl = {
      ...snapshot.position.pnl,
      currentValueUsdt: snapshot.metrics.notionalUsdt + exit.pnlUsdt,
      markPrice: exit.price,
      netPct: exit.pnlPct,
      netUsdt: exit.pnlUsdt,
    };
    const confirmedVPoints = orderedVPoints
      .slice(0, vPointIndex)
      .map(({ point }) => point);
    const speedupReasons = slowTradingStages.position.getSpeedupReasons({
      latestVolatilityPoint: confirmedVPoints.at(-1),
      negativePnlThresholdPct:
        params.monitoringConfig?.negativePnlThresholdPct,
      positivePnlThresholdPct:
        params.monitoringConfig?.positivePnlThresholdPct,
      position: snapshot.position,
      takeProfitOffsetPct: params.monitoringConfig?.takeProfitOffsetPct,
      takeProfitPercent: params.tradingConfig.modelConfig.takeProfitPercent,
      useStopLossPlus: params.tradingConfig.modelConfig.useStopLossPlus,
      volatilityPoints: confirmedVPoints,
    });
    const monitoringStageAtExit =
      speedupReasons.length > 0 ? "speedup" : "standard";

    return {
      exit,
      lots,
      monitoringReasonAtExit:
        speedupReasons.length > 0
          ? slowTradingStages.position.describeSpeedupReasons(speedupReasons)
          : slowTradingStages.position.describeStandardReason({
              negativePnlThresholdPct:
                params.monitoringConfig?.negativePnlThresholdPct,
              positivePnlThresholdPct:
                params.monitoringConfig?.positivePnlThresholdPct,
              position: snapshot.position,
            }),
      monitoringStageAtExit,
      position,
    };
  };

  for (let candleIndex = 0; candleIndex < params.candles.length; candleIndex += 1) {
    if (candleIndex % 100 === 0) params.signal?.throwIfAborted();
    const candle = params.candles[candleIndex];
    const t = candleCloseT(candle);
    if (t < position.opened.t) continue;
    if (t > params.replayEndT) break;

    while (
      vPointIndex < orderedVPoints.length &&
      orderedVPoints[vPointIndex].confirmedT <= t
    ) {
      const point = orderedVPoints[vPointIndex].point;
      hasHitTargetZone ||= point.l === guardLabel;
      lastVolatilityPrice = point.p;
      latestConfirmedPoint = point;
      vPointIndex += 1;
    }

    const adversePrice = Number(
      params.position.direction === "SHORT" ? candle[2] : candle[3],
    );
    const closePrice = Number(candle[4]);
    const prices = Array.from(new Set([adversePrice, closePrice]));
    for (const currentPrice of prices) {
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) continue;
      const snapshot = positionAt({
        exitPrice: currentPrice,
        lots,
        oneSideFeeRatio: params.oneSideFeeRatio,
        position,
        t,
      });
      if (snapshot.metrics.quantity <= 0) continue;
      const decision = resolveBacktestExitDecision({
        currentPrice,
        forceSell: false,
        globalLiquidation: false,
        hasHitTargetZone,
        lastVolatilityPrice,
        modelConfig: params.tradingConfig.modelConfig,
        position: snapshot.position,
      });
      if (!decision.shouldExit) continue;

      const exitSnapshot = positionAt({
        exitPrice: decision.exitPrice,
        lots,
        oneSideFeeRatio: params.oneSideFeeRatio,
        position,
        t,
      });
      return finish(exitFromDecision({
        decision,
        metrics: exitSnapshot.metrics,
        t,
      }));
    }

    if (shouldCrisisClose && t >= params.crisisT!) {
      const price = Number(candle[4]);
      const metrics = calculateMetrics({
        exitPrice: price,
        lots,
        oneSideFeeRatio: params.oneSideFeeRatio,
        position,
        t,
      });
      return finish({
        pnlPct: metrics.pnlPct,
        pnlUsdt: metrics.pnlUsdt,
        price,
        reason: "BLACK_SWAN_CRISIS",
        t,
      });
    }

    if (
      !hasHitTargetZone &&
      maxNextLevels > 0 &&
      latestConfirmedPoint &&
      shouldAverageAtPoint({
        entryLevel: position.opened.vPoint.lvl,
        maxNextLevels,
        point: latestConfirmedPoint,
        position,
      })
    ) {
      const executablePrice = Number(candle[4]);
      const balance = applyAveraging({
        executablePrice,
        lots,
        point: latestConfirmedPoint,
        position,
        quoteAsset,
        reservedQuoteAsset,
        t,
        tradingConfig: params.tradingConfig,
      });
      quoteAsset = balance.quoteAsset;
      reservedQuoteAsset = balance.reservedQuoteAsset;
    }
  }

  const finalPrice = priceAtOrBefore(params.candles, params.replayEndT)
    ?? { price: position.opened.price, t: params.replayEndT };
  const snapshot = positionAt({
    exitPrice: finalPrice.price,
    lots,
    oneSideFeeRatio: params.oneSideFeeRatio,
    position,
    t: finalPrice.t,
  });
  const decision = resolveBacktestExitDecision({
    currentPrice: finalPrice.price,
    forceSell: true,
    globalLiquidation: false,
    hasHitTargetZone,
    lastVolatilityPrice,
    modelConfig: params.tradingConfig.modelConfig,
    position: snapshot.position,
  });
  return finish(exitFromDecision({
    decision,
    metrics: snapshot.metrics,
    t: finalPrice.t,
  }));
}

function findPointIndex(
  points: VolatilityPoint[],
  ref: { id?: string; t: number },
): number {
  const byId = ref.id
    ? points.findIndex((point) => point.id === ref.id)
    : -1;
  if (byId >= 0) return byId;
  const atOrAfter = points.findIndex((point) => point.t >= ref.t);
  return atOrAfter >= 0 ? atOrAfter : Math.max(0, points.length - 1);
}

function compactVPoint(
  point: VolatilityPoint,
  confirmationTById: Record<string, number>,
): BlackSwanSavingsVPoint {
  return {
    ...(confirmationTById[point.id] && {
      confirmedT: confirmationTById[point.id],
    }),
    id: point.id,
    l: point.l,
    lvl: point.lvl,
    p: point.p,
    ...(Number.isFinite(Number(point.pct)) && { pct: Number(point.pct) }),
    t: point.t,
  };
}

/** Selects five real vPoints around the entry and normal exit boundaries. */
function buildFocusedVPoints(
  position: Position,
  points: VolatilityPoint[],
  exit: ReplayExit,
  protectionT: number,
  confirmationTById: Record<string, number>,
): BlackSwanSavingsVPoint[] {
  if (points.length === 0) return [];
  const entryIndex = findPointIndex(points, {
    id: position.opened.vPoint.id,
    t: position.opened.t,
  });
  const exitIndex = findPointIndex(points, {
    id:
      exit.t === position.closed?.t ? position.closed?.vPoint?.id : undefined,
    t: Math.max(exit.t, protectionT),
  });
  return points
    .slice(
      Math.max(0, entryIndex - SURROUNDING_VPOINT_COUNT),
      Math.min(points.length, exitIndex + SURROUNDING_VPOINT_COUNT + 1),
    )
    .map((point) => compactVPoint(point, confirmationTById));
}

function positionPnlAt(params: {
  candles: UnifiedKline[];
  exit: ReplayExit;
  lots: ReplayLot[];
  oneSideFeeRatio: number;
  position: Position;
  t: number;
}): number {
  if (params.t >= params.exit.t) return params.exit.pnlUsdt;
  const current = priceAtOrBefore(params.candles, params.t);
  if (!current || current.t < params.position.opened.t) return 0;
  return calculateMetrics({
    exitPrice: current.price,
    lots: params.lots,
    oneSideFeeRatio: params.oneSideFeeRatio,
    position: params.position,
    t: current.t,
  }).pnlUsdt;
}

/**
 * Uses standard backtest L1 entries as candidate signals, then independently
 * replays live-like executions from raw one-minute candles. Confirmed vPoints
 * trigger averaging only at their later detector-confirmation time and at the
 * then-executable price.
 *
 * BTEST:BLACK_SWAN_SAVINGS_PREVIEW
 */
function simulate(params: {
  candleMap: Record<string, UnifiedKline[]>;
  config: BlackSwanConfig;
  confirmationTBySymbol: Record<string, Record<string, number>>;
  detectorResult: BlackSwanBacktestResult;
  incidentT: number;
  monitoringConfig?: {
    negativePnlThresholdPct?: number;
    positivePnlThresholdPct?: number;
    takeProfitOffsetPct?: number;
  };
  oneSideFeeRatio?: number;
  positions: Position[];
  replayEndT: number;
  signal?: AbortSignal;
  startingBalanceUsdt: number;
  tradingConfig: DynamicTradeConfig;
  tradingMode: Position["tradingMode"];
  volatilityMap: Record<string, VolatilityPoint[]>;
  vPointGenerationEndT: number;
  vPointGenerationStartT: number;
}): BlackSwanSavingsBacktestResult {
  params.signal?.throwIfAborted();
  const oneSideFeeRatio = Math.max(
    0,
    params.oneSideFeeRatio ?? BACKTEST_ONE_SIDE_FEE_RATIO,
  );
  const crisisT = params.detectorResult.transitions.find(
    (transition) => transition.to === "CRISIS",
  )?.t;
  const protectionT = crisisT ?? params.incidentT;
  const replayPositions = params.positions.flatMap(
    (position): ReplayPosition[] => {
      const commonReplay = {
        candles: params.candleMap[position.symbol] ?? [],
        config: params.config,
        confirmationTById:
          params.confirmationTBySymbol[position.symbol] ?? {},
        crisisT,
        monitoringConfig: params.monitoringConfig,
        oneSideFeeRatio,
        position,
        replayEndT: params.replayEndT,
        signal: params.signal,
        startingBalanceUsdt: params.startingBalanceUsdt,
        tradingConfig: params.tradingConfig,
        tradingMode: params.tradingMode,
        vPoints: params.volatilityMap[position.symbol] ?? [],
      } as const;
      const normal = replayPosition({
        ...commonReplay,
        protectionEnabled: false,
      });
      const protectedResult = replayPosition({
        ...commonReplay,
        protectionEnabled: true,
      });
      if (!normal || !protectedResult) return [];
      return [{ baseline: position, normal, protected: protectedResult }];
    },
  );

  const points: BlackSwanSavingsBacktestPoint[] =
    params.detectorResult.points.map((point) => ({
      ...point,
      protectedPnlUsdt: roundUsdt(
        replayPositions.reduce(
          (sum, replay) =>
            sum +
            positionPnlAt({
              candles: params.candleMap[replay.baseline.symbol] ?? [],
              exit: replay.protected.exit,
              lots: replay.protected.lots,
              oneSideFeeRatio,
              position: replay.protected.position,
              t: point.t,
            }),
          0,
        ),
      ),
      unprotectedPnlUsdt: roundUsdt(
        replayPositions.reduce(
          (sum, replay) =>
            sum +
            positionPnlAt({
              candles: params.candleMap[replay.baseline.symbol] ?? [],
              exit: replay.normal.exit,
              lots: replay.normal.lots,
              oneSideFeeRatio,
              position: replay.normal.position,
              t: point.t,
            }),
          0,
        ),
      ),
    }));

  const positionResults = replayPositions.flatMap(
    (replay): BlackSwanSavingsPositionResult[] => {
      params.signal?.throwIfAborted();
      const position = replay.baseline;
      const normalExit = replay.normal.exit;
      const protectedExit = replay.protected.exit;
      const incidentMetrics = calculateMetrics({
        exitPrice: protectedExit.price,
        lots: replay.protected.lots,
        oneSideFeeRatio,
        position: replay.protected.position,
        t: protectedExit.t,
      });
      const vPoints = buildFocusedVPoints(
        position,
        params.volatilityMap[position.symbol] ?? [],
        protectedExit,
        protectionT,
        params.confirmationTBySymbol[position.symbol] ?? {},
      );
      const displayStartT = vPoints[0]?.t ?? replay.protected.position.opened.t;
      const displayEndT =
        vPoints.at(-1)?.t ?? protectedExit.t;

      return [
        {
          averageEntryPrice: incidentMetrics.averageEntryPrice,
          averagingExecutions: (
            replay.protected.position.strategy.averaging.executions ?? []
          )
            .filter((execution) => execution.t <= protectedExit.t)
            .map((execution) => ({
              level: execution.level,
              marginUsdt: execution.marginUsdt,
              multiplier: Math.max(
                1,
                Number(
                  execution.adaptiveMultiplier ?? execution.allocationPct,
                ) || 1,
              ),
              price: execution.price,
              t: execution.t,
            })),
          direction: position.direction,
          displayEndT,
          displayStartT,
          entryLevel: position.opened.vPoint.lvl,
          entryPrice: replay.protected.position.opened.price,
          entryT: replay.protected.position.opened.t,
          monitoringReasonAtExit: replay.protected.monitoringReasonAtExit,
          monitoringStageAtExit: replay.protected.monitoringStageAtExit,
          protectedExitReason: protectedExit.reason,
          protectedExitPrice: protectedExit.price,
          protectedExitT: protectedExit.t,
          protectedPnlPct: roundPct(protectedExit.pnlPct),
          protectedPnlUsdt: roundUsdt(protectedExit.pnlUsdt),
          symbol: position.symbol,
          totalMarginUsdt: roundUsdt(incidentMetrics.marginUsdt),
          totalNotionalUsdt: roundUsdt(incidentMetrics.notionalUsdt),
          unprotectedExitReason: normalExit.reason,
          unprotectedExitPrice: normalExit.price,
          unprotectedExitT: normalExit.t,
          unprotectedPnlPct: roundPct(normalExit.pnlPct),
          unprotectedPnlUsdt: roundUsdt(normalExit.pnlUsdt),
          vPoints,
        },
      ];
    },
  );
  const protectedPnlUsdt = positionResults.reduce(
    (sum, position) => sum + position.protectedPnlUsdt,
    0,
  );
  const unprotectedPnlUsdt = positionResults.reduce(
    (sum, position) => sum + position.unprotectedPnlUsdt,
    0,
  );
  const protectedLossUsdt = Math.max(0, -protectedPnlUsdt);
  const unprotectedLossUsdt = Math.max(0, -unprotectedPnlUsdt);
  const savedUsdt = protectedPnlUsdt - unprotectedPnlUsdt;

  return {
    ...params.detectorResult,
    entryT: Math.min(
      params.incidentT,
      ...positionResults.map((position) => position.entryT),
    ),
    incidentT: params.incidentT,
    klinesBySymbol: {},
    points,
    positions: positionResults,
    vPointGenerationEndT: params.vPointGenerationEndT,
    vPointGenerationStartT: params.vPointGenerationStartT,
    summary: {
      ...params.detectorResult.summary,
      emergencyClosedPositions: positionResults.filter(
        (position) => position.protectedExitReason === "BLACK_SWAN_CRISIS",
      ).length,
      generatedVPointCount: Object.values(params.volatilityMap).reduce(
        (sum, vPoints) => sum + vPoints.length,
        0,
      ),
      positionCount: positionResults.length,
      protectedLossUsdt: roundUsdt(protectedLossUsdt),
      protectedPnlUsdt: roundUsdt(protectedPnlUsdt),
      savedPct:
        Math.abs(unprotectedPnlUsdt) > 0
          ? (savedUsdt / Math.abs(unprotectedPnlUsdt)) * 100
          : 0,
      savedUsdt: roundUsdt(savedUsdt),
      totalMarginUsdt: roundUsdt(
        positionResults.reduce(
          (sum, position) => sum + position.totalMarginUsdt,
          0,
        ),
      ),
      totalNotionalUsdt: roundUsdt(
        positionResults.reduce(
          (sum, position) => sum + position.totalNotionalUsdt,
          0,
        ),
      ),
      unprotectedLossUsdt: roundUsdt(unprotectedLossUsdt),
      unprotectedPnlUsdt: roundUsdt(unprotectedPnlUsdt),
    },
  };
}

const blackSwanPortfolioReplay = { simulate } as const;

export default blackSwanPortfolioReplay;
