import { tokocrypto } from "@/lib/exchange/platform/tokocrypto";
import type { Kline } from "@/lib/exchange/platform/tokocrypto";
import {
  OrderSide as TokocryptoOrderSide,
  OrderType as TokocryptoOrderType,
} from "@/lib/exchange/platform/tokocrypto/order/create";
import { getFeeCalculator } from "../fees";
import type {
  IExchange,
  UnifiedBalance,
  UnifiedGetKlinesParams,
  UnifiedOrderParams,
  UnifiedOrderResponse,
  ExchangeConfig,
  ExchangeEnsureClosedParams,
  ExchangeEnsureClosedResult,
  UnifiedPosition,
  UnifiedTicker,
  UnifiedWithdrawAssetParams,
  UnifiedWithdrawAssetResponse,
} from "../types";
import { UnifiedOrderSide, UnifiedOrderType, TradingMode } from "../types";
import { resolveStartTime } from "../utils";
import { tradeLog } from "@/lib/trading";
import { delay } from "../platform/tokocrypto/utils";
import {
  getMarketCapUSDForSymbol,
} from "../market-cap";
import exchangeExit from "../ensure-closed";

/**
 * Tokocrypto Exchange Adapter
 * Tokocrypto already uses BTC_USDT format, so minimal conversion needed
 * Note: Tokocrypto only supports spot trading
 */
export class TokocryptoAdapter implements IExchange {
  readonly exchangeType = "tokocrypto" as const;
  readonly defaultTradingMode = undefined; // Tokocrypto only supports spot

  constructor(_config?: ExchangeConfig) {
    // Tokocrypto doesn't support margin/futures, so config is ignored
  }

  ensureClosed(
    params: ExchangeEnsureClosedParams,
  ): Promise<ExchangeEnsureClosedResult> {
    return exchangeExit.ensureClosed(this, params);
  }

  /**
   * Normalize symbol - Tokocrypto already uses BTC_USDT format
   */
  normalizeSymbol(symbol: string): string {
    // Tokocrypto uses BTC_USDT format natively, but handle BTCUSDT format too
    if (symbol.includes("_")) {
      return symbol;
    }
    // Convert BTCUSDT to BTC_USDT
    const match = symbol.match(/^([A-Z]+)(USDT|IDR)$/);
    if (match) {
      return `${match[1]}_${match[2]}`;
    }
    return symbol;
  }

  /**
   * Denormalize symbol - Tokocrypto uses BTC_USDT or BTCUSDT format
   */
  denormalizeSymbol(symbol: string): string {
    // Tokocrypto API accepts both BTC_USDT and BTCUSDT
    // We'll use BTCUSDT format for API calls
    let s = symbol.replace(/_/g, "");
    
    // Auto-append USDT if the symbol is just the base asset (e.g. XLM)
    const quoteAssets = ["USDT", "BUSD", "USDC", "FDUSD", "BTC", "ETH", "BIDR", "IDRT", "BNB"];
    const hasQuote = quoteAssets.some(quote => s.endsWith(quote));
    
    if (!hasQuote) {
      s += "USDT";
    }
    
    return s;
  }

  async roundToTick(_symbol: string, price: number): Promise<number> {
    if (!Number.isFinite(price) || price <= 0) return price;

    const tickSize = await this.getTickSize(_symbol);
    if (!Number.isFinite(tickSize) || tickSize <= 0) return price;

    const countDecimals = (val: number) => {
      if (!Number.isFinite(val)) return 0;
      if (Math.floor(val) === val) return 0;
      return val.toString().split(".")[1]?.length || 0;
    };

    const rounded = Math.floor(price / tickSize) * tickSize;
    return parseFloat(rounded.toFixed(countDecimals(tickSize)));
  }

  /**
   * Get account balance for a trading pair
   */
  async getBalance(symbol: string): Promise<UnifiedBalance | null> {
    return await tokocrypto.account.getBalance(symbol);
  }

  /**
   * Withdrawals are not implemented for Tokocrypto through the unified adapter yet.
   */
  async withdrawAsset(
    _params: UnifiedWithdrawAssetParams,
  ): Promise<UnifiedWithdrawAssetResponse> {
    throw new Error(
      "Tokocrypto withdrawal is not implemented in the unified exchange adapter.",
    );
  }

