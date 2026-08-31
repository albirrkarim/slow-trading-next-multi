import { TRADE_MESSAGE } from "@/lib/trading/message";
import type { Position, TradingModelConfig } from "@/lib/trading/models";
import postAverageRescue from "@/lib/trading/post-average-rescue";
import postAverageStopLoss from "@/lib/trading/post-average-stop-loss";
import volatilityTargetStopLoss from "@/lib/trading/volatility-target-stop-loss";
import {
  BACKTEST_ONE_SIDE_FEE_RATIO,
  BACKTEST_ROUND_TRIP_FEE_PERCENT,
} from "./constants";

const LIQUIDATION_LEVERAGED_PNL_PERCENT = -80;

export interface BacktestExitDecision {
  shouldExit: boolean;
  category?: string;
  exitPrice: number;
  netProfitPercent: number;
  message?: string;
}

interface ResolveBacktestExitDecisionProps {
  position: Position;
  currentPrice: number;
  forceSell: boolean;
  globalLiquidation: boolean;
  hasHitTargetZone?: boolean;
  lastVolatilityPrice?: number;
  modelConfig: TradingModelConfig;
  exitFeeRatio?: number;
}

export function calculateBacktestNetProfitPercent(
  position: Position,
  price: number,
) {
  const isShort = position.direction === "SHORT";

  return isShort
    ? ((position.exposure.averageEntryPrice - price) /
        position.exposure.averageEntryPrice) *
        100
    : ((price - position.exposure.averageEntryPrice) /
        position.exposure.averageEntryPrice) *
        100;
}

export function calculateBacktestLeveragedNetProfitPercent(
  position: Position,
  price: number,
) {
  const leverage = position.exposure.leverage ?? 1;
  return calculateBacktestNetProfitPercent(position, price) * leverage;
}

export function calculateBacktestNetProfitUSDT(
  position: Position,
  price: number,
) {
  if (position.direction === "SHORT") {
    return (
      (position.exposure.averageEntryPrice - price) * position.exposure.quantity
    );
  }

  return (
    (price - position.exposure.averageEntryPrice) * position.exposure.quantity
  );
}

/** Calculates current backtest USDT PnL after entry and estimated exit fees. */
export function calculateBacktestFeeAdjustedNetProfitUSDT(
  position: Position,
  price: number,
  exitFeeRatio?: number,
) {
  const grossProfitUSDT = calculateBacktestNetProfitUSDT(position, price);
  const entryNotionalUsdt = position.exposure.notionalUsdt ?? 0;

  if (!Number.isFinite(exitFeeRatio)) {
    return (
      grossProfitUSDT -
      entryNotionalUsdt * (BACKTEST_ROUND_TRIP_FEE_PERCENT / 100)
    );
  }

  const entryFeeUSDT = Number.isFinite(position.fees.entryUsdt)
    ? Math.max(0, position.fees.entryUsdt)
    : entryNotionalUsdt * BACKTEST_ONE_SIDE_FEE_RATIO;
  const exitFeeUSDT =
    position.exposure.quantity * price * Math.max(0, exitFeeRatio ?? 0);

  return grossProfitUSDT - entryFeeUSDT - exitFeeUSDT;
}

type BacktestRailLossBoundary = {
  category: string;
  exitPrice: number;
  message: string;
  netProfitPercent: number;
  priority: number;
  targetNetPnlUsdt: number;
};

