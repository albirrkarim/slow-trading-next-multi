import { binance } from "@/lib/exchange/platform/binance";
import type { Kline } from "@/lib/exchange/platform/tokocrypto";
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
  UnifiedFundingRate,
  UnifiedTicker,
  UnifiedWithdrawAssetParams,
  UnifiedWithdrawAssetResponse,
} from "../types";
import { UnifiedOrderSide, UnifiedOrderType, TradingMode } from "../types";
import { type BinanceFuturesOrder } from "@/lib/exchange/platform/binance/futures/order";
import {
  OrderSide as BinanceOrderSide,
  OrderType as BinanceOrderType,
  TimeInForce,
} from "@/lib/exchange/platform/binance/order/create";
import {
  formatBinanceBalanceError,
  notifyBinanceBalanceFailure,
} from "@/lib/exchange/platform/binance/balance-alert";
import { resolveStartTime } from "../utils";
import { getMarketCapUSDForSymbol } from "../market-cap";
import { tradeLog } from "@/lib/trading/helper/log";
import exchangeExit from "../ensure-closed";
import binanceFuturesFunding from "@/lib/exchange/platform/binance/futures/funding";
import binanceRequestCoordinator from "@/lib/exchange/platform/binance/request-coordinator";

/**
 * Binance Exchange Adapter
 * Binance uses BTCUSDT format (no underscore), converts to/from BTC_USDT
 * Supports spot, margin (cross/isolated), and futures trading
 */
export class BinanceExchange implements IExchange {
  readonly exchangeType = "binance" as const;
  readonly defaultTradingMode?: TradingMode;

  constructor(config?: ExchangeConfig) {
    this.defaultTradingMode = config?.defaultTradingMode;
  }

  ensureClosed(
    params: ExchangeEnsureClosedParams,
  ): Promise<ExchangeEnsureClosedResult> {
    return exchangeExit.ensureClosed(this, params);
  }

  /**
   * Normalize symbol from Binance format (BTCUSDT) to internal format (BTC_USDT)
   */
  normalizeSymbol(symbol: string): string {
    // If already has underscore, return as is
    if (symbol.includes("_")) {
      return symbol;
    }

    // Common quote assets to split on
    const quoteAssets = ["USDT", "BUSD", "USDC", "BNB", "BTC", "ETH"];
    for (const quote of quoteAssets) {
      if (symbol.endsWith(quote)) {
        const base = symbol.slice(0, -quote.length);
        return `${base}_${quote}`;
      }
    }

    // Fallback: assume last 4 chars are quote (e.g., USDT)
    const quote = symbol.slice(-4);
    const base = symbol.slice(0, -4);
    return `${base}_${quote}`;
  }

  /**
   * Denormalize symbol from internal format (BTC_USDT) to Binance format (BTCUSDT)
   */
  denormalizeSymbol(symbol: string): string {
    let s = symbol.replace(/_/g, "");
    
    // Auto-append USDT if the symbol is just the base asset (e.g. XLM)
    const quoteAssets = ["USDT", "BUSD", "USDC", "FDUSD", "BTC", "ETH", "BIDR", "IDRT", "BNB"];
    const hasQuote = quoteAssets.some(quote => s.endsWith(quote));
    
    if (!hasQuote) {
      s += "USDT";
    }
    
    return s;
  }

  /**
   * Get account balance for a trading pair
   */
  async getBalance(symbol: string): Promise<UnifiedBalance | null> {
    const binanceSymbol = this.denormalizeSymbol(symbol);
    const tradingMode = this.defaultTradingMode ?? TradingMode.SPOT;

    try {
      let balance: UnifiedBalance | null;

      if (this.defaultTradingMode === TradingMode.FUTURES) {
        const { getFuturesBalance } =
          await import("@/lib/exchange/platform/binance/futures/balance");
        // For Futures, we usually care about the quote asset (USDT) balance.
        let asset = "USDT";
        if (symbol.includes("_")) {
          asset = symbol.split("_")[1];
        } else if (symbol === "USDT") {
          asset = "USDT";
        }

        balance = await getFuturesBalance(asset);
      } else if (this.defaultTradingMode === TradingMode.MARGIN_CROSS) {
        const { getCrossMarginBalance } =
          await import("@/lib/exchange/platform/binance/margin/balance");
        balance = await getCrossMarginBalance(symbol);
      } else if (this.defaultTradingMode === TradingMode.MARGIN_ISOLATED) {
        const { getIsolatedMarginBalance } =
          await import("@/lib/exchange/platform/binance/margin/balance");
        balance = await getIsolatedMarginBalance(symbol);
      } else {
        balance = await binance.account.getBalance(binanceSymbol);
      }

      if (!balance) {
        notifyBinanceBalanceFailure({
          symbol,
          tradingMode,
          reason: "No balance data returned from Binance",
        });
      }

      return balance;
    } catch (error) {
      if (!binanceRequestCoordinator.error.isRateLimit(error)) {
        notifyBinanceBalanceFailure({
          symbol,
          tradingMode,
          reason: formatBinanceBalanceError(error),
        });
      }

      throw error;
    }
  }

