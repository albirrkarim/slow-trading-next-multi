import { fetchKlinesFunction } from "@lib/datasets/fetchKlines";
import type { FetchKlinesFunction } from "@lib/datasets/type";
import type { Position } from "@/lib/trading/models";
import type { TradingFeeReturn } from "@lib/exchange/platform/tokocrypto";
import { calculateTradingFee, OrderSide, tokocrypto } from "@lib/exchange/platform/tokocrypto";
import { tradeLog } from "./log";
import { TRADE_MESSAGE } from "../message";
import { TradingMode, getExchange, type ExchangeType } from "@/lib/exchange";



interface GetLastPositionProps {
  symbol: string;
  baseAsset: number;
  fetchKlines?: FetchKlinesFunction;
}

/**
 * Get Real positions
 */
export async function getLastPosition({
  symbol,
  baseAsset,
  fetchKlines,
}: GetLastPositionProps) {
  // Reset position if last order exists but no baseAsset (USDT) left
  if (baseAsset === 0) {
    tradeLog.log(
      "Reset position! Reset position if last order exists but no baseAsset (USDT) left"
    );
    return null;
  }

  let currentPosition: Position | null = null;

  const lastOrder = await tokocrypto.order.getLastOrder(symbol);

  // No last order?
  if (!(lastOrder && parseFloat(lastOrder.executedQty) > 0)) {
    return null;
  }

  if (lastOrder.side === OrderSide.SELL) {
    return null;
  }

  // Recreate position from last executed order
  currentPosition = {
    symbol: symbol.split("_")[0],
    executionMode: "live",
    tradingMode: TradingMode.SPOT,
    direction: "LONG",
    opened: {
      t: lastOrder.createTime,
      vPoint: {
        id: String(lastOrder.orderId),
        lvl: 0,
      },
      reason: "UNKNOWN",
      message: `${TRADE_MESSAGE.buy.ENTRY} Recovered ${symbol} from exchange order ${lastOrder.orderId}`,
      price: parseFloat(lastOrder.executedPrice),
    },
    exposure: {
      averageEntryPrice: parseFloat(lastOrder.executedPrice),
      quantity: parseFloat(lastOrder.executedQty),
      notionalUsdt: parseFloat(lastOrder.executedQuoteQty),
      marginUsdt: parseFloat(lastOrder.executedQuoteQty),
      leverage: 1,
    },
    fees: { entryUsdt: 0 },
    strategy: {
      entry: { label: TRADE_MESSAGE.tokocrypto },
      averaging: {
        entryLevel: 0,
        lastHandledLevel: 0,
        reserveBaseMarginUsdt: parseFloat(lastOrder.executedQuoteQty),
        reservedRemainingMarginUsdt: 0,
        steps: [],
      },
    },
    pnl: {},
  };

  // tradeLog.log("lastOrder ", lastOrder);
  // tradeLog.log("Real currentPosition ", currentPosition);

  // const baseAssetSymbol = symbol.split("_")[0];
  // const asset = await tokocrypto.account.asset(baseAssetSymbol);

  // tradeLog.log("Asset ", asset);

  // // Theres no live asset from exchange
  // if (!asset) {
  //   tradeLog.warn("Actually theres no asset");
  //   return null;
  // }

  // Handle missing float point
  // if (asset && currentPosition != null) {
  //   if (asset.free < currentPosition.quantity) {
  //     currentPosition.quantity = asset.free;
  //   }
  // }

  // Have quantity but the value is too small. Its NOISE. just say we dont have that asset
  if (typeof fetchKlines == "function" && currentPosition) {
    // Reset position if the quantity value is bellow 1.5 USDT
    const candles = await fetchKlines({
      symbol,
      interval: "1m",
      simpleTime: "5minute", // likely 5 candles aggregated
    });
    const current = candles.at(-1); // Last candle is current market price

    if (current) {
      const priceInUSDT = currentPosition.exposure.quantity * parseFloat(current[4]);
      tradeLog.log("Price in USDT ", priceInUSDT);

      if (priceInUSDT < 1.5) {
        tradeLog.log("Reset position!");
        return null;
      }
    }
  }

  return currentPosition;
}

