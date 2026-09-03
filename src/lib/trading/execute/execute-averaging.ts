import type { ExchangeType, UnifiedOrderParams } from "@/lib/exchange";
import type { AveragingRecommendation } from "@/lib/brain/algorithms/type-execute";
import type { AdaptiveAveragingConfig, VolatilityPoint } from "@/lib/dynamic";
import {
  getExchange,
  TradingMode,
  UnifiedOrderSide,
  UnifiedOrderType,
} from "@/lib/exchange";
import { resolveMarketTypeForTradingMode } from "@/lib/exchange/utils";
import type {
  TradingModelConfig,
  TradingModelMemory,
} from "@/lib/trading/models";
import { MINIMAL_USDT_TO_TRADE } from "../constants";
import { tradeLog } from "../helper/log";
import { notif } from "../helper/notification";
import { TRADE_MESSAGE } from "../message";
import type { InitialBalance, TradingReturn } from "../type";
import averagingMessage from "./averaging-message";
import adaptiveAveraging from "../adaptive-averaging";
import {
  canSpendWatchStepMargin,
  getNextWatchStep,
  hasPositionHitTargetVolatilityPoint,
  isActionableAveragingVolatilityLevel,
  markReservedWatchStepUsed,
  resolveAveragingRescueProjection,
} from "../../slowTrading/watch-reserve";

interface ExecuteAveragingProps {
  symbol: string;
  modelConfig: TradingModelConfig;
  modelMemory: TradingModelMemory;
  volatilityPoints: VolatilityPoint[];
  exchangeType: ExchangeType;
  tradingMode: TradingMode;
  bypass?: boolean;
  balanceOverride?: InitialBalance;
  reservedQuoteAsset?: number;
  averagingRecommendation?: AveragingRecommendation;
  adaptiveAveraging?: AdaptiveAveragingConfig;
  averagingRescueProjectionGuardEnabled?: boolean;
}

/**
 * Execute averaging (add to position) for an already-open position.
 *
 * The amount to buy is driven by the next watch step in the position's
 * strategy.averaging.steps. Steps after the reserved budget can still execute
 * when Max Next Averaging Levels allows them and balance is available.
 */