  /**
   * Create a new order
   * Supports spot, margin, and futures trading modes
   */
  async createOrder(params: UnifiedOrderParams): Promise<UnifiedOrderResponse> {
    const binanceSymbol = this.denormalizeSymbol(params.symbol);
    const tradingMode =
      params.tradingMode || this.defaultTradingMode || TradingMode.SPOT;

    // Convert unified order side to Binance format
    const binanceSide =
      params.side === UnifiedOrderSide.BUY
        ? BinanceOrderSide.BUY
        : BinanceOrderSide.SELL;

    // Convert unified order type to Binance format
    let binanceOrderType: BinanceOrderType;
    if (params.type === UnifiedOrderType.MARKET) {
      binanceOrderType = BinanceOrderType.MARKET;
    } else if (params.type === UnifiedOrderType.LIMIT) {
      binanceOrderType = BinanceOrderType.LIMIT;
    } else if (params.type === UnifiedOrderType.STOP_LIMIT) {
      // Map to STOP_LOSS_LIMIT initially, will adjust type string in createFuturesOrder
      binanceOrderType = BinanceOrderType.STOP_LOSS_LIMIT;
    } else if (params.type === UnifiedOrderType.STOP_MARKET) {
      // Futures-only mapping; actual type string will be set in createFuturesOrder
      binanceOrderType = BinanceOrderType.STOP_LOSS;
    } else if (params.type === UnifiedOrderType.TAKE_PROFIT_LIMIT) {
      binanceOrderType = BinanceOrderType.TAKE_PROFIT_LIMIT;
    } else if (params.type === UnifiedOrderType.TAKE_PROFIT_MARKET) {
      // Futures-only mapping; actual type string will be set in createFuturesOrder
      binanceOrderType = BinanceOrderType.TAKE_PROFIT;
    } else {
      throw new Error(`Unsupported order type: ${params.type}`);
    }

    // Route to appropriate API based on trading mode
    if (tradingMode === TradingMode.FUTURES) {
      return this.createFuturesOrder(
        params,
        binanceSymbol,
        binanceSide,
        binanceOrderType,
      );
    } else if (
      tradingMode === TradingMode.MARGIN_CROSS ||
      tradingMode === TradingMode.MARGIN_ISOLATED
    ) {
      return this.createMarginOrder(
        params,
        binanceSymbol,
        binanceSide,
        binanceOrderType,
        tradingMode,
      );
    } else {
      return this.createSpotOrder(
        params,
        binanceSymbol,
        binanceSide,
        binanceOrderType,
      );
    }
  }

  /**
   * Withdraw an asset through Binance account APIs.
   */
  async withdrawAsset(
    params: UnifiedWithdrawAssetParams,
  ): Promise<UnifiedWithdrawAssetResponse> {
    const asset = String(params.asset || "")
      .trim()
      .toUpperCase();

    if (asset !== "USDT") {
      throw new Error(`Binance withdrawal is currently implemented only for USDT.`);
    }

    const response = await binance.account.withdrawUSDT({
      address: params.address,
      amountUSDT: params.amount,
      network: params.network,
      transferFromFutures: this.defaultTradingMode === TradingMode.FUTURES,
      withdrawOrderId: params.clientWithdrawId,
    });

    return {
      id: response.id,
      raw: response,
    };
  }

