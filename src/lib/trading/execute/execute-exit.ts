import type {
  ExchangeType,
  UnifiedOrderParams,
} from "@/lib/exchange";
import { resolveMarketTypeForTradingMode } from "@/lib/exchange/utils";
import {
  TradingMode,
  UnifiedOrderSide,
  UnifiedOrderType,
  getExchange,
} from "@/lib/exchange";
import type {
  Position,
  TradeDecision,
  TradingModelConfig,
  TradingModelMemory,
} from "@/lib/trading/models";
import type { fetchKlinesFunction } from "@lib/datasets"; // Fetch historical/live klines
import type { Kline } from "../../exchange/platform/tokocrypto";
import { tradeLog } from "../helper/log";
import { notif } from "../helper/notification"; // Email/notification system
import type { NotificationDashboard } from "@/lib/notification/config";
import { mergePositions } from "../helper/utils";
import { TRADE_MESSAGE } from "../message";
import type {
  InitialBalance,
  TradingDetail,
  TradingReturn,
} from "../type"; // Config & return types
import { dynamicExit } from "./models/exit";

interface ExecuteExitProps {
  symbol: string
  current?: Kline
  fetchKlines?: typeof fetchKlinesFunction
  modelConfig: TradingModelConfig
  modelMemory: TradingModelMemory
  exchangeType: ExchangeType
  tradingMode: TradingMode
  bypass?: boolean;
  simulate?: boolean;
  balanceOverride?: InitialBalance;
  notificationTarget?: {
    dashboard: NotificationDashboard;
    successKey: string;
    failureKey: string;
  };
}

/** Creates an isolated snapshot so a failed live exit cannot close local state. */
function cloneModelMemory(memory: TradingModelMemory): TradingModelMemory {
  return JSON.parse(JSON.stringify(memory));
}

/** Restores local memory and guarantees that the failed exit retries next cycle. */
function restoreFailedLiveExit(
  memory: TradingModelMemory,
  snapshot: TradingModelMemory,
  reason: string,
) {
  for (const key of Object.keys(memory)) {
    delete (memory as Record<string, unknown>)[key];
  }
  Object.assign(memory, snapshot);
  for (const position of memory.positions ?? []) {
    position.control ??= {};
    position.control.forceExit = { reason };
  }
}

export function calculateFuturesExitNetProceeds(params: {
  entryPrice: number;
  exitPrice: number;
  feeUSDT: number;
  leverage: number;
  quantity: number;
  direction?: "LONG" | "SHORT";
}) {
  const leverage = Math.max(1, Number.isFinite(params.leverage) ? params.leverage : 1);
  const entryNotional = params.quantity * params.entryPrice;
  const marginReturned = entryNotional / leverage;
  const grossProfit =
    params.direction === "SHORT"
      ? entryNotional - params.quantity * params.exitPrice
      : params.quantity * params.exitPrice - entryNotional;

  return marginReturned + grossProfit - params.feeUSDT;
}