/** Solves the price whose fee-adjusted net PnL equals an exact USDT boundary. */
export function resolveBacktestFeeAdjustedExitPrice({
  exitFeeRatio,
  position,
  targetNetPnlUsdt,
}: {
  exitFeeRatio?: number;
  position: Position;
  targetNetPnlUsdt: number;
}) {
  const averageEntryPrice = position.exposure.averageEntryPrice;
  const entryNotionalUsdt = position.exposure.notionalUsdt ?? 0;
  const quantity = position.exposure.quantity;
  if (
    !Number.isFinite(averageEntryPrice) ||
    averageEntryPrice <= 0 ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return averageEntryPrice;
  }

  if (!Number.isFinite(exitFeeRatio)) {
    const fixedFeeUsdt =
      entryNotionalUsdt * (BACKTEST_ROUND_TRIP_FEE_PERCENT / 100);
    const grossProfitUsdt = targetNetPnlUsdt + fixedFeeUsdt;
    return position.direction === "SHORT"
      ? averageEntryPrice - grossProfitUsdt / quantity
      : averageEntryPrice + grossProfitUsdt / quantity;
  }

  const entryFeeUsdt = Number.isFinite(position.fees.entryUsdt)
    ? Math.max(0, position.fees.entryUsdt)
    : entryNotionalUsdt * BACKTEST_ONE_SIDE_FEE_RATIO;
  const normalizedExitFeeRatio = Math.max(0, exitFeeRatio ?? 0);
  if (position.direction === "SHORT") {
    return (
      (quantity * averageEntryPrice - entryFeeUsdt - targetNetPnlUsdt) /
      (quantity * (1 + normalizedExitFeeRatio))
    );
  }

  return (
    (targetNetPnlUsdt + quantity * averageEntryPrice + entryFeeUsdt) /
    (quantity * (1 - normalizedExitFeeRatio))
  );
}

/** Selects the smallest active loss already crossed by the current vPoint rail. */
function selectFirstReachedRailLossBoundary(
  boundaries: BacktestRailLossBoundary[],
) {
  return boundaries.slice().sort((left, right) => {
    const lossDifference =
      Math.abs(left.targetNetPnlUsdt) - Math.abs(right.targetNetPnlUsdt);
    return lossDifference || left.priority - right.priority;
  })[0];
}