  /**
   * Create a spot order
   */
  private async createSpotOrder(
    params: UnifiedOrderParams,
    binanceSymbol: string,
    binanceSide: BinanceOrderSide,
    binanceOrderType: BinanceOrderType,
  ): Promise<UnifiedOrderResponse> {
    const binanceParams: any = {
      symbol: binanceSymbol,
      side: binanceSide,
      type: binanceOrderType,
    };

    // Handle quantity
    if (params.quantity !== undefined) {
      binanceParams.quantity = await this.formatQuantity(
        params.symbol,
        params.quantity,
      );
    }

    // Handle quote order quantity (for market buy)
    if (params.quoteOrderQty !== undefined) {
      binanceParams.quoteOrderQty = params.quoteOrderQty.toString();
    }

    // Add price and timeInForce for limit orders
    if (params.type === UnifiedOrderType.LIMIT) {
      if (!params.price) {
        throw new Error("Price is required for LIMIT orders");
      }
      binanceParams.price = await this.formatPrice(params.symbol, params.price);
      binanceParams.timeInForce = TimeInForce.GTC;
    }

    // Add client order ID if provided
    if (params.clientId) {
      binanceParams.newClientOrderId = params.clientId;
    }

    const response = await binance.order.createOrder(binanceParams);

    return {
      orderId: response.orderId.toString(),
      clientId: response.clientOrderId,
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      status: response.status,
      executedQty: parseFloat(response.executedQty || "0"),
      executedPrice:
        response.fills && response.fills.length > 0
          ? parseFloat(response.fills[0].price)
          : parseFloat(response.price || "0"),
      time: response.transactTime ?? Date.now(),
      tradingMode: TradingMode.SPOT,
      positionSide: "LONG",
      targetPrice: params.price || 0,
      quantity: response.origQty
        ? parseFloat(response.origQty)
        : params.quantity || 0,
      raw: response,
    };
  }

  /**
   * Create a margin order
   */
  private async createMarginOrder(
    params: UnifiedOrderParams,
    binanceSymbol: string,
    binanceSide: BinanceOrderSide,
    binanceOrderType: BinanceOrderType,
    tradingMode: TradingMode,
  ): Promise<UnifiedOrderResponse> {
    tradingMode =
      tradingMode || this.defaultTradingMode || TradingMode.MARGIN_ISOLATED;

    const binanceParams: any = {
      symbol: binanceSymbol,
      side: binanceSide,
      type: binanceOrderType,
      isIsolated: tradingMode === TradingMode.MARGIN_ISOLATED,
    };

    // Handle quantity
    if (params.quantity !== undefined) {
      binanceParams.quantity = await this.formatQuantity(
        params.symbol,
        params.quantity,
      );
    }

    // Handle quote order quantity (for market buy)
    if (params.quoteOrderQty !== undefined) {
      binanceParams.quoteOrderQty = params.quoteOrderQty.toString();
    }

    // Add price and timeInForce for limit orders
    if (params.type === UnifiedOrderType.LIMIT) {
      if (!params.price) {
        throw new Error("Price is required for LIMIT orders");
      }
      binanceParams.price = await this.formatPrice(params.symbol, params.price);
      binanceParams.timeInForce = TimeInForce.GTC;
    }

    // Add client order ID if provided
    if (params.clientId) {
      binanceParams.newClientOrderId = params.clientId;
    }

    let response;
    try {
      response = await binance.margin.createMarginOrder(binanceParams);
    } catch (error: any) {
      // Check for "Isolated margin account does not exist" error
      // Error code -11001: Isolated margin account does not exist.
      if (
        (error?.response?.data?.code === -11001 || error?.code === -11001) &&
        tradingMode === TradingMode.MARGIN_ISOLATED
      ) {
        tradeLog.log(
          `Isolated margin account for ${binanceSymbol} does not exist. creating...`,
        );

        const { createIsolatedMarginAccount } =
          await import("@/lib/exchange/platform/binance/margin/createAccount");
        const created = await createIsolatedMarginAccount(binanceSymbol);

        if (created) {
          tradeLog.log(
            `Isolated margin account created for ${binanceSymbol}. Retrying order in 2s...`,
          );
          // Wait for propagation
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Retry order
          response = await binance.margin.createMarginOrder(binanceParams);
        } else {
          throw error; // Re-throw if creation failed
        }
      } else {
        throw error; // Re-throw other errors
      }
    }

    return {
      orderId: response.orderId.toString(),
      clientId: response.clientOrderId,
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      status: response.status,
      executedQty: parseFloat(response.executedQty || "0"),
      executedPrice:
        response.fills && response.fills.length > 0
          ? parseFloat(response.fills[0].price)
          : parseFloat(response.price || "0"),
      time: response.transactTime ?? Date.now(),
      tradingMode, // Passed from createOrder
      positionSide: "LONG",
      targetPrice: params.price || 0,
      quantity: response.origQty
        ? parseFloat(response.origQty)
        : params.quantity || 0,
      raw: response,
    };
  }

