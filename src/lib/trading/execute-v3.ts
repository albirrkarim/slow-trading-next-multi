import {
  getExchange,
  TradingMode,
  UnifiedOrderSide,
  UnifiedOrderType,
  type UnifiedOrderParams,
} from "@/lib/exchange";

import { fetchKlinesFunction } from "@lib/datasets"; // Fetch historical/live klines
import {
  type Position,
  type TradeDecision,
} from "@/lib/trading/models"; // Strategy decision logic
import { notif } from "./helper/notification"; // Email/notification system
import moment from "moment-timezone";
import { TRADE_MESSAGE } from "./message";
import type { TradingConfig, TradingDetail, TradingReturn } from "./type"; // Config & return types
import { getLastPosition, mergePositions } from "./helper/utils";
import { MINIMAL_USDT_TO_TRADE } from "./constants";
import { tradeLog } from "./helper/log";
import tradingPosition from "./position";

function buildV3Position(params: {
  decision: TradeDecision;
  executionMode: Position["executionMode"];
  feeUsdt: number;
  leverage: number;
  notionalUsdt: number;
  price: number;
  quantity: number;
  symbol: string;
  t: number;
  tradingMode: TradingMode;
}): Position {
  const entryVPoint = params.decision.entryVPoint ?? {
    id: `LEGACY_${params.symbol}_${params.t}`,
    lvl: 0,
  };
  return {
    symbol: params.symbol.split("_")[0],
    executionMode: params.executionMode,
    tradingMode: params.tradingMode,
    direction: "LONG",
    opened: {
      t: params.t,
      vPoint: entryVPoint,
      source: params.decision.category?.includes("MANUAL")
        ? "MANUAL"
        : undefined,
      reason: tradingPosition.entry.reason.resolve(params.decision.category),
      message:
        params.decision.log ??
        params.decision.reason ??
        `${TRADE_MESSAGE.buy.ENTRY} ${params.symbol}`,
      price: params.price,
    },
    exposure: {
      quantity: params.quantity,
      averageEntryPrice: params.price,
      notionalUsdt: params.notionalUsdt,
      marginUsdt: params.notionalUsdt / params.leverage,
      leverage: params.leverage,
    },
    fees: {
      entryUsdt: params.feeUsdt,
      estimatedExitUsdt: params.feeUsdt,
    },
    strategy: {
      entry: {
        label: params.decision.category
          ?.replaceAll("[", "")
          .replaceAll("]", ""),
      },
      averaging: {
        entryLevel: entryVPoint.lvl,
        lastHandledLevel: entryVPoint.lvl,
        reserveBaseMarginUsdt: params.notionalUsdt / params.leverage,
        reservedRemainingMarginUsdt: 0,
        steps: [],
      },
    },
    pnl: {},
  };
}

/**
 * Executes trading logic (BUY/SELL/HOLD) for a given symbol
 * using last-minute candle data and strategy model configuration.
 *
 * Designed for both:
 * - Backtesting (pass in mock balance & candles)
 * - Live trading (fetch real balances, candles, and place orders)
 *
 * @date 8 Jan 2026
 *
 * @param config - Trading parameters and market data
 * @returns Trading summary including executed action, position, and updated balance
 */