export async function executeExit({
  symbol,
  current, // Current candle (last minute)
  // fetchKlines = fetchKlinesFunction, // Function to fetch candle data
  modelConfig, // Strategy configuration,
  modelMemory,
  exchangeType = "tokocrypto",
  tradingMode = TradingMode.SPOT,
  bypass = false,
  simulate = false,
  balanceOverride,
  notificationTarget,
}: ExecuteExitProps): Promise<TradingReturn> {
  const { orderType = "taker", } = modelConfig;

  if (!modelMemory.positions) {
    // Save buy record, to track the price
    modelMemory.positions = [] as Position[];
  }

  const isTest = simulate

  const tradingSymbol = symbol.includes("_") ? symbol : symbol + "_USDT";

  const exchange = getExchange(exchangeType, {
    defaultTradingMode: tradingMode,
  });

  const baseAssetSymbol = symbol
  const quoteAssetSymbol = "USDT"

  /**
   * B. Get all the positions
   */
  const currentPosition: Position | null = mergePositions(modelMemory.positions);

  /**
   * C. Fetch fresh candles whenever the caller did not provide one.
   *    Sandbox mode still needs a live market price even though execution is simulated.
   */
  if (!current) {
    const candles = await exchange.getKlines({
      symbol: tradingSymbol,
      interval: "1m",
      simpleTime: "5minute",
      limit: 5, // We only need the last few
      marketType: resolveMarketTypeForTradingMode(tradingMode),
    });
    current = candles.at(-1); // Last candle is current market price
  }

  if (!current) {
    tradeLog.error("current undefined, Empty kline data");
    return {
      message: "Current kline undefined",
    };
  }

  /**
   * in USDT
   */
  let totalFee = 0;
  let totalTax = 0;
  let totalProfit = 0;

  /**
   * In Percentage
   */
  let totalProfitPercent = 0;

  // Determine order type: taker = MARKET, maker = LIMIT
  const orderTypeCode =
    orderType === "taker"
      ? UnifiedOrderType.MARKET
      : UnifiedOrderType.LIMIT;

  // Current price from OHLCV (close price)
  const price = parseFloat(current[4]);

  // Real success order or not,
  let success = false;
  let tradingResult = undefined;
  let usdtSpent = 0;
  let finalBalance = balanceOverride?.quoteAsset ?? 0;

  const memoryBeforeDecision = isTest ? undefined : cloneModelMemory(modelMemory);
  const decision: TradeDecision = await dynamicExit({
    symbol,
    current,
    config: modelConfig,
    memory: modelMemory,
    tradingMode,
    exchangeType,
    bypass,
  })

  let message = decision.log ?? decision.reason ?? "-";

  /**
   * G. Execute SELL logic
   */
  if (
    currentPosition &&
    (decision.action === "SELL" &&
      decision.profit !== undefined)
  ) {
    // G.1 Validate the quantity
    const sellQuantity = decision.amount ?? 0

    // G.2 Start to sell
    // Gross value of position (quantity * current price)
    const gross = sellQuantity * price;

    const isShort = currentPosition.direction === "SHORT";
    const side = isShort ? UnifiedOrderSide.BUY : UnifiedOrderSide.SELL;

    // Calculate sell fee (including tax)
    const totalFeePercent = exchange.getFees().getTotalFeePercent({
      side: isShort ? "buy" : "sell",
      currency: quoteAssetSymbol,
      type: orderType as "maker" | "taker",
    });

    const totalFeeAmount = gross * (totalFeePercent / 100);

    // Net proceeds after fee
    const net = gross - totalFeeAmount;

    const targetPosition = decision.position
      ? decision.position
      : currentPosition;

    const leverage = targetPosition.exposure.leverage ?? 1;
    const entryFeeUSDT =
      typeof targetPosition.fees.entryUsdt === "number" &&
      Number.isFinite(targetPosition.fees.entryUsdt)
        ? targetPosition.fees.entryUsdt
        : 0;

    const profit =
      decision.profit * (targetPosition.exposure.quantity * targetPosition.exposure.averageEntryPrice);

    // Update bookkeeping
    totalFee = totalFeeAmount;
    totalTax = 0;
    totalProfit = profit;

    totalProfitPercent = decision.profit;
    targetPosition.fees.entryUsdt = entryFeeUSDT;
    if (targetPosition.closed) {
      targetPosition.closed.feeUsdt = totalFeeAmount;
    }
    delete targetPosition.fees.estimatedExitUsdt;

    const netProceeds =
      tradingMode === TradingMode.SPOT
        ? net
        : calculateFuturesExitNetProceeds({
          direction: targetPosition.direction,
          entryPrice: targetPosition.exposure.averageEntryPrice,
          exitPrice: price,
          feeUSDT: totalFeeAmount,
          leverage,
          quantity: targetPosition.exposure.quantity,
        });
    
    // Update balances
    usdtSpent = netProceeds;
    finalBalance = (balanceOverride?.quoteAsset ?? 0) + netProceeds;

    // Place SELL order on live exchange
    if (!isTest) {
      const exitParam: UnifiedOrderParams = {
        tradeType: "EXIT",
        symbol: tradingSymbol,
        side,
        type: orderTypeCode,
        quantity: sellQuantity,
        price,
        tradingMode,
        reduceOnly: tradingMode === TradingMode.FUTURES,
      };

      try {
        tradeLog.debug("EXIT Params:", exitParam);

        const exitResult = await exchange.createOrder(exitParam);

        tradeLog.debug("EXIT Result:", JSON.stringify(exitResult, null, 2));

        if (tradingMode === TradingMode.FUTURES) {
          // PROD:CONFIRM_FUTURES_EXIT_ON_EXCHANGE
          const confirmation = await exchange.ensureClosed({
            direction: targetPosition.direction,
            symbol: tradingSymbol,
          });
          if (!confirmation.closed) {
            throw new Error(
              `Exchange still reports ${confirmation.remainingAmount} ${symbol} after exit confirmation`,
            );
          }
          tradeLog.debug("EXIT Confirmation:", confirmation);
        }

        success = true; // if no throw

        tradingResult = exitResult;


        const gainPct = (decision.profit * 100).toFixed(2);
        const gainLevPct = (decision.profit * 100 * leverage).toFixed(2);
        const futuresMsg = tradingMode === TradingMode.FUTURES
          ? `\n        | Gain: ${gainPct}% | ROE: ${gainLevPct}% (Lv: ${leverage}x)`
          : "";

        message = `${TRADE_MESSAGE.sell.SELL} | ${symbol} ${decision.position?.direction} 
        | Profit: $${profit.toFixed(2)} ${tradingMode === TradingMode.FUTURES ? `(with Lev:${leverage}x)` : ""}
        | USDT Profit: $${net.toFixed(2)}
        | Entry USDT: $${decision.position?.exposure.notionalUsdt.toFixed(2)}
        | Entry: $${decision.position?.exposure.averageEntryPrice.toFixed(5)} Current: $${price.toFixed(5)}
        | Quantity: ${decision.position?.exposure.quantity}
        | ${exchangeType}:${tradingMode}${futuresMsg}
        `;

        const body = JSON.stringify({
          modelDecision: {
            decision,
            sellQuantity,
            price,
          },
          exitParam,
          exitResult
        }, null, 2);

        if (notificationTarget) {
          void notif.central({
            dashboard: notificationTarget.dashboard,
            // PROD:NOTIF_EXIT
            key: notificationTarget.successKey,
            title: message,
            message: body,
          });
        } else {
          void notif.central({
            subject: message,
            body,
          });
        }
      } catch (error: any) {
        tradeLog.error("EXIT Failed", error);

        if (memoryBeforeDecision) {
          // PROD:CONFIRM_FUTURES_EXIT_ON_EXCHANGE
          restoreFailedLiveExit(
            modelMemory,
            memoryBeforeDecision,
            `Live exit was not confirmed: ${error.message}`,
          );
        }

        message = "EXIT ORDER FAILED " + error.message;

        tradingResult = { error: error.message };

        const body = JSON.stringify({ exitParam, error: error.message });

        if (notificationTarget) {
          void notif.central({
            dashboard: notificationTarget.dashboard,
            // PROD:NOTIF_EXIT_FAILED
            key: notificationTarget.failureKey,
            title: "EXIT ORDER FAILED",
            message: body,
          });
        } else {
          void notif.central({
            subject: "EXIT ORDER FAILED",
            body,
          });
        }
      }
    } else {
      const gainPct = (decision.profit * 100).toFixed(2);
      message = `${TRADE_MESSAGE.sell.SELL} | ${symbol} ${decision.position?.direction}
        | Profit: $${profit.toFixed(2)}
        | USDT Profit: $${net.toFixed(2)}
        | Entry: $${decision.position?.exposure.averageEntryPrice?.toFixed(5)} Current: $${price.toFixed(5)}
        | Quantity: ${decision.position?.exposure.quantity}
        | Gain: ${gainPct}%`;

      const body = JSON.stringify(
        {
          modelDecision: {
            decision,
            sellQuantity,
            price,
          },
          sandbox: true,
        },
        null,
        2,
      );

      if (notificationTarget) {
        void notif.central({
          dashboard: notificationTarget.dashboard,
          // PROD:NOTIF_EXIT
          key: notificationTarget.successKey,
          title: `[SANDBOX] ${message}`,
          message: body,
        });
      } else {
        void notif.central({
          subject: `[SANDBOX] ${message}`,
          body,
        });
      }
    }
  }

  let tradingDetail: TradingDetail | undefined = undefined

  if (decision.action !== "HOLD") {
    tradingDetail = {
      baseAssetSymbol,
      action: decision.action,
      finalBalance,
      usdtSpent,
      totalFee,
      totalTax,
      totalProfit,
      totalProfitPercent,
    };
  }

  /**
   * H. Return trade result summary
   */
  return {
    symbol,
    message,
    tradingDetail: isTest ? tradingDetail : success ? tradingDetail : undefined,
    tradingResult,
  };
}