  /**
   * Create a futures order
   */
  private async createFuturesOrder(
    params: UnifiedOrderParams,
    binanceSymbol: string,
    binanceSide: BinanceOrderSide,
    binanceOrderType: BinanceOrderType,
  ): Promise<UnifiedOrderResponse> {
    // Map Spot Enum types to specific Futures API strings if different
    let orderTypeString = binanceOrderType.toString();

    if (binanceOrderType === BinanceOrderType.STOP_LOSS_LIMIT) {
      orderTypeString = "STOP";
    } else if (
      binanceOrderType === BinanceOrderType.STOP_LOSS &&
      params.type === UnifiedOrderType.STOP_MARKET
    ) {
      orderTypeString = "STOP_MARKET";
    } else if (binanceOrderType === BinanceOrderType.TAKE_PROFIT_LIMIT) {
      orderTypeString = "TAKE_PROFIT";
    } else if (
      binanceOrderType === BinanceOrderType.TAKE_PROFIT &&
      params.type === UnifiedOrderType.TAKE_PROFIT_MARKET
    ) {
      orderTypeString = "TAKE_PROFIT_MARKET";
    }

    const binanceParams: any = {
      symbol: binanceSymbol,
      side: binanceSide,
      type: orderTypeString,
    };

    // Handle quantity
    if (params.quantity !== undefined) {
      binanceParams.quantity = await this.formatQuantity(
        params.symbol,
        params.quantity,
      );
    }

    // Add price and timeInForce for limit/algo orders
    if (
      params.type === UnifiedOrderType.LIMIT ||
      params.type === UnifiedOrderType.STOP_LIMIT ||
      params.type === UnifiedOrderType.TAKE_PROFIT_LIMIT
    ) {
      if (!params.price) {
        throw new Error(`Price is required for ${params.type} orders`);
      }
      binanceParams.price = await this.formatPrice(params.symbol, params.price);
      binanceParams.timeInForce = TimeInForce.GTC;
    }

    // Add stopPrice for algo orders
    if (params.stopPrice) {
      binanceParams.stopPrice = await this.formatPrice(
        params.symbol,
        params.stopPrice,
      );
    }

    // Add client order ID if provided
    if (params.clientId) {
      binanceParams.newClientOrderId = params.clientId;
    }

    if (params.reduceOnly !== undefined) {
      binanceParams.reduceOnly = params.reduceOnly;
    }

    const response = await binance.futures.createFuturesOrder(binanceParams);

    return {
      orderId: response.orderId.toString(),
      clientId: response.clientOrderId,
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      status: response.status,
      executedQty: parseFloat(response.executedQty || "0"),
      executedPrice: parseFloat(response.avgPrice || response.price || "0"),
      time: response.updateTime ?? Date.now(),
      tradingMode: TradingMode.FUTURES,
      positionSide: response.positionSide
        ? (response.positionSide.toUpperCase() as "LONG" | "SHORT" | "NET")
        : undefined,
      targetPrice: params.stopPrice || params.price || 0,
      quantity: response.origQty
        ? parseFloat(response.origQty)
        : params.quantity || 0,
      raw: response,
    };
  }