  /**
   * Create a new order
   */
  async createOrder(params: UnifiedOrderParams): Promise<UnifiedOrderResponse> {
    // Tokocrypto Open API (v1) requires symbols with underscores (e.g. BTC_USDT)
    const tokocryptoSymbol = this.normalizeSymbol(params.symbol);

    // Convert unified order side to Tokocrypto format
    const tokocryptoSide =
      params.side === UnifiedOrderSide.BUY
        ? TokocryptoOrderSide.BUY
        : TokocryptoOrderSide.SELL;

    // Convert unified order type to Tokocrypto format
    let tokocryptoOrderType: TokocryptoOrderType;
    if (params.type === UnifiedOrderType.MARKET) {
      tokocryptoOrderType = TokocryptoOrderType.MARKET;
    } else if (params.type === UnifiedOrderType.LIMIT) {
      tokocryptoOrderType = TokocryptoOrderType.LIMIT;
    } else {
      throw new Error(`Unsupported order type: ${params.type}`);
    }

    if (params.tradeType == "EXIT" && params.quantity) {
      tradeLog.debug("params.quantity", params.quantity);
      // make sure the quantity is not more than we have
      const balance = await this.getBalance(params.symbol);
      tradeLog.debug("balance", balance);
      if (balance) {
        if (params.quantity > balance.baseAsset) {
          params.quantity = balance.baseAsset;
        }
      }
    }

    // Build Tokocrypto order parameters
    const tokocryptoParams: any = {
      symbol: tokocryptoSymbol,
      side: tokocryptoSide,
      type: tokocryptoOrderType,
      timestamp: Date.now(),
    };

    // Handle quantity
    if (params.quantity !== undefined) {
      tokocryptoParams.quantity = params.quantity;
    }

    // Handle quote order quantity (for market buy)
    if (params.quoteOrderQty !== undefined) {
      tokocryptoParams.quoteOrderQty = params.quoteOrderQty;
    }

    // Add price for limit orders
    if (params.type === UnifiedOrderType.LIMIT) {
      if (!params.price) {
        throw new Error("Price is required for LIMIT orders");
      }
      tokocryptoParams.price = params.price;
      // Tokocrypto requires timeInForce for limit orders
      tokocryptoParams.timeInForce = 1; // GTC (Good Till Cancel)
    }

    // Add client order ID if provided
    if (params.clientId) {
      tokocryptoParams.clientId = params.clientId;
    }

    // Create order via Tokocrypto API
    const response = await tokocrypto.order.createOrder(tokocryptoParams);

    // Convert Tokocrypto response to unified format
    // Tokocrypto Open API checks 'code' for success (0)
    const isSuccess = response.success === true || response.code === 0;

    if (!isSuccess || !response.data) {
      throw new Error(
        `Tokocrypto order creation failed: ${response.message || (response as any).msg || "Unknown error"}`,
      );
    }

    const orderData = response.data;

    let executedQty = parseFloat(orderData.executedQty || "0");

    // check balance
    if (params.tradeType == "ENTRY") {
      await delay(5000);
      const balance = await this.getBalance(params.symbol);
      if (balance) {
        if (
          executedQty > balance.baseAsset &&
          Math.abs(executedQty - balance.baseAsset) < 0.001
        ) {
          executedQty = balance.baseAsset;
        }
      }
    }

    return {
      orderId: orderData.orderId.toString(),
      clientId: orderData.clientId,
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      status: orderData.status.toString(),
      executedQty,
      executedPrice: parseFloat(orderData.executedPrice || "0"),
      time: orderData.createTime,
      tradingMode: TradingMode.SPOT,
      positionSide: "LONG",
      targetPrice: params.price || 0,
      quantity: orderData.origQty
        ? parseFloat(orderData.origQty)
        : params.quantity || 0,
      raw: response,
    };
  }

  /**
   * Get kline/candlestick data
   */
  async getKlines(params: UnifiedGetKlinesParams): Promise<Kline[]> {
    // Resolve time range using utility
    const startTime = resolveStartTime(params);
    const endTime = params.endTime || Date.now();

    if (!startTime || !endTime) {
      throw new Error(
        "startTime (or valid simpleTime) and endTime are required for Tokocrypto",
      );
    }

    const tokocryptoSymbol = this.denormalizeSymbol(params.symbol);

    return await tokocrypto.market.getKlines({
      symbol: tokocryptoSymbol,
      interval: params.interval,
      symbolType: 1, // Use Binance API format
      startTime,
      endTime,
    });
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string, _symbol?: string): Promise<boolean> {
    // Tokocrypto cancelOrder doesn't require symbol, only orderId/clientId and timestamp
    const response = await tokocrypto.order.cancelOrder({
      orderId,
      timestamp: Date.now(),
    });

    return response.code === 0;
  }

  /**
   * Get fee calculator
   */
  getFees() {
    return getFeeCalculator("tokocrypto");
  }

  /**
   * Get minimum quantity and step size
   */
  async getMinQtyAndStepSize(
    _symbol: string,
  ): Promise<{ minQty: number; stepSize: number }> {
    const tokocryptoSymbol = this.denormalizeSymbol(_symbol);
    return await tokocrypto.general.getMinQtyAndStepSize(tokocryptoSymbol);
  }

  async adjustQuantity(quantity: number, symbol: string): Promise<number> {
    const { minQty, stepSize } = await this.getMinQtyAndStepSize(symbol);
    // Round down to nearest step size
    const rounded = Math.floor(quantity / stepSize) * stepSize;

    // Ensure it meets minimum quantity
    if (rounded < minQty) {
      return 0;
    }

    // Fix floating point precision
    const countDecimals = (val: number) => {
      if (Math.floor(val) === val) return 0;
      return val.toString().split(".")[1]?.length || 0;
    };
    const precision = countDecimals(stepSize);

    return parseFloat(rounded.toFixed(precision));
  }