export async function executeTradingV3({
  symbol = "BTC_USDT", // Default trading pair
  current, // Current candle (last minute)
  fetchKlines = fetchKlinesFunction, // Function to fetch candle data
  getTradingDecisionFunction,
  balance, // Initial balance (for backtest) or undefined (live)
  modelConfig, // Strategy configuration,
  modelMemory,
  exchangeType = "tokocrypto",
  tradingMode = TradingMode.SPOT,
}: TradingConfig): Promise<TradingReturn> {
  const {
    orderType = "taker",
    onlyTPFromDate,
    maxBuyUSDT,
  } = modelConfig; // Default to taker orders (market)

  if (!modelMemory.positions) {
    // Save buy record, to track the price
    modelMemory.positions = [] as Position[];
  }

  const isTest = balance !== undefined; // Distinguish backtest mode (balance provided) vs live
  const sym = symbol.split("_"); // Split "BTC_USDT" into ["BTC", "USDT"]

  const exchange = getExchange(exchangeType, {
    defaultTradingMode: tradingMode,
  });

  const baseAssetSymbol = sym[0]; // BTC
  const quoteAssetSymbol = sym[1]; // USDT

  let currentBalance = balance;

  /**
   * A. Fetch real balances from exchange if in live mode
   */
  if (!isTest) {
    // A.0 Get real quote and base
    const realBalance = await exchange.getBalance(symbol);
    if (realBalance == null) {
      return {
        message: `Can't fetch real balance! ${symbol}`,
      };
    }

    // A.1 Quote Asset To Trade
    if (modelMemory.quoteAssetToTrade !== undefined) {
      currentBalance = {
        ...realBalance,
        quoteAsset: modelMemory.quoteAssetToTrade,
      };
    } else {
      // A.2 model passive and older
      currentBalance = realBalance;
    }

    tradeLog.debug("Real Balance ", currentBalance);
  }

  if (!currentBalance) {
    tradeLog.error("Balance not defined");
    return {
      message: "Balance not defined",
    };
  }

  /**
   * B. Get all the positions
   */
  let currentPosition: Position | null = mergePositions(modelMemory.positions);

  if (!isTest) {
    // Fallback using online data
    if (currentPosition == null) {
      currentPosition = await getLastPosition({
        symbol,
        baseAsset: currentBalance.baseAsset,
        fetchKlines,
      });

      // Only when there is some position
      if (currentPosition) {
        // initialize the positions
        modelMemory.positions.push(currentPosition);
      }
    }
  }

  /**
   * C. Fetch fresh candles (if live)
   *    - Uses 1-minute interval and 5-minute window for strategy
   */
  if (!isTest) {
    const candles = await fetchKlines({
      symbol,
      interval: "1m",
      simpleTime: "5minute", // likely 5 candles aggregated
    });
    current = candles.at(-1); // Last candle is current market price
  }

  if (!current) {
    tradeLog.error("current undefined, Empty kline data");
    return {
      message: "Current kline undefined",
    };
  }

  // C.1 Also inform the model with the usdt balance
  modelConfig.balanceUSDT = currentBalance ? currentBalance.quoteAsset : 0;

  // C.1.2 Also set maximal USD
  if (maxBuyUSDT !== undefined) {
    if (modelConfig.balanceUSDT > maxBuyUSDT) {
      modelConfig.balanceUSDT = maxBuyUSDT;
    }
  }

  /**
   * D. Generate trading decision (BUY / SELL / HOLD) via strategy model
   */
  const decision = await getTradingDecisionFunction({
    symbol,
    current,
    fetchKlines,
    position: currentPosition,
    config: modelConfig,
    memory: modelMemory,
  });

  // Ignore if no action
  if (decision.action === "HOLD") {
    return {
      action: "HOLD",
      message: decision.reason ?? "HOLD",
    };
  }

  // Fail-safe: Ensure notification message exists
  if (!decision.emailNotif) {
    tradeLog.error("Email notification missing.");
    return {
      message: "Email notification missing.",
    };
  }

  /**
   * E. Initialize trade bookkeeping variables
   */
  tradeLog.log("decision", decision);

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
  let tradingResult = {};
  let usdtSpent = 0;

  /**
   * F. Execute BUY logic
   */
  if (decision.action === "BUY" && !modelMemory.forceSell) {
    const quoteAssetBefore = currentBalance.quoteAsset;
    /**
     * Get the amount of USDT from model suggestion or the all in with all USDT asset in balance
     */
    const wantToBuy = decision.amount ? decision.amount : quoteAssetBefore;

    /**
     * Realistic amount that we want to buy
     */
    let amountToBuy = wantToBuy;

    // of course when we have money
    if (amountToBuy > quoteAssetBefore) {
      amountToBuy = quoteAssetBefore;
    }

    if (amountToBuy < MINIMAL_USDT_TO_TRADE) {
      return {
        message: `${TRADE_MESSAGE.cancel.amount.TOO_SMALL} Amount USDT you have too small ${amountToBuy} must be more than $2`,
      };
    }

    usdtSpent = -amountToBuy; // when its buy so it negative

    const quoteStill = quoteAssetBefore - amountToBuy;

    // F.1 Only TP from defined date
    if (onlyTPFromDate) {
      const targetMoment = moment(onlyTPFromDate, "M/D/YYYY");
      const now = moment(current[0]);
      if (now.isAfter(targetMoment)) {
        return {
          message: `${TRADE_MESSAGE.buy.NO_MORE_AFTER_DATE} We can only sell to TP from ${onlyTPFromDate} no more buy!`,
        };
      }
    }

    // F.2 Start to buy

    // Calculate total buy fee (including tax if applicable) using unified interface
    const totalFeePercent = exchange.getFees().getTotalFeePercent({
      side: "buy",
      currency: quoteAssetSymbol,
      type: orderType as "maker" | "taker",
    });

    const totalFeeAmount = amountToBuy * (totalFeePercent / 100);

    // Available quoteAsset after fees
    // Note: The unified fee usually includes tax, so we just deduct the total fee.
    const availableSaldo = amountToBuy - totalFeeAmount;

    const preferedQuantity = availableSaldo / price;

    // Quantity of base asset (BTC) to buy
    const quantity = await exchange.adjustQuantity(preferedQuantity, symbol);

    if (quantity == 0) {
      // Modal habis coy
      return {
        message: `${TRADE_MESSAGE.cancel.amount.NO_ENOUGH} No enough balance to buy! amountToBuy:${amountToBuy} fee:${totalFeeAmount} tax:0 availableSaldo:${availableSaldo}`,
      };
    }

    // Update position with new entry
    if (isTest) {
      modelMemory.positions.push(buildV3Position({
        decision,
        executionMode: "sandbox",
        feeUsdt: totalFeeAmount,
        leverage: 1,
        notionalUsdt: amountToBuy,
        price,
        quantity,
        symbol,
        t: current[0],
        tradingMode,
      }));
    }

    // Update balances
    totalFee = totalFeeAmount;
    totalTax = 0; // Unified interface aggregates tax into fee, or assumes 0 if not exposed

    currentBalance.baseAsset = quantity;
    currentBalance.quoteAsset = quoteStill;

    // Place order on live exchange
    // Place order on live exchange
    if (!isTest) {
      const buyParam: UnifiedOrderParams = {
        tradeType: "ENTRY",
        symbol,
        side: UnifiedOrderSide.BUY,
        type: orderTypeCode,
        quantity,
        price,
        // timeInForce handled in adapter for LIMIT orders
      };

      tradeLog.log("BUY Params:", buyParam);

      try {
        const buyResult = await exchange.createOrder(buyParam);
        tradeLog.log("BUY Result:", buyResult);

        // If we reach here, it's successful (adapter throws on error)
        success = true;

        // Real data from exchange
        const executedPrice = buyResult.executedPrice || price;
        const executedQty = buyResult.executedQty || quantity;
        const executedQuoteQty = executedPrice * executedQty;

        modelMemory.positions.push(buildV3Position({
          decision,
          executionMode: "live",
          feeUsdt: executedQuoteQty * (totalFeePercent / 100),
          leverage: 1,
          notionalUsdt: executedQuoteQty,
          price: executedPrice,
          quantity: executedQty,
          symbol,
          t: current[0],
          tradingMode,
        }));

        tradingResult = buyResult;

        // Send notification email
        await notif.central({
          subject: decision.emailNotif,
          body: JSON.stringify({
            modelDecission: {
              decision,
              wantToBuy,
              amountToBuy,
              quoteAssetBefore,
              availableSaldo,
              price,
              preferedQuantity,
              quantity,
            },
            buyParam,
            buyResult,
          }),
        });
      } catch (error: any) {
        tradeLog.error("BUY Failed:", error);

        // Send notification email for failure
        await notif.central({
          subject: "BUY ORDER FAILED",
          body: JSON.stringify({
            modelDecission: {
              decision,
              amountToBuy,
            },
            buyParam,
            error: error.message || error,
          }),
        });

        tradingResult = { error: error.message };
      }
    }
  }

  /**
   * G. Execute SELL logic
   */
  if (
    decision.action === "SELL" &&
    currentPosition &&
    decision.profit !== undefined
  ) {
    // G.1 Validate the quantity
    let wantToSell = decision.amount
      ? decision.amount
      : currentBalance.baseAsset;

    // Ofcourse when we have
    if (wantToSell > currentBalance.baseAsset) {
      wantToSell = currentBalance.baseAsset;
    }

    const sellQuantity = await exchange.adjustQuantity(wantToSell, symbol);
    if (sellQuantity == 0) {
      return {
        message: `Sell quantity 0`,
      };
    }

    // G.2 Start to sell
    // Gross value of position (quantity * current price)
    const gross = sellQuantity * price;

    // Calculate sell fee (including tax)
    const totalFeePercent = exchange.getFees().getTotalFeePercent({
      side: "sell",
      currency: quoteAssetSymbol,
      type: orderType as "maker" | "taker",
    });

    const totalFeeAmount = gross * (totalFeePercent / 100);

    // Net proceeds after fee
    const net = gross - totalFeeAmount;

    const targetPosition = decision.position
      ? decision.position
      : currentPosition;

    const profit =
      decision.profit * (targetPosition.exposure.quantity * targetPosition.exposure.averageEntryPrice);

    // Update bookkeeping
    totalFee = totalFeeAmount;
    totalTax = 0;
    totalProfit = profit;

    totalProfitPercent = decision.profit;

    // Update balances
    usdtSpent = net;
    currentBalance.quoteAsset += net; // net profit or minus ? just do +=
    currentBalance.baseAsset -= sellQuantity; // sell all or not ?

    // Place SELL order on live exchange
    // Place SELL order on live exchange
    if (!isTest) {
      const sellParam: UnifiedOrderParams = {
        tradeType: "EXIT",
        symbol,
        side: UnifiedOrderSide.SELL,
        type: orderTypeCode,
        quantity: sellQuantity,
        price,
      };

      try {
        const sellResult = await exchange.createOrder(sellParam);

        success = true; // if no throw
        tradingResult = sellResult;

        await notif.central({
          subject: decision.emailNotif,
          body: JSON.stringify({ sellParam, sellResult }),
        });
      } catch (error: any) {
        tradeLog.error("SELL Failed", error);

        tradingResult = { error: error.message };

        await notif.central({
          subject: "SELL ORDER FAILED",
          body: JSON.stringify({ sellParam, error: error.message }),
        });
      }
    }
  }

  const tradingDetail: TradingDetail = {
    baseAssetSymbol,
    action: decision.action,
    finalBalance: currentBalance.quoteAsset,
    usdtSpent,
    totalFee,
    totalTax,
    totalProfit,
    totalProfitPercent,
  };

  /**
   * H. Return trade result summary
   */
  return {
    message: decision.log ?? decision.reason ?? "-", // Strategy debug log
    tradingDetail: isTest ? tradingDetail : success ? tradingDetail : undefined,
    tradingResult,
  };
}