  /**
   * Get kline/candlestick data
   *
   * Logic:
   * - When marketType is defined: focus only on that market (no fallback)
   * - When marketType is NOT defined: try SPOT first, fallback to FUTURES if fails
   */
  async getKlines(params: UnifiedGetKlinesParams): Promise<Kline[]> {
    // console.log("we got params", params);

    const binanceSymbol = this.denormalizeSymbol(params.symbol);

    // Resolve time range
    let startTime = resolveStartTime(params);
    const endTime = params.endTime || Date.now();

    // If no time range specified but limit is given, calculate time range from limit
    // This allows simple calls like getKlines({ symbol, interval, limit: 10 })
    if (!startTime && params.limit) {
      const intervalMs = this.getIntervalMs(params.interval);
      startTime = endTime - intervalMs * params.limit;
    }

    // If still no startTime, throw error
    if (!startTime) {
      throw new Error(
        "startTime (or valid simpleTime or limit) is required for Binance",
      );
    }

    const klineParams = {
      symbol: binanceSymbol,
      interval: params.interval,
      startTime,
      endTime,
      limit: params.limit || 500,
    };

    // console.log("we send ", klineParams);

    // === When marketType is explicitly defined, focus only on that market ===
    if (params.marketType === "FUTURES") {
      // console.log(`[Binance] Using FUTURES API for ${binanceSymbol}`);
      const { getFuturesKlines } =
        await import("@/lib/exchange/platform/binance/futures/klines");
      return await getFuturesKlines(klineParams);
    }

    if (params.marketType === "SPOT") {
      // console.log(`[Binance] Using SPOT API for ${binanceSymbol}`);
      return await binance.market.getKlines(klineParams);
    }

    // console.log(
    //   `[Binance] No marketType, trying SPOT first for ${binanceSymbol}`,
    // );

    // === When marketType is NOT defined, try SPOT first, fallback to FUTURES ===
    try {
      const klines = await binance.market.getKlines(klineParams);

      // If Spot returns empty, try Futures
      if (Array.isArray(klines) && klines.length === 0) {
        tradeLog.log(
          `[Binance] Spot klines empty for ${binanceSymbol}, trying Futures...`,
        );
        const { getFuturesKlines } =
          await import("@/lib/exchange/platform/binance/futures/klines");
        return await getFuturesKlines(klineParams);
      }

      return klines;
    } catch (error: any) {
      // Check for Invalid Symbol error (code -1121), fallback to Futures
      if (
        error?.response?.data?.code === -1121 ||
        error?.code === -1121 ||
        error?.message?.includes("Invalid symbol")
      ) {
        tradeLog.log(
          `[Binance] Spot klines failed for ${binanceSymbol}, trying Futures...`,
        );
        const { getFuturesKlines } =
          await import("@/lib/exchange/platform/binance/futures/klines");
        return await getFuturesKlines(klineParams);
      }
      throw error;
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string, symbol?: string): Promise<boolean> {
    if (!symbol) {
      throw new Error("Binance requires symbol to cancel order");
    }

    const binanceSymbol = this.denormalizeSymbol(symbol);
    const response = await binance.order.cancelOrder({
      symbol: binanceSymbol,
      orderId: parseInt(orderId),
    });

    return response.status === "CANCELED" || response.status === "FILLED";
  }

  /**
   * Get fee calculator
   */
  getFees() {
    return getFeeCalculator("binance");
  }

  /**
   * Get minimum quantity and step size
   * Note: Binance requires exchange info API call, using reasonable defaults for now
   */
  async getMinQtyAndStepSize(
    symbol: string,
  ): Promise<{ minQty: number; stepSize: number }> {
    const binanceSymbol = this.denormalizeSymbol(symbol);

    // 1. Try to get real Futures info first
    try {
      const { getFuturesSymbolInfo } =
        await import("@/lib/exchange/platform/binance/futures/exchangeInfo");
      const info = await getFuturesSymbolInfo(binanceSymbol);
      if (info) {
        return info;
      }
    } catch {
      // Ignore specific futures fetch error and fall back
    }

    // 2. Fallback to defaults
    const [baseAsset] = binanceSymbol.match(/^([A-Z]+)/) || ["BTC"];

    // Default values based on common cryptocurrencies
    const defaults: Record<string, { minQty: number; stepSize: number }> = {
      BTC: { minQty: 0.001, stepSize: 0.001 }, // Adjusted defaults for futures safety if fetch fails
      ETH: { minQty: 0.01, stepSize: 0.01 },
      SOL: { minQty: 1, stepSize: 1 }, // SOL futures often 1
      BNB: { minQty: 0.01, stepSize: 0.01 },
      USDT: { minQty: 1, stepSize: 0.1 },
    };

    // Conservative default if unknown
    return defaults[baseAsset] || { minQty: 1, stepSize: 1 };
  }

  async adjustQuantity(quantity: number, symbol: string): Promise<number> {
    const { minQty, stepSize } = await this.getMinQtyAndStepSize(symbol);
    // Round down to nearest step size
    const rounded = Math.floor(quantity / stepSize) * stepSize;

    // Ensure it meets minimum quantity
    if (rounded < minQty) {
      return 0;
    }

    return rounded;
  }

  private countDecimals(val: number): number {
    if (!Number.isFinite(val)) return 0;
    if (Math.floor(val) === val) return 0;
    return val.toString().split(".")[1]?.length || 0;
  }

  private async formatQuantity(
    symbol: string,
    quantity: number,
  ): Promise<string> {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Invalid quantity for ${symbol}: ${quantity}`);
    }

    const { minQty, stepSize } = await this.getMinQtyAndStepSize(symbol);
    const rounded = Math.floor(quantity / stepSize) * stepSize;
    if (rounded < minQty || !Number.isFinite(rounded) || rounded <= 0) {
      throw new Error(`Quantity too small for ${symbol}: ${quantity}`);
    }

    const decimals = this.countDecimals(stepSize);
    return rounded.toFixed(decimals);
  }

  private async formatPrice(symbol: string, price: number): Promise<string> {
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Invalid price for ${symbol}: ${price}`);
    }