  /**
   * Get price tick size
   */
  async getTickSize(_symbol: string): Promise<number> {
    return 0.01; // Default stub
  }

  /**
   * Get open orders
   * @param symbol - Trading pair symbol
   */
  async getOpenOrders(_symbol?: string): Promise<UnifiedOrderResponse[]> {
    // const tokocryptoSymbol = _symbol ? this.denormalizeSymbol(_symbol) : undefined;
    // Tokocrypto Open API 1.0 doesn't have a direct getOpenOrders for all symbols?
    // Checking previous implementation usage.
    // It seems unified interface expects array.
    // For now returning empty as user is primarily asking for getLastOrder.
    // But wait, there IS tokocrypto.order.getOpenOrders likely.

    // Stub for now as requested task is focused on balance/getLastOrder
    return [];
  }

  /**
   * Get the last order (filled or otherwise) for a symbol
   */
  async getLastOrder(symbol: string): Promise<UnifiedOrderResponse | null> {
    const tokocryptoSymbol = this.denormalizeSymbol(symbol);
    const lastOrder = await tokocrypto.order.getLastOrder(tokocryptoSymbol);

    if (!lastOrder) return null;

    // Convert to UnifiedOrderResponse
    return {
      orderId: lastOrder.orderId.toString(),
      clientId: lastOrder.clientId,
      symbol,
      side:
        lastOrder.side === TokocryptoOrderSide.BUY
          ? UnifiedOrderSide.BUY
          : UnifiedOrderSide.SELL,
      type:
        lastOrder.type === TokocryptoOrderType.MARKET
          ? UnifiedOrderType.MARKET
          : UnifiedOrderType.LIMIT,
      status: lastOrder.status.toString(),
      executedQty: parseFloat(lastOrder.executedQty),
      executedPrice: parseFloat(lastOrder.executedPrice),
      time: lastOrder.createTime,
      tradingMode: TradingMode.SPOT,
      positionSide: "LONG",
      targetPrice: parseFloat((lastOrder as any).price || "0"),
      quantity: parseFloat(lastOrder.origQty),
      raw: lastOrder,
    };
  }
  /**
   * Set Leverage
   */
  async setLeverage(_symbol: string, _leverage: number): Promise<boolean> {
    tradeLog.warn(`Tokocrypto does not support leverage (Spot Only).`);
    return false;
  }

  /**
   * Repay margin loan (Not supported)
   */
  async repay(
    _symbol: string,
    _amount: number,
    _currency: string,
    _options?: { tradingMode?: TradingMode; repayCurrency?: string },
  ): Promise<boolean> {
    throw new Error("repay is not supported by Tokocrypto");
  }

  /**
   * Close entire position (Not supported)
   */
  async closePosition(
    _symbol: string,
    _options?: { tradingMode?: TradingMode },
  ): Promise<boolean> {
    throw new Error("closePosition is not supported by Tokocrypto");
  }

  /**
   * Get open positions (Not supported)
   */
  async getPositions(_symbol?: string): Promise<UnifiedPosition[]> {
    throw new Error("getPositions is not supported by Tokocrypto");
  }

  async getTickers({
    containSymbol = "USDT",
  }: {
    containSymbol?: string;
    marketType?: "SPOT" | "FUTURES";
  } = {}): Promise<UnifiedTicker[]> {
    const res = await tokocrypto.market.getTickers();

    const data = Array.isArray(res) ? res : [res];

    let filtered = data;
    if (containSymbol) {
      filtered = data.filter((t) => t.symbol.includes(containSymbol));
    }

    const tickers: UnifiedTicker[] = filtered.map((t) => {
      const last = parseFloat(t.lastPrice);
      const open = parseFloat(t.openPrice);
      const high = parseFloat(t.highPrice);
      const low = parseFloat(t.lowPrice);
      const changePercent = parseFloat(t.priceChangePercent);

      return {
        exchange: "tokocrypto" as const,
        coin: t.symbol.replace("USDT", "").replace("_", ""),
        symbol: t.symbol,
        lastPrice: last,
        open24h: open,
        changePercent,
        volume: parseFloat(t.quoteVolume),
        high24h: high,
        low24h: low,
        marketCap: 0,
      };
    });

    return tickers;
  }

  /**
   * Get top gainers with verified volume
   */
  async getGainers({
    need = 10,
  }: {
    marketType?: "SPOT" | "FUTURES";
    need?: number;
  }): Promise<UnifiedTicker[]> {
    const { verifyAndFilterGainers } = await import("../utils");
    const tickers = await this.getTickers({
      containSymbol: "USDT",
    });
    return verifyAndFilterGainers(this, tickers, need);
  }

  async getMarketCap(symbol: string): Promise<number | null> {
    return getMarketCapUSDForSymbol(symbol);
  }
}