/**
 * Merges multiple positions into a single aggregated position.
 *
 * The merged position is calculated as:
 * - `entryPrice`: weighted average based on quantity
 * - `entryTime`: the earliest buy time among positions
 * - `quantity`: sum of all quantities
 * - `usdt`: sum of all USDT values
 *
 * @param {Position[]} positions - Array of positions to merge
 * @returns {Position} The merged/aggregated position
 *
 * @example
 * const merged = mergePositions([
 *   { entryPrice: 20000, entryTime: 1660000000000, quantity: 0.01, usdt: 200 },
 *   { entryPrice: 25000, entryTime: 1661000000000, quantity: 0.02, usdt: 500 }
 * ]);
 *
 * console.log(merged);
 * // {
 * //   entryPrice: 23333.33,
 * //   entryTime: 1660000000000,
 * //   quantity: 0.03,
 * //   usdt: 700
 * // }
 */
export function mergePositions(positions?: Position[]): Position | null {
  if (!positions) {
    // console.error("No positions to merge");
    return null;
  }

  if (positions.length === 0) {
    // console.error("No positions to merge");
    return null;
  }

  let totalQuantity = 0;
  let totalUSDT = 0;
  let weightedPriceSum = 0;
  let earliestPosition = positions[0];
  const categories = [];

  for (const pos of positions) {
    totalQuantity += pos.exposure.quantity;
    totalUSDT += pos.exposure.notionalUsdt;
    weightedPriceSum += pos.exposure.averageEntryPrice * pos.exposure.quantity;

    if (pos.opened.t < earliestPosition.opened.t) {
      earliestPosition = pos;
    }
    categories.push(pos.strategy.entry.label);
  }

  return {
    ...positions[0],
    opened: { ...earliestPosition.opened },
    exposure: {
      ...positions[0].exposure,
      averageEntryPrice:
        totalQuantity > 0 ? weightedPriceSum / totalQuantity : 0,
      quantity: totalQuantity,
      notionalUsdt: totalUSDT,
      marginUsdt: positions.reduce(
        (total, position) => total + position.exposure.marginUsdt,
        0,
      ),
    },
    fees: {
      entryUsdt: positions.reduce(
        (total, position) => total + position.fees.entryUsdt,
        0,
      ),
      estimatedExitUsdt: positions.reduce(
        (total, position) =>
          total + (position.fees.estimatedExitUsdt ?? 0),
        0,
      ),
    },
    strategy: {
      ...positions[0].strategy,
      entry: {
        ...positions[0].strategy.entry,
        label: categories.filter(Boolean).join(", "),
      },
    },
    pnl: {},
    closed: undefined,
  };
}

/**
 * Fetches the current balance and USDT valuation of a specific asset from the exchange.
 *
 * This function retrieves the free (available) balance for a given symbol
 * and calculates its equivalent value in USDT using current market prices.
 * For USDT itself, the value is 1:1.
 *
 * @param {string} symbol - The asset symbol to query (e.g., "BTC", "ETH", "USDT").
 * @returns {Promise<{symbol: string, quantity: number, usdtValue: number, currentPrice: number} | null>}
 *   Object containing symbol, quantity, USDT value, and current price, or null if asset not found.
 *
 * @example
 * const btcAsset = await getAssetWithValue("BTC");
 * console.log(btcAsset);
 * // { symbol: "BTC", quantity: 0.5, usdtValue: 21500, currentPrice: 43000 }
 *
 * @example
 * const usdtAsset = await getAssetWithValue("USDT");
 * console.log(usdtAsset);
 * // { symbol: "USDT", quantity: 1000, usdtValue: 1000, currentPrice: 1 }
 */