    const tickSize = await this.getTickSize(symbol);
    if (!Number.isFinite(tickSize) || tickSize <= 0) {
      return price.toString();
    }

    const rounded = Math.floor(price / tickSize) * tickSize;
    const decimals = this.countDecimals(tickSize);
    return rounded.toFixed(decimals);
  }

  /**
   * Get interval duration in milliseconds
   */
  private getIntervalMs(interval: string): number {
    const map: Record<string, number> = {
      "1m": 60_000,
      "3m": 180_000,
      "5m": 300_000,
      "15m": 900_000,
      "30m": 1_800_000,
      "1h": 3_600_000,
      "2h": 7_200_000,
      "4h": 14_400_000,
      "6h": 21_600_000,
      "8h": 28_800_000,
      "12h": 43_200_000,
      "1d": 86_400_000,
      "3d": 259_200_000,
      "1w": 604_800_000,
      "1M": 2_592_000_000,
    };
    return map[interval] || 60_000;
  }

  /**
   * Get price tick size
   */
  async getTickSize(symbol: string): Promise<number> {
    const binanceSymbol = this.denormalizeSymbol(symbol);

    try {
      const { getFuturesSymbolInfo } =
        await import("@/lib/exchange/platform/binance/futures/exchangeInfo");
      const info = await getFuturesSymbolInfo(binanceSymbol);
      if (
        info?.tickSize &&
        Number.isFinite(info.tickSize) &&
        info.tickSize > 0
      ) {
        return info.tickSize;
      }
    } catch {
      // Ignore and fall back to default
    }

    return 0.01;
  }

  async roundToTick(symbol: string, price: number): Promise<number> {
    if (!Number.isFinite(price) || price <= 0) return price;

    const tickSize = await this.getTickSize(symbol);
    if (!Number.isFinite(tickSize) || tickSize <= 0) return price;

    const rounded = Math.floor(price / tickSize) * tickSize;
    return parseFloat(rounded.toFixed(this.countDecimals(tickSize)));
  }

  /**
   * Get last order
   */
  async getLastOrder(_symbol: string): Promise<UnifiedOrderResponse | null> {
    // Stub pending full implementation
    return null;
  }

  /**
   * Set Leverage
   */
  async setLeverage(symbol: string, leverage: number): Promise<boolean> {
    const binanceSymbol = this.denormalizeSymbol(symbol);

    // Dynamically import to avoid circular dep if any, or just standard import
    // Note: Assuming this is primarily for Futures as Spot/Margin leverage works differently (borrow limit)
    const { setFuturesLeverage, setFuturesMarginType } =
      await import("@/lib/exchange/platform/binance/futures/leverage");

    // 1. Set Margin Type to ISOLATED (Default for this agent).
    // A failure must stop setup so the caller cannot place an order with unknown margin settings.
    const marginTypeSet = await setFuturesMarginType(
      binanceSymbol,
      "ISOLATED",
    );

    if (!marginTypeSet) {
      return false;
    }

    // 2. Set Leverage
    const success = await setFuturesLeverage(binanceSymbol, leverage);

    if (success) {
      tradeLog.log(`Set ${binanceSymbol} leverage to ${leverage}x (ISOLATED)`);
    }

    return success;
  }

  async getOpenOrders(
    symbol?: string,
    options?: { tradingMode?: TradingMode },
  ): Promise<UnifiedOrderResponse[]> {
    const binanceSymbol = symbol ? this.denormalizeSymbol(symbol) : undefined;
    const mode = options?.tradingMode || TradingMode.SPOT;

    if (mode === TradingMode.FUTURES) {
      const { requestPrivate } =
        await import("@/lib/exchange/platform/binance/utils");
      const FUTURES_BASE_URL = "https://fapi.binance.com";

      const queryParams: any = {};
      if (binanceSymbol) {
        queryParams.symbol = binanceSymbol;
      }

      const orders = await requestPrivate<BinanceFuturesOrder[]>(
        "/fapi/v1/openOrders",
        queryParams,
        "get",
        FUTURES_BASE_URL,
      );
      return orders.map((order) => this.mapFuturesOrder(order));
    }

    throw new Error("getOpenOrders not implemented for SPOT yet");
  }

  async getOrder(
    symbol: string,
    orderId: string,
    options?: { tradingMode?: TradingMode },
  ): Promise<UnifiedOrderResponse> {
    const binanceSymbol = this.denormalizeSymbol(symbol);
    const mode =
      options?.tradingMode || this.defaultTradingMode || TradingMode.SPOT;

    if (mode === TradingMode.FUTURES || mode === TradingMode.MARGIN_ISOLATED) {
      // Only Futures implemented manually right now.
      if (mode === TradingMode.FUTURES) {
        const { requestPrivate } =
          await import("@/lib/exchange/platform/binance/utils");
        const FUTURES_BASE_URL = "https://fapi.binance.com";
        const order = await requestPrivate<BinanceFuturesOrder>(
          "/fapi/v1/order",
          { symbol: binanceSymbol, orderId },
          "get",
          FUTURES_BASE_URL,
        );

        return this.mapFuturesOrder(order);
      }
    }

    // Spot Fallback
    throw new Error("getOrder not implemented for SPOT yet");
  }

  /**
   * Helper to map raw Binance Futures order to UnifiedOrderResponse
   */
  private mapFuturesOrder(order: BinanceFuturesOrder): UnifiedOrderResponse {
    let type = UnifiedOrderType.LIMIT;
    if (order.type === "MARKET") type = UnifiedOrderType.MARKET;
    else if (order.type === "STOP" || order.type === "STOP_LOSS_LIMIT")
      type = UnifiedOrderType.STOP_LIMIT;
    else if (order.type === "STOP_MARKET" || order.type === "STOP_LOSS")
      type = UnifiedOrderType.STOP_MARKET;
    else if (order.type === "TAKE_PROFIT" || order.type === "TAKE_PROFIT_LIMIT")
      type = UnifiedOrderType.TAKE_PROFIT_LIMIT;
    else if (
      order.type === "TAKE_PROFIT_MARKET" ||
      order.type === "TAKE_PROFIT_MKT"
    )
      type = UnifiedOrderType.TAKE_PROFIT_MARKET;

    return {
      orderId: order.orderId.toString(),
      clientId: order.clientOrderId,
      symbol: this.normalizeSymbol(order.symbol),
      side: order.side === "BUY" ? UnifiedOrderSide.BUY : UnifiedOrderSide.SELL,
      type,
      status: order.status,
      executedQty: parseFloat(order.executedQty || "0"),
      executedPrice: parseFloat(order.avgPrice || "0"),
      time: order.time || order.updateTime,
      tradingMode: TradingMode.FUTURES,
      positionSide: order.positionSide
        ? (order.positionSide.toUpperCase() as "LONG" | "SHORT" | "NET")
        : undefined,
      targetPrice:
        parseFloat(order.stopPrice || "0") || parseFloat(order.price || "0"),
      quantity: parseFloat(order.origQty || "0"),
      raw: order,
    };
  }

  /**
   * Repay margin loan (Not fully implemented)
   */
  async repay(
    _symbol: string,
    _amount: number,
    _currency: string,
    _options?: { tradingMode?: TradingMode; repayCurrency?: string },
  ): Promise<boolean> {
    throw new Error("repay is not supported by Binance adapter yet");
  }

  /**
   * Close entire position
   * For Binance Futures, we close by placing a market order in the opposite direction
   */
  async closePosition(
    symbol: string,
    options?: { tradingMode?: TradingMode },
  ): Promise<boolean> {
    const binanceSymbol = this.denormalizeSymbol(symbol);
    const mode =
      options?.tradingMode || this.defaultTradingMode || TradingMode.FUTURES;

    tradeLog.log("[Binance] Closing position for", symbol);

    if (mode === TradingMode.FUTURES) {
      const { requestPrivate } =
        await import("@/lib/exchange/platform/binance/utils");
      const FUTURES_BASE_URL = "https://fapi.binance.com";

      // Get current position to determine side and quantity
      const positions = await this.getPositions(symbol);
      const position = positions.find(
        (p) => p.originalSymbol === binanceSymbol,
      );

      if (!position || position.amount === 0) {
        tradeLog.log(`No open position found for ${symbol}`);
        throw new Error(`No open position found for ${symbol}`);
      }

      // Close position by placing opposite market order
      const closeSide = position.side === "LONG" ? "SELL" : "BUY";

      const orderParams = {
        symbol: binanceSymbol,
        side: closeSide,
        type: "MARKET",
        quantity: position.amount.toString(),
        reduceOnly: true, // Important: only close existing position
      };

      tradeLog.log(
        `[Binance] Closing ${position.side} position for ${symbol} with ${closeSide} order`,
      );

      await requestPrivate<any>(
        "/fapi/v1/order",
        orderParams,
        "post",
        FUTURES_BASE_URL,
      );

      tradeLog.log(`[Binance] Successfully closed position for ${symbol}`);
      return true;
    }

    throw new Error(`closePosition not implemented for trading mode: ${mode}`);
  }

  /**
   * Get open positions
   * Fetches position information from Binance Futures API
   */
  async getPositions(symbol?: string): Promise<UnifiedPosition[]> {
    const { requestPrivate } =
      await import("@/lib/exchange/platform/binance/utils");
    const FUTURES_BASE_URL = "https://fapi.binance.com";

    const queryParams: any = {};
    if (symbol) {
      queryParams.symbol = this.denormalizeSymbol(symbol);
    }

    // console.log("[Binance] Getting positions for", queryParams);

    const positions = await requestPrivate<any[]>(
      "/fapi/v2/positionRisk",
      queryParams,
      "get",
      FUTURES_BASE_URL,
    );

    // Filter out positions with zero amount and map to unified UnifiedPosition type
    return positions
      .filter((p: any) => parseFloat(p.positionAmt) !== 0)
      .map((p: any) => {
        const amount = Math.abs(parseFloat(p.positionAmt));
        let side: "LONG" | "SHORT" | "NET" = "NET";

        if (p.positionSide === "LONG" || parseFloat(p.positionAmt) > 0) {
          side = "LONG";
        } else if (
          p.positionSide === "SHORT" ||
          parseFloat(p.positionAmt) < 0
        ) {
          side = "SHORT";
        }

        const leverage = parseFloat(p.leverage);
        const notional = parseFloat(p.notional);
        const marginType = p.marginType?.toLowerCase() || "cross";

        // Calculate margin (Initial Margin)
        // If isolated, use isolatedWallet which is the margin assigned to this position
        // If cross, calculate based on leverage: size / leverage
        let marginUSDT = 0;
        if (marginType === "isolated" && p.isolatedWallet) {
          marginUSDT = parseFloat(p.isolatedWallet);
        } else {
          marginUSDT = Math.abs(notional) / leverage;
        }

        return {
          exchange: "binance",
          coin: p.symbol.replace("USDT", ""),
          symbol: this.normalizeSymbol(p.symbol),
          originalSymbol: p.symbol,
          side,
          amount,
          entryPrice: parseFloat(p.entryPrice),
          markPrice: parseFloat(p.markPrice),
          unrealizedPnL: parseFloat(p.unRealizedProfit),
          leverage,
          marginMode: marginType,
          liquidationPrice: parseFloat(p.liquidationPrice),
          marginUSDT,
          sizeUSDT: Math.abs(notional),
        };
      });
  }

  async getTickers({
    containSymbol = "USDT",
    marketType,
  }: {
    containSymbol?: string;
    marketType?: "SPOT" | "FUTURES";
  } = {}): Promise<UnifiedTicker[]> {
    let res: any[];

    if (marketType === "FUTURES") {
      const { getFuturesTickers } =
        await import("@/lib/exchange/platform/binance/futures/tickers");
      res = (await getFuturesTickers()) as any[];
    } else {
      res = (await binance.market.getTickers()) as any[];
    }

    // Normalize to array
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
        exchange: "binance" as const,
        coin: t.symbol.replace("USDT", ""),
        symbol: t.symbol,
        lastPrice: last,
        open24h: open,
        changePercent,
        volume: parseFloat(t.quoteVolume), // Unified usually prefers quote volume for ranking
        high24h: high,
        low24h: low,
        marketCap: 0,
      };
    });

    return tickers;
  }

  /** Gets the latest Binance USD-M perpetual funding rates in one request. */
  async getFundingRates(symbols?: string[]): Promise<UnifiedFundingRate[]> {
    return binanceFuturesFunding.latest.get(
      symbols?.map((symbol) => this.denormalizeSymbol(symbol)),
    );
  }

  /**
   * Get top gainers with verified volume
   */
  async getGainers({
    marketType,
    need = 10,
  }: {
    marketType?: "SPOT" | "FUTURES";
    need?: number;
  }): Promise<UnifiedTicker[]> {
    const { verifyAndFilterGainers } = await import("../utils");
    const tickers = await this.getTickers({
      containSymbol: "USDT",
      marketType,
    });

    return verifyAndFilterGainers(this, tickers, need, marketType);
  }

  async getMarketCap(symbol: string): Promise<number | null> {
    return getMarketCapUSDForSymbol(symbol);
  }
}

export const BinanceAdapter = BinanceExchange;