export function resolveBacktestExitDecision({
  position,
  currentPrice,
  forceSell,
  globalLiquidation,
  hasHitTargetZone = false,
  lastVolatilityPrice,
  modelConfig,
  exitFeeRatio,
}: ResolveBacktestExitDecisionProps): BacktestExitDecision {
  const netProfitPercent = calculateBacktestNetProfitPercent(
    position,
    currentPrice,
  );
  const leveragedNetProfitPercent = calculateBacktestLeveragedNetProfitPercent(
    position,
    currentPrice,
  );
  const entryNotionalUsdt = position.exposure.notionalUsdt ?? 0;
  const feeAdjustedNetProfitUSDT =
    calculateBacktestFeeAdjustedNetProfitUSDT(
      position,
      currentPrice,
      exitFeeRatio,
    );
  const feeAdjustedNetProfitPercent =
    entryNotionalUsdt > 0
      ? (feeAdjustedNetProfitUSDT / entryNotionalUsdt) * 100
      : netProfitPercent - BACKTEST_ROUND_TRIP_FEE_PERCENT;

  if (forceSell) {
    return {
      shouldExit: true,
      exitPrice: currentPrice,
      netProfitPercent,
      message: position.control?.forceExit?.reason ?? "FORCE_SELL",
    };
  }

  const lossBoundaries: BacktestRailLossBoundary[] = [];
  const configuredStopLossUSDT = Number(modelConfig.stopLossUSDT ?? 50);
  const stopLossUSDT =
    Number.isFinite(configuredStopLossUSDT) && configuredStopLossUSDT > 0
      ? configuredStopLossUSDT
      : 0;

  // BOTH:STOP_LOSS_BY_USDT_LOSS
  if (stopLossUSDT > 0 && feeAdjustedNetProfitUSDT <= -stopLossUSDT) {
    const targetNetPnlUsdt = -stopLossUSDT;
    lossBoundaries.push({
      category: TRADE_MESSAGE.sell.SL,
      exitPrice: resolveBacktestFeeAdjustedExitPrice({
        exitFeeRatio,
        position,
        targetNetPnlUsdt,
      }),
      message:
        "BOTH:STOP_LOSS_BY_USDT_LOSS" +
        ` | railNetPnlUsdt:${feeAdjustedNetProfitUSDT.toFixed(2)}` +
        ` | backthinkNetPnlUsdt:${targetNetPnlUsdt.toFixed(2)}`,
      netProfitPercent:
        entryNotionalUsdt > 0
          ? (targetNetPnlUsdt / entryNotionalUsdt) * 100
          : feeAdjustedNetProfitPercent,
      priority: 1,
      targetNetPnlUsdt,
    });
  }

  const hardStopLossPercent = modelConfig.stopLossPercent ?? 0;
  // BOTH:TRADITIONAL_TP_SL
  if (
    hardStopLossPercent > 0 &&
    hardStopLossPercent < 100 &&
    netProfitPercent <= -hardStopLossPercent
  ) {
    const exitPrice = getHardStopLossExitPrice(position, hardStopLossPercent);
    lossBoundaries.push({
      category: TRADE_MESSAGE.sell.SL,
      exitPrice,
      netProfitPercent: -hardStopLossPercent,
      message: "BOTH:TRADITIONAL_TP_SL",
      priority: 2,
      targetNetPnlUsdt: calculateBacktestFeeAdjustedNetProfitUSDT(
        position,
        exitPrice,
        exitFeeRatio,
      ),
    });
  }

  const targetZoneStopLossPercent = Number(
    modelConfig.volatilityTargetStopLossPercent,
  );
  // BOTH:VOLATILITY_TARGET_SL_VALUE
  if (
    volatilityTargetStopLoss.shouldExit({
      feeAdjustedNetProfitPercent,
      hasHitTargetZone,
      stopLossPercent: targetZoneStopLossPercent,
    })
  ) {
    const targetNetPnlUsdt =
      entryNotionalUsdt * (-targetZoneStopLossPercent / 100);
    lossBoundaries.push({
      category: TRADE_MESSAGE.sell.SL,
      exitPrice: resolveBacktestFeeAdjustedExitPrice({
        exitFeeRatio,
        position,
        targetNetPnlUsdt,
      }),
      netProfitPercent: -targetZoneStopLossPercent,
      message:
        "BOTH:VOLATILITY_TARGET_SL_VALUE" +
        ` | railNetPnlUsdt:${feeAdjustedNetProfitUSDT.toFixed(2)}` +
        ` | backthinkNetPnlUsdt:${targetNetPnlUsdt.toFixed(2)}`,
      priority: 3,
      targetNetPnlUsdt,
    });
  }

  const postAverageLoss = postAverageStopLoss.evaluate({
    config: modelConfig.postAverageStopLoss,
    netPnlPercent: feeAdjustedNetProfitPercent,
    netPnlUsdt: feeAdjustedNetProfitUSDT,
    position,
  });
  const postAverageThreshold = postAverageLoss.threshold;
  const postAverageCandidates = [
    postAverageLoss.hitPercent && postAverageThreshold
      ? {
          boundary: "pct",
          targetNetPnlUsdt:
            entryNotionalUsdt * (postAverageThreshold.maxNetPnlPct / 100),
        }
      : undefined,
    postAverageLoss.hitUsdt && postAverageThreshold
      ? {
          boundary: "usdt",
          targetNetPnlUsdt: postAverageThreshold.maxNetPnlUsdt,
        }
      : undefined,
  ].filter(
    (
      candidate,
    ): candidate is { boundary: string; targetNetPnlUsdt: number } =>
      Boolean(candidate),
  );
  const firstPostAverageCandidate = postAverageCandidates.sort(
    (left, right) =>
      Math.abs(left.targetNetPnlUsdt) - Math.abs(right.targetNetPnlUsdt),
  )[0];

  // BOTH:POST_AVERAGE_STOP_LOSS
  if (postAverageThreshold && firstPostAverageCandidate) {
    const { boundary, targetNetPnlUsdt } = firstPostAverageCandidate;
    lossBoundaries.push({
      category: TRADE_MESSAGE.sell.POST_AVERAGE_STOP_LOSS,
      exitPrice: resolveBacktestFeeAdjustedExitPrice({
        exitFeeRatio,
        position,
        targetNetPnlUsdt,
      }),
      message:
        "BOTH:POST_AVERAGE_STOP_LOSS" +
        ` | averages:${postAverageLoss.completedAveragingCount}` +
        ` | boundary:${boundary}` +
        ` | railNetPnlPct:${feeAdjustedNetProfitPercent.toFixed(2)}%` +
        ` | railNetPnlUsdt:${feeAdjustedNetProfitUSDT.toFixed(2)}` +
        ` | backthinkNetPnlUsdt:${targetNetPnlUsdt.toFixed(2)}`,
      netProfitPercent:
        entryNotionalUsdt > 0
          ? (targetNetPnlUsdt / entryNotionalUsdt) * 100
          : feeAdjustedNetProfitPercent,
      priority: 4,
      targetNetPnlUsdt,
    });
  }

  const isolatedLiquidationTriggered =
    leveragedNetProfitPercent <= LIQUIDATION_LEVERAGED_PNL_PERCENT;
  if (isolatedLiquidationTriggered) {
    const leverage = Math.max(1, position.exposure.leverage ?? 1);
    const exitPrice = getHardStopLossExitPrice(
      position,
      Math.abs(LIQUIDATION_LEVERAGED_PNL_PERCENT) / leverage,
    );
    lossBoundaries.push({
      category: TRADE_MESSAGE.sell.LIQUIDATED_ISOLATED,
      exitPrice,
      message: TRADE_MESSAGE.sell.LIQUIDATED_ISOLATED,
      netProfitPercent: -100,
      priority: 5,
      targetNetPnlUsdt: calculateBacktestFeeAdjustedNetProfitUSDT(
        position,
        exitPrice,
        exitFeeRatio,
      ),
    });
  }

  // BTEST:VPOINT_RAIL_BACKTHINK_LOSS_BOUNDARY
  const firstReachedLossBoundary =
    selectFirstReachedRailLossBoundary(lossBoundaries);
  if (firstReachedLossBoundary) {
    return {
      category: firstReachedLossBoundary.category,
      exitPrice: firstReachedLossBoundary.exitPrice,
      message: firstReachedLossBoundary.message,
      netProfitPercent: firstReachedLossBoundary.netProfitPercent,
      shouldExit: true,
    };
  }

  const isLiquidated = globalLiquidation || isolatedLiquidationTriggered;
  if (isLiquidated) {
    const category = globalLiquidation
      ? TRADE_MESSAGE.sell.LIQUIDATED_GLOBAL
      : TRADE_MESSAGE.sell.LIQUIDATED_ISOLATED;

    return {
      shouldExit: true,
      category,
      exitPrice: currentPrice,
      netProfitPercent: -100,
      message: category,
    };
  }

  const takeProfitPercent = modelConfig.takeProfitPercent ?? 0;

  const rescueExit = postAverageRescue.evaluate({
    netPnlPercent: feeAdjustedNetProfitPercent,
    currentPrice,
    direction: position.direction,
    lastVolatilityPrice,
    position,
    config: modelConfig.postAverageRescueExit,
  });

  // BOTH:POST_AVERAGE_RESCUE_EXIT
  if (rescueExit.shouldExit) {
    return {
      shouldExit: true,
      category: TRADE_MESSAGE.sell.POST_AVERAGE_RESCUE_EXIT,
      exitPrice: currentPrice,
      netProfitPercent: feeAdjustedNetProfitPercent,
      message:
        "BOTH:POST_AVERAGE_RESCUE_EXIT" +
        ` | averages:${rescueExit.completedAveragingCount}` +
        ` | requiredNetPnl:${rescueExit.minimumNetPnlPercent}%`,
    };
  }

  // BOTH:VOLATILITY_TARGET_TP
  if (hasHitTargetZone && netProfitPercent > 0) {
    return {
      shouldExit: true,
      category: TRADE_MESSAGE.sell.TP,
      exitPrice: currentPrice,
      netProfitPercent,
      message: "BOTH:VOLATILITY_TARGET_TP",
    };
  }

  // BOTH:TRADITIONAL_TP_SL
  if (
    takeProfitPercent > 0 &&
    netProfitPercent >= takeProfitPercent &&
    hasHitTargetZone
  ) {
    return {
      shouldExit: true,
      category: TRADE_MESSAGE.sell.TP,
      exitPrice: currentPrice,
      netProfitPercent,
      message: "BOTH:TRADITIONAL_TP_SL",
    };
  }

  return {
    shouldExit: false,
    exitPrice: currentPrice,
    netProfitPercent,
  };
}

function getHardStopLossExitPrice(
  position: Position,
  hardStopLossPercent: number,
) {
  const priceMovePercent = hardStopLossPercent / 100;

  if (position.direction === "SHORT") {
    return position.exposure.averageEntryPrice * (1 + priceMovePercent);
  }

  return position.exposure.averageEntryPrice * (1 - priceMovePercent);
}