export async function getAssetWithValue(symbol: string) {
  const asset = await tokocrypto.account.asset(symbol);

  if (!asset) {
    return null;
  }

  if (symbol === "USDT") {
    return {
      symbol,
      quantity: asset.free,
      usdtValue: asset.free,
      currentPrice: 1,
    };
  }

  const tradingSymbol = `${symbol}_USDT`;

  const candles = await fetchKlinesFunction({
    symbol: tradingSymbol,
    interval: "1m",
    simpleTime: "5minute",
  });

  const current = candles.at(-1) ?? [];
  const currentPrice = parseFloat(current[4] ?? "0");
  const usdtValue = parseFloat((asset.free * currentPrice).toFixed(2));

  return {
    symbol,
    quantity: asset.free,
    usdtValue,
    currentPrice,
    tradingSymbol,
  };
}

export interface CalculateProfitReturn {
  /**
   * Percentage
   */
  netProfitPercent: number;

  netProfitPercentWithLeverage: number;

  /**
   * USDT
   */
  net: number;
  /**
   *
   */
  sellFee: TradingFeeReturn;
  /**
   */
  buyFee: TradingFeeReturn;
}

/**
 * Calculates net profit/loss and fees for an open position at current market price.
 *
 * This function computes:
 * - Gross value of position (quantity × current price)
 * - Trading fees for both entry (BUY) and exit (SELL)
 * - Net proceeds after fees
 * - Net profit percentage relative to cost basis
 *
 * **Note**: Uses adjusted quantity for SELL to comply with exchange min/step rules.
 *
 * @param {Position} currentPosition - The open position to evaluate.
 * @param {number} currentPrice - Current market price of the asset.
 * @param {string} tradingSymbol - Trading pair symbol (e.g., "BTC_USDT").
 * @returns {Promise<CalculateProfitReturn>} Object with net profit, percentage, and fee breakdowns.
 *
 * @example
 * const position = { entryPrice: 40000, quantity: 0.5, ... };
 * const result = await calculateProfit(position, 42000, "BTC_USDT");
 * console.log(`Net Profit: $${result.net.toFixed(2)}`);
 * console.log(`Return: ${result.netProfitPercent.toFixed(2)}%`);
 * console.log(`Total Fees: $${(result.buyFee.tradingFeeTotal + result.sellFee.tradingFeeTotal).toFixed(2)}`);
 */
export async function calculateProfit(
  currentPosition: Position,
  currentPrice: number,
  tradingSymbol: string
): Promise<CalculateProfitReturn> {
  const exchangeType = (currentPosition.strategy.entry.label as ExchangeType) || "tokocrypto";
  const exchange = getExchange(exchangeType);

  // A. BUY fee
  const buyFee = calculateTradingFee({
    tradeQty: currentPosition.exposure.quantity,
    side: "buy",
    currentPrice,
  });

  // B. SELL fee
  const sellQuantity = await exchange.adjustQuantity(
    currentPosition.exposure.quantity,
    tradingSymbol
  );

  const sellFee = calculateTradingFee({
    tradeQty: currentPosition.exposure.quantity,
    side: "sell",
    currentPrice,
  });

  // Gross value of position (quantity * current price)
  const gross = sellQuantity * currentPrice;

  // Net proceeds
  const net = gross - sellFee.tradingFeeTotal - buyFee.tradingFeeTotal;

  // Cost basis
  const costBasis = currentPosition.exposure.averageEntryPrice * sellQuantity;

  // Net profit/loss %
  const netProfitPercent = parseFloat(
    (((net - costBasis) / costBasis) * 100).toFixed(2)
  );

  return {
    netProfitPercent,
    netProfitPercentWithLeverage: netProfitPercent * (currentPosition.exposure.leverage || 1),
    net,
    sellFee,
    buyFee,
  };
}