export async function executeAveraging({
  symbol,
  modelConfig,
  modelMemory,
  volatilityPoints,
  exchangeType = "tokocrypto",
  tradingMode = TradingMode.SPOT,
  bypass: _bypass = false,
  balanceOverride,
  reservedQuoteAsset = 0,
  averagingRecommendation,
  adaptiveAveraging: adaptiveAveragingConfig,
  averagingRescueProjectionGuardEnabled = true,
}: ExecuteAveragingProps): Promise<TradingReturn> {
  const { orderType = "taker" } = modelConfig;
  const resolvedAdaptiveAveraging = adaptiveAveraging.config.normalize(
    adaptiveAveragingConfig,
    false,
  );

  // A. Must have an open position to average into
  const existingPosition = modelMemory.positions?.[0];
  if (!existingPosition) {
    return {
      symbol: undefined,
      message: "[Averaging] No open position to average into",
    };
  }
  if (
    hasPositionHitTargetVolatilityPoint({
      position: existingPosition,
      volatilityPoints,
    })
  ) {
    return {
      symbol,
      // BOTH:AVERAGING_STOPS_AFTER_TARGET_VPOINT
      message:
        `[AVERAGING_STOPS_AFTER_TARGET_VPOINT] Averaging skipped for ${symbol}: ` +
        "the position already reached its post-entry target vPoint",
    };
  }

  // B. Find the next reserved watch step — this drives the amount
  const nextStep = getNextWatchStep({
    averaging: existingPosition.strategy.averaging,
    includeUnreserved: true,
  });

  if (!nextStep) {
    return {
      symbol,
      message: "[Averaging] No reserved watch step available",
    };
  }

  if (
    averagingRecommendation &&
    !isActionableAveragingVolatilityLevel(averagingRecommendation)
  ) {
    return {
      symbol,
      // PROD:LOW_LEVEL_NO_ACTION_AVERAGING
      message:
        `[LOW_LEVEL_NO_ACTION_AVERAGING] Averaging skipped because ${symbol} has ` +
        `weak/neutral volatility level ${averagingRecommendation.lvl ?? "unknown"}`,
    };
  }

  const tradingSymbol = symbol.includes("_") ? symbol : symbol + "_USDT";
  const direction = existingPosition.direction ?? "LONG";
  const leverage = existingPosition.exposure.leverage ?? 1;

  const exchange = getExchange(exchangeType, {
    defaultTradingMode: tradingMode,
  });

  // Derive sandbox mode from the position itself — never trust the caller to pass it correctly
  const isTest = existingPosition.executionMode === "sandbox";

  // C. Fetch current market price
  const candles = await exchange.getKlines({
    symbol: tradingSymbol,
    interval: "1m",
    simpleTime: "5minute",
    limit: 5,
    marketType: resolveMarketTypeForTradingMode(tradingMode),
  });
  const current = candles.at(-1);

  if (!current) {
    return {
      symbol,
      message: "[Averaging] Could not fetch current kline",
    };
  }

  const price = parseFloat(current[4]);
  const rescueProjection = resolveAveragingRescueProjection({
    position: existingPosition,
    step: nextStep,
    executablePrice: price,
    rescueAnchorPrice: averagingRecommendation?.p ?? Number.NaN,
    quoteAsset: balanceOverride?.quoteAsset,
    reservedQuoteAsset,
    adaptiveAveraging: resolvedAdaptiveAveraging,
    rescueProjectionGuardEnabled: averagingRescueProjectionGuardEnabled,
    triggerVolatilityPct: averagingRecommendation?.pct,
  });

  if (!rescueProjection.canExecute) {
    return {
      symbol,
      // BOTH:AVERAGING_IMPROVES_RESCUE_PROJECTION
      message:
        `[AVERAGING_IMPROVES_RESCUE_PROJECTION] Averaging skipped for ${symbol}: ` +
        `${rescueProjection.reason}. Current ${price.toFixed(8)}, ` +
        `vPoint ${(averagingRecommendation?.p ?? Number.NaN).toFixed(8)}, ` +
        `projected ${rescueProjection.projectedProfitPct.toFixed(2)}%`,
    };
  }

  const amountUSDT = rescueProjection.marginUsdt;
  const usedPctAlloc = rescueProjection.multiplier;
  const spendStep = {
    ...nextStep,
    reservedMarginUsdt: nextStep.marginUsdt,
    marginUsdt: amountUSDT,
    allocationPct: usedPctAlloc,
  };
  const adaptiveMessageSuffix =
    usedPctAlloc !== nextStep.allocationPct
      ? ` | ADAPTIVE AVG ${usedPctAlloc}x (reserved $${nextStep.marginUsdt.toFixed(2)} -> used $${amountUSDT.toFixed(2)}, projected +${rescueProjection.projectedProfitPct.toFixed(2)}%)`
      : "";

  if (amountUSDT < MINIMAL_USDT_TO_TRADE) {
    return {
      symbol,
      message: `[Averaging] Reserved step amount ${amountUSDT.toFixed(2)} USDT is below minimum ${MINIMAL_USDT_TO_TRADE.toFixed(2)}`,
    };
  }

  if (
    balanceOverride &&
    // BOTH:HAVE_ENOUGH_TO_RESERVED
    !canSpendWatchStepMargin({
      step: spendStep,
      quoteAsset: balanceOverride.quoteAsset,
      reservedQuoteAsset,
      minimalUsdt: MINIMAL_USDT_TO_TRADE,
    })
  ) {
    const spendable = Math.max(
      0,
      (balanceOverride.quoteAsset ?? 0) - reservedQuoteAsset,
    );
    return {
      symbol,
      message:
        `[Averaging] Not enough ${nextStep.status === "UNRESERVED" ? "spendable" : "available"} ` +
        `balance for watch step ${nextStep.level}. ` +
        `needed:${amountUSDT.toFixed(2)} available:${balanceOverride.quoteAsset.toFixed(2)} ` +
        `reserved:${reservedQuoteAsset.toFixed(2)} ` +
        `spendable:${spendable.toFixed(2)}`,
    };
  }

  // D. Fee and futures notional calculation.
  // BOTH:WATCH_MECHANISM
  // PROD:WATCH_MECHANISM
  // `amountUSDT` is the watch-step margin budget. Futures orders must be
  // sized by notional, while balance accounting still spends margin plus fee.
  const totalFeePercent = exchange.getFees().getTotalFeePercent({
    side: "buy",
    currency: "USDT",
    type: orderType as "maker" | "taker",
  });
  const totalFeeRate = totalFeePercent / 100;
  const targetNotionalUSDT =
    tradingMode === TradingMode.SPOT ? amountUSDT : amountUSDT * leverage;

  const preferredQuantity = targetNotionalUSDT / price;

  const quantity = await exchange.adjustQuantity(
    preferredQuantity,
    tradingSymbol,
  );

  if (quantity === 0) {
    return {
      symbol,
      message: `[Averaging] ${TRADE_MESSAGE.cancel.amount.NO_ENOUGH} adjustQuantity returned 0 for ${amountUSDT.toFixed(2)} USDT`,
    };
  }

  let message = "-";
  let success = false;
  let executedFeeUSDT = 0;
  let quoteSpentUSDT = 0;

  // E. Sandbox simulation path
  if (isTest) {
    const executedQuoteQty = price * quantity;
    const executedMarginUSDT =
      tradingMode === TradingMode.SPOT
        ? executedQuoteQty
        : executedQuoteQty / leverage;
    executedFeeUSDT = executedQuoteQty * totalFeeRate;
    quoteSpentUSDT = executedMarginUSDT + executedFeeUSDT;

    const newQuantity = existingPosition.exposure.quantity + quantity;
    const newEntryPrice =
      (existingPosition.exposure.averageEntryPrice *
        existingPosition.exposure.quantity +
        price * quantity) /
      newQuantity;

    existingPosition.exposure.averageEntryPrice = newEntryPrice;
    existingPosition.exposure.quantity = newQuantity;
    existingPosition.exposure.notionalUsdt =
      (existingPosition.exposure.notionalUsdt ?? 0) + executedQuoteQty;
    existingPosition.exposure.marginUsdt =
      (existingPosition.exposure.marginUsdt ?? 0) + executedMarginUSDT;
    existingPosition.fees.entryUsdt =
      (existingPosition.fees.entryUsdt ?? 0) + executedFeeUSDT;
    existingPosition.fees.estimatedExitUsdt =
      existingPosition.exposure.notionalUsdt * totalFeeRate;
    const averagingSummary = averagingMessage.format({
      adaptiveMessageSuffix,
      marginUsdt: executedMarginUSDT,
      stepLevel: nextStep.level,
    });
    existingPosition.strategy.averaging.executions ??= [];
    existingPosition.strategy.averaging.executions.push({
      t: current[0],
      level: nextStep.level,
      marginUsdt: executedMarginUSDT,
      price,
      allocationPct: usedPctAlloc,
      reservedMarginUsdt: nextStep.marginUsdt,
      adaptiveMultiplier: resolvedAdaptiveAveraging.enabled
        ? rescueProjection.multiplier
        : undefined,
      projectedProfitPct: resolvedAdaptiveAveraging.enabled
        ? rescueProjection.projectedProfitPct
        : undefined,
      // PROD:AVERAGING_MONITORING_STATE_SNAPSHOT
      monitoringState: existingPosition.lastMonitoringStage
        ? { ...existingPosition.lastMonitoringStage }
        : undefined,
    });

    markReservedWatchStepUsed({
      averaging: existingPosition.strategy.averaging,
      handledLevel: nextStep.level,
      executedPrice: price,
      usedAt: current[0],
      usedMarginUsdt: executedMarginUSDT,
      usedPctAlloc,
    });

    success = true;
    message =
      `${TRADE_MESSAGE.buy.ADD_POSITION} [Sandbox] | ` +
      `${symbol} ${direction} | ${averagingSummary}`;

    void notif.central({
      dashboard: "SLOW",
      // PROD:NOTIF_AVG
      key: "NOTIF_AVERAGE",
      title: `[SANDBOX] ${message}`,
      message: JSON.stringify({ nextStep, sandbox: true, spendStep }, null, 2),
    });
  }

  // F. Live exchange path
  if (!isTest) {
    const buyParam: UnifiedOrderParams = {
      tradeType: "ENTRY",
      symbol: tradingSymbol,
      side: direction === "LONG" ? UnifiedOrderSide.BUY : UnifiedOrderSide.SELL,
      type:
        orderType === "taker"
          ? UnifiedOrderType.MARKET
          : UnifiedOrderType.LIMIT,
      quantity,
      price,
      tradingMode,
    };

    try {
      tradeLog.log("[Averaging] BUY Params:", buyParam);
      const buyResult = await exchange.createOrder(buyParam);
      tradeLog.log(
        "[Averaging] BUY Result:",
        JSON.stringify(buyResult, null, 2),
      );

      success = true;

      const executedPrice = buyResult.executedPrice || price;
      let executedQty = buyResult.executedQty || 0;

      // Try to fetch executed qty if not returned
      if (!executedQty || executedQty === 0) {
        try {
          await new Promise((r) => setTimeout(r, 2000));
          const lastOrder = await exchange.getLastOrder(tradingSymbol);
          if (lastOrder && lastOrder.orderId === buyResult.orderId) {
            executedQty = lastOrder.executedQty || 0;
          }
        } catch (e) {
          tradeLog.warn("[Averaging] Failed to fetch executedQty update", e);
        }
      }
      if (executedQty === 0) executedQty = quantity;

      const executedQuoteQty = executedPrice * executedQty;
      const liveMarginUSDT =
        tradingMode === TradingMode.SPOT
          ? executedQuoteQty
          : executedQuoteQty / leverage;
      executedFeeUSDT = executedQuoteQty * (totalFeePercent / 100);
      quoteSpentUSDT = liveMarginUSDT + executedFeeUSDT;

      // Update weighted average position
      const newQuantity = existingPosition.exposure.quantity + executedQty;
      const newEntryPrice =
        (existingPosition.exposure.averageEntryPrice *
          existingPosition.exposure.quantity +
          executedPrice * executedQty) /
        newQuantity;

      existingPosition.exposure.averageEntryPrice = newEntryPrice;
      existingPosition.exposure.quantity = newQuantity;
      existingPosition.exposure.notionalUsdt =
        (existingPosition.exposure.notionalUsdt ?? 0) + executedQuoteQty;
      existingPosition.exposure.marginUsdt =
        (existingPosition.exposure.marginUsdt ?? 0) + liveMarginUSDT;
      existingPosition.fees.entryUsdt =
        (existingPosition.fees.entryUsdt ?? 0) + executedFeeUSDT;
      existingPosition.fees.estimatedExitUsdt =
        existingPosition.exposure.notionalUsdt * totalFeeRate;
      const averagingSummary = averagingMessage.format({
        adaptiveMessageSuffix,
        marginUsdt: liveMarginUSDT,
        stepLevel: nextStep.level,
      });
      existingPosition.strategy.averaging.executions ??= [];
      existingPosition.strategy.averaging.executions.push({
        t: current[0],
        level: nextStep.level,
        marginUsdt: liveMarginUSDT,
        price: executedPrice,
        allocationPct: usedPctAlloc,
        reservedMarginUsdt: nextStep.marginUsdt,
        adaptiveMultiplier: resolvedAdaptiveAveraging.enabled
          ? rescueProjection.multiplier
          : undefined,
        projectedProfitPct: resolvedAdaptiveAveraging.enabled
          ? rescueProjection.projectedProfitPct
          : undefined,
        // PROD:AVERAGING_MONITORING_STATE_SNAPSHOT
        monitoringState: existingPosition.lastMonitoringStage
          ? { ...existingPosition.lastMonitoringStage }
          : undefined,
      });

      markReservedWatchStepUsed({
        averaging: existingPosition.strategy.averaging,
        handledLevel: nextStep.level,
        executedPrice,
        usedAt: current[0],
        usedMarginUsdt: liveMarginUSDT,
        usedPctAlloc,
      });

      message =
        `${TRADE_MESSAGE.buy.ADD_POSITION} | ${symbol} ${direction} | ` +
        `${averagingSummary} | ${exchangeType}:${tradingMode}`;

      void notif.central({
        dashboard: "SLOW",
        // PROD:NOTIF_AVG
        key: "NOTIF_AVERAGE",
        title: message,
        message: JSON.stringify({ buyParam, buyResult, nextStep }, null, 2),
      });
    } catch (error: any) {
      tradeLog.error("[Averaging] BUY Failed:", error);

      message = error.message;

      void notif.central({
        dashboard: "SLOW",
        // PROD:NOTIF_AVG_FAILED
        key: "NOTIF_AVERAGE_FAILED",
        title: "AVERAGING ORDER FAILED",
        message: JSON.stringify(
          { buyParam, error: error.message || error, nextStep },
          null,
          2,
        ),
      });
    }
  }

  return {
    symbol: existingPosition.symbol,
    message,
    tradingDetail: success
      ? {
          baseAssetSymbol: symbol,
          action: "BUY",
          finalBalance: 0, // not tracked here — handled by caller
          usdtSpent: -quoteSpentUSDT,
          totalFee: executedFeeUSDT,
          totalTax: 0,
          totalProfit: 0,
          totalProfitPercent: 0,
        }
      : undefined,
  };
}
