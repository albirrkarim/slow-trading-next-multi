import { okx } from "@/lib/exchange/platform/okx";
import type { Kline } from "@/lib/exchange/platform/tokocrypto";
import type { IntervalKlines } from "@/lib/exchange/platform/tokocrypto/market/klines";
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
import { type OKXOrder } from "@/lib/exchange/platform/okx/order/query";
import { type OKXAlgoOrder } from "@/lib/exchange/platform/okx/order/algo";
import {
  OrderSide as OKXOrderSide,
  OrderType as OKXOrderType,
  TradeMode,
} from "@/lib/exchange/platform/okx/order/create";
import {
  createAlgoOrder,
  getAlgoOpenOrders,
  AlgoOrderType,
} from "@/lib/exchange/platform/okx/order/algo";
import { AccountType } from "@/lib/exchange/platform/okx/asset/transfer";
import { delay } from "../platform/okx/utils";
import { MAX_KLINES_PER_CALL } from "../constants";
import { getMarketCapUSDForSymbol } from "../market-cap";
import { tradeLog } from "@/lib/trading/helper/log";
import exchangeExit from "../ensure-closed";

/**
 * OKX Exchange Adapter
 * Converts between OKX API format and unified format
 * Supports spot, cross margin, and isolated margin trading
 */
export class OKXAdapter implements IExchange {
  readonly exchangeType = "okx" as const;
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
   * Helper to check funds in Funding account and transfer to Trading account if needed.
   * This is specific to OKX and used for testing/setup.
   * @param symbol - Trading pair symbol (e.g. XAUT_USDT)
   */
  async checkAndTransferFunds(symbol: string): Promise<void> {
    const okxSymbol = this.denormalizeSymbol(symbol);
    const [baseAsset] = okxSymbol.split("-");

    const fundingAsset = await okx.asset.getFundingAsset(baseAsset);
    const fundingAvailable = fundingAsset?.available || 0;

    tradeLog.log(`Checking funds for ${baseAsset}...`);
    tradeLog.log(`- Funding Account: ${fundingAvailable}`);

    if (fundingAvailable > 0) {
      tradeLog.log(
        "Found funds in Funding Account. Transferring to Trading Account...",
      );
      const transferRes = await okx.asset.transferFunds(
        baseAsset,
        fundingAvailable.toString(),
        AccountType.FUNDING,
        AccountType.TRADING,
      );

      if (transferRes.code === "0") {
        tradeLog.log("Transfer successful.");
        // Wait for balance to reflect
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        tradeLog.error("Transfer failed:", transferRes);
        throw new Error(`Transfer failed: ${transferRes.msg}`);
      }
    } else {
      tradeLog.log("No funds in Funding Account to transfer.");
    }
  }

  /**
   * Convert unified TradingMode to OKX TradeMode
   */
  private getOKXTradeMode(tradingMode?: TradingMode): TradeMode {
    const mode = tradingMode || this.defaultTradingMode || TradingMode.SPOT;

    switch (mode) {
      case TradingMode.SPOT:
        return TradeMode.CASH;
      case TradingMode.MARGIN_CROSS:
        return TradeMode.CROSS;
      case TradingMode.MARGIN_ISOLATED:
        return TradeMode.ISOLATED;
      case TradingMode.FUTURES:
        // OKX doesn't use tdMode for futures, but we'll use ISOLATED as fallback
        // Futures would typically use a different instrument type (SWAP)
        return TradeMode.ISOLATED;
      default:
        return TradeMode.CASH;
    }
  }

  /**
   * Normalize symbol from OKX format (BTC-USDT) to internal format (BTC_USDT)
   */
  normalizeSymbol(symbol: string): string {
    return symbol.replace(/-/g, "_");
  }

  /**
   * Denormalize symbol from internal format (BTC_USDT) to OKX format (BTC-USDT)
   */
  denormalizeSymbol(symbol: string): string {
    let s = symbol.replace(/_/g, "-");
    const isFutures = this.defaultTradingMode === TradingMode.FUTURES;
    if (isFutures && !s.endsWith("-SWAP")) {
      s += "-SWAP";
    }
    return s;
  }

  async roundToTick(symbol: string, price: number): Promise<number> {
    if (!Number.isFinite(price) || price <= 0) return price;

    const tickSize = await this.getTickSize(symbol);
    if (!Number.isFinite(tickSize) || tickSize <= 0) return price;

    const rounded = Math.floor(price / tickSize) * tickSize;
    return parseFloat(rounded.toFixed(10));
  }

  /**
   * Get account balance for a trading pair
   */
  async getBalance(symbol: string): Promise<UnifiedBalance | null> {
    const okxSymbol = this.denormalizeSymbol(symbol);

    // Check if it's a single asset query (e.g. "USDT")
    // If symbol has no dash (after denormalize? denormalize adds -SWAP if futures.
    // But if we pass "USDT", denormalize might turn it to "USDT-SWAP".
    // We should check the original symbol or handle the "USDT" case explicitly before denormalizing
    // OR allow denormalize to work and then check.

    // Better: If symbol is "USDT" or similar currency, treated as single asset.
    const isSingleAsset = !symbol.includes("_") && !symbol.includes("-");

    if (isSingleAsset) {
      // Try getting balance for this single asset
      const asset = symbol.toUpperCase();

      // Fetch Trading Balance Asset Detail directly
      const tradingAsset = await okx.account.getAsset(asset);

      const fundingAsset = await okx.asset.getFundingAsset(asset);

      let total = 0;
      let available = 0;
      let frozen = 0;

      // Trading
      if (tradingAsset) {
        total += tradingAsset.available + tradingAsset.frozen;
        available += tradingAsset.available;
        frozen += tradingAsset.frozen;
      }

      // Funding
      if (fundingAsset) {
        total += fundingAsset.available + fundingAsset.frozen;
        available += fundingAsset.available;
        frozen += fundingAsset.frozen;
      }

      if (total === 0 && available === 0) return null;

      return {
        baseAsset: 0,
        quoteAsset: available, // For simple display, treating as quote
        total,
        available,
        frozen,
      };
    }

    const [baseAsset, quoteAsset] = okxSymbol.split("-");

    // Fetch Trading Account Balance (Unified Account)
    const tradingBalance = await okx.account.getBalance(okxSymbol);

    // Fetch Funding Account Assets
    const fundingBase = await okx.asset.getFundingAsset(baseAsset);
    const fundingQuote = await okx.asset.getFundingAsset(quoteAsset);

    // Initial values from trading balance or 0
    let totalBase = tradingBalance?.baseAsset || 0;
    let totalQuote = tradingBalance?.quoteAsset || 0;

    // Add Funding Account balances
    if (fundingBase) {
      totalBase += fundingBase.available;
    }
    if (fundingQuote) {
      totalQuote += fundingQuote.available;
    }

    // Return combined balance
    if (!tradingBalance && !fundingBase && !fundingQuote) {
      return null;
    }

    return {
      baseAsset: totalBase,
      quoteAsset: totalQuote,
      total: totalQuote, // Simplified total as quote asset amount
      available: totalQuote, // Simplified, ideally check specific available
      frozen: 0, // Simplified
    };
  }

  /**
   * Withdrawals are not implemented for OKX through the unified adapter yet.
   */
  async withdrawAsset(
    _params: UnifiedWithdrawAssetParams,
  ): Promise<UnifiedWithdrawAssetResponse> {
    throw new Error("OKX withdrawal is not implemented in the unified exchange adapter.");
  }

  /**
   * Create a new order
   */
  async createOrder(params: UnifiedOrderParams): Promise<UnifiedOrderResponse> {
    const okxSymbol = this.denormalizeSymbol(params.symbol);

    // Convert unified order side to OKX format
    const okxSide =
      params.side === UnifiedOrderSide.BUY
        ? OKXOrderSide.BUY
        : OKXOrderSide.SELL;

    // Handle Algo Orders (STOP_LIMIT, STOP_MARKET, TAKE_PROFIT_LIMIT, TAKE_PROFIT_MARKET)
    if (
      params.type === UnifiedOrderType.STOP_LIMIT ||
      params.type === UnifiedOrderType.STOP_MARKET ||
      params.type === UnifiedOrderType.TAKE_PROFIT_LIMIT ||
      params.type === UnifiedOrderType.TAKE_PROFIT_MARKET
    ) {
      if (!params.stopPrice) {
        throw new Error("Stop Price is required for Algo orders");
      }

      const algoParams: any = {
        instId: okxSymbol,
        tdMode: this.getOKXTradeMode(params.tradingMode),
        side: okxSide,
        ordType: AlgoOrderType.CONDITIONAL, // generic conditional
        reduceOnly: params.reduceOnly,
        posSide: params.positionSide,
      };

      if (params.closePosition) {
        algoParams.closeFraction = "1"; // 100% close
      } else {
        algoParams.sz = params.quantity?.toString() || "0";
      }

      // Map parameters based on specific Algo Type
      if (
        params.type === UnifiedOrderType.TAKE_PROFIT_LIMIT ||
        params.type === UnifiedOrderType.TAKE_PROFIT_MARKET
      ) {
        // Take Profit Mapping
        algoParams.tpTriggerPx = params.stopPrice.toString(); // Trigger
        algoParams.tpOrdPx =
          params.type === UnifiedOrderType.TAKE_PROFIT_LIMIT
            ? params.price?.toString()
            : "-1"; // Limit price or -1 for Market
      } else {
        // Stop Loss Mapping
        algoParams.slTriggerPx = params.stopPrice.toString(); // Trigger
        algoParams.slOrdPx =
          params.type === UnifiedOrderType.STOP_LIMIT
            ? params.price?.toString()
            : "-1"; // Limit price or -1 for Market
      }

      // Handle Qty Conversion (Contracts) same as standard
      // ... (rest of logic follows)

      // Qty Adjustment Logic (duplicate of standard order for now, arguably should refactor)
      // For now, assume params.quantity is correct or let it fail if not adjusted.
      // Ideally call this.adjustQuantity logic or similar.
      // But let's reuse the logic below if we can? No, structure is different.
      // Let's copy specific Futures Qty logic if needed.
      // For simplicity in this "make function" task, we assume generic quantity handling or simple string.
      // However, Futures need contract conversion.
      // I'll add basic Futures contract conversion here if needed.
      if (!params.closePosition) {
        if (
          (okxSymbol.endsWith("-SWAP") || okxSymbol.endsWith("-FUTURES")) &&
          params.quantity
        ) {
          // Basic fallback: just use quantity as string, user provided contract qty?
          // Or better: Re-use the logic below by refactoring?
          // Refactoring is risky.
          // I will duplicate the contract conversion logic briefly for robustness.
          try {
            const info = await okx.market.getInstrumentInfo(okxSymbol);
            if (info && (info as any).ctVal) {
              // const ctVal = parseFloat((info as any).ctVal);
              // If tradeType is ENTRY we convert, if EXIT we assume checks.
              // THIS IS AN EXIT (STOP LOSS).
              // For EXIT, UnifiedOrderParams quantity usually means "contracts" for Futures if user holds contracts?
              // Or user holds Base Asset amount?
              // The `ActivePosition` has `quantity` as "Contract size" (number of contracts).
              // So if `makeTPandSL` passes `position.quantity`, it is ALREADY contracts.
              // Standard createOrder below has logic: "Only for entry order... conversion".
              // "In exit order we use quantity as it is".
              // So for EXIT (SL), we just pass sz directly!
              algoParams.sz = params.quantity.toString();
            } else {
              algoParams.sz = params.quantity.toString();
            }
          } catch (e) {
            tradeLog.error("Failed to get instrument info", e);
            algoParams.sz = params.quantity.toString();
          }
        } else {
          algoParams.sz = params.quantity?.toString();
        }
      }

      const response = await createAlgoOrder(algoParams);

      if (
        response.code !== "0" ||
        !response.data ||
        response.data.length === 0
      ) {
        throw new Error(`OKX Algo Order failed: ${response.msg}`);
      }

      const algoData = response.data[0];

      return {
        orderId: algoData.algoId,
        clientId: algoData.clOrdId,
        symbol: params.symbol,
        side: params.side,
        type: params.type,
        status: "NEW", // Algo order starts as new/live
        executedQty: 0,
        executedPrice: 0,
        time: Date.now(),
        tradingMode: params.tradingMode,
        positionSide: params.positionSide
          ? (params.positionSide.toUpperCase() as any)
          : undefined,
        targetPrice: params.stopPrice || 0,
        quantity: parseFloat(algoParams.sz || "0"),
        raw: response,
      };
    }

    // Convert unified order type to OKX format
    let okxOrderType: OKXOrderType;
    if (params.type === UnifiedOrderType.MARKET) {
      okxOrderType = OKXOrderType.MARKET;
    } else if (params.type === UnifiedOrderType.LIMIT) {
      okxOrderType = OKXOrderType.LIMIT;
    } else {
      throw new Error(`Unsupported order type: ${params.type}`);
    }

    // when its spot we must check real quantity that we actually have
    if (
      params.tradingMode === TradingMode.SPOT &&
      okxSide === OKXOrderSide.SELL &&
      params.quantity
    ) {
      const balance = await this.getBalance(params.symbol);
      if (balance) {
        if (balance.baseAsset < params.quantity) {
          params.quantity = balance.baseAsset;
        }
      }
    }

    // Build OKX order parameters
    const okxParams: any = {
      instId: okxSymbol,
      tdMode: this.getOKXTradeMode(params.tradingMode),
      side: okxSide,
      ordType: okxOrderType,
    };

    // For Isolated Margin, we must specify the margin currency (ccy)
    if (okxParams.tdMode === "isolated") {
      const parts = okxSymbol.split("-");
      // Check if it's a swap/future
      const isSwap =
        okxSymbol.endsWith("-SWAP") || okxSymbol.endsWith("-FUTURES");

      if (isSwap) {
        // For USDT-M Swaps, margin is USDT. For Coin-M, it's the coin.
        // Heuristic: Check if symbol contains USDT
        if (okxSymbol.includes("USDT")) {
          okxParams.ccy = "USDT";
        } else {
          // Assume Coin-M (e.g. BTC-USD-SWAP), margin is Base Asset
          okxParams.ccy = parts[0];
        }
      } else {
        // Spot Margin
        // Buy -> Quote Asset (e.g. investing USDT to buy SUI)
        // Sell -> Base Asset (e.g. selling SUI)
        // For USDT-based trading (Single-currency margin), we typically use the Quote asset (USDT) as margin/collateral
        // even for Shorts (borrowing Base asset against USDT collateral).
        const quote = parts[1];
        okxParams.ccy = quote;
      }
    }

    // Handle quantity - OKX uses base asset quantity (Spot) or Contracts (Futures)
    if (params.quantity !== undefined) {
      if (okxSymbol.endsWith("-SWAP") || okxSymbol.endsWith("-FUTURES")) {
        // Futures/Swap: sz is number of contracts
        try {
          const info = await okx.market.getInstrumentInfo(okxSymbol);

          // Only for entry order, in exit order we use quantity as it is. because it become contract quantity
          if (info && (info as any).ctVal && params.tradeType === "ENTRY") {
            const ctVal = parseFloat((info as any).ctVal); // contract value
            const lotSz = parseFloat((info as any).lotSz || "1"); // lot size
            const minSz = parseFloat((info as any).minSz || "0"); // min size of order

            // console.log("ctVal", ctVal);
            // console.log("lotSz", lotSz);
            // console.log("minSz", minSz);

            const rawContracts = params.quantity / ctVal;
            // Round down to nearest lotSz
            const contracts = Math.floor(rawContracts / lotSz) * lotSz;

            // Fix floating point precision (OKX usually accepts clean floats)
            const countDecimals = (val: number) => {
              if (Math.floor(val) === val) return 0;
              return val.toString().split(".")[1]?.length || 0;
            };
            const precision = countDecimals(lotSz);
            const finalContracts = parseFloat(contracts.toFixed(precision));

            tradeLog.log(
              `[OKX] createOrder: Futures conversion. Qty=${params.quantity}, ctVal=${ctVal}, lotSz=${lotSz} -> Contracts=${finalContracts}`,
            );

            if (finalContracts < minSz) {
              // Only throw if strictly below minSz
              throw new Error(
                `Quantity ${params.quantity} -> ${finalContracts} contracts is too small (Min ${minSz})`,
              );
            }

            if (finalContracts === 0) {
              throw new Error(
                `Quantity ${params.quantity} results in 0 contracts (ctVal=${ctVal})`,
              );
            }

            okxParams.sz = finalContracts.toString();
          } else {
            // Fallback (likely error if ctVal needed but not found)
            tradeLog.warn(
              "[OKX] createOrder: ctVal not found for Futures symbol " +
                okxSymbol,
            );
            okxParams.sz = params.quantity.toString();
          }
        } catch (e) {
          tradeLog.warn("Failed to fetch info for contract size conversion", e);
          // If the error was our own validation error, rethrow it
          if (e instanceof Error && e.message.includes("too small")) {
            throw e;
          }
          okxParams.sz = params.quantity.toString();
        }
      } else {
        // Spot: sz is base asset quantity
        // Validate minimum quantity if possible
        try {
          const info = await okx.market.getInstrumentInfo(okxSymbol);

          if (info && (info as any).minSz) {
            const minSz = parseFloat((info as any).minSz);
            if (params.quantity < minSz) {
              throw new Error(
                `Quantity ${params.quantity} is too small for Spot (Min ${minSz})`,
              );
            }
          }
        } catch (e) {
          // If error is our validation, rethrow
          if (e instanceof Error && e.message.includes("too small")) {
            throw e;
          }
          tradeLog.warn("Failed to validate spot min quantity", e);
        }
        okxParams.sz = params.quantity.toString();
      }
    } else if (params.quoteOrderQty !== undefined) {
      // For market buy with quote quantity, we need to calculate base quantity
      // This is a limitation - OKX requires base quantity
      // We'll use quoteOrderQty as sz for now, but this may need adjustment
      okxParams.sz = params.quoteOrderQty.toString();
    } else {
      throw new Error("Either quantity or quoteOrderQty must be provided");
    }

    // Add price for limit orders
    if (params.type === UnifiedOrderType.LIMIT) {
      if (!params.price) {
        throw new Error("Price is required for LIMIT orders");
      }
      okxParams.px = params.price.toString();
    }

    // Add client order ID if provided
    if (params.clientId) {
      okxParams.clOrdId = params.clientId;
    }

    // Add reduceOnly if provided
    if (params.reduceOnly !== undefined) {
      okxParams.reduceOnly = params.reduceOnly;
    }

    // Add positionSide if provided
    if (params.positionSide) {
      okxParams.posSide = params.positionSide;
    }

    // Create order via OKX API
    const response = await okx.order.createOrder(okxParams);

    // Convert OKX response to unified format
    if (response.code !== "0" || !response.data || response.data.length === 0) {
      tradeLog.log("okxParams", okxParams);
      tradeLog.log("response", response);

      let message = response.msg || "Unknown error";

      if (response.data.length > 0) {
        message += "\n" + response.data[0].sMsg;
      }

      throw new Error(`OKX order creation failed: ${message}`);
    }

    const orderData = response.data[0];

    // Fetch updated order info to get executed details (especially for Market orders)
    let executedQty = 0;
    let executedPrice = 0;

    // Only fetch if it's a market order or explicitely needed, to avoid latency on Limit orders
    // But since interface requires numbers, we should try.
    try {
      const orderInfo = await okx.order.getOrder(okxSymbol, orderData.ordId);
      if (
        orderInfo.code === "0" &&
        orderInfo.data &&
        orderInfo.data.length > 0
      ) {
        const details = orderInfo.data[0];
        // OKX V5: accFillSz is total executed qty, avgPx is average price
        if (details.accFillSz) {
          executedQty = parseFloat(details.accFillSz);
        } else if (details.fillSz) {
          executedQty = parseFloat(details.fillSz);
        }

        if (details.avgPx) {
          executedPrice = parseFloat(details.avgPx);
        }
      }
    } catch (e) {
      tradeLog.warn("[OKX] Failed to fetch executed details immediately", e);
    }

    // im not sure the executedQty is correct for market orders
    if (
      params.tradingMode === TradingMode.SPOT &&
      okxSide === OKXOrderSide.BUY &&
      params.quantity
    ) {
      await delay(1000);
      const balance = await this.getBalance(params.symbol);
      if (balance) {
        if (balance.baseAsset < executedQty) {
          executedQty = balance.baseAsset;
        }
      }
    }

    return {
      orderId: orderData.ordId,
      clientId: orderData.clOrdId,
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      status: orderData.sCode,
      executedQty,
      executedPrice,
      time: Date.now(),
      tradingMode:
        params.tradingMode === TradingMode.FUTURES
          ? TradingMode.FUTURES
          : TradingMode.SPOT,
      positionSide: params.side === UnifiedOrderSide.BUY ? "LONG" : "SHORT",
      targetPrice: params.price || 0,
      quantity:
        params.quantity || parseFloat((orderData as any).sz || "0") || 0,
      raw: response,
    };
  }

  /**
   * Get kline/candlestick data
   *
   * Logic:
   * - When marketType is "FUTURES": ensure symbol has -SWAP suffix
   * - When marketType is "SPOT": use base symbol (remove -SWAP if present)
   * - When marketType is NOT defined: use symbol as-is
   */
  async getKlines(params: UnifiedGetKlinesParams): Promise<Kline[]> {
    let okxSymbol = this.denormalizeSymbol(params.symbol);

    // Adjust symbol based on marketType
    if (params.marketType === "FUTURES") {
      // Ensure symbol has -SWAP suffix for futures
      if (!okxSymbol.endsWith("-SWAP") && !okxSymbol.endsWith("-FUTURES")) {
        okxSymbol = `${okxSymbol}-SWAP`;
      }
    } else if (params.marketType === "SPOT") {
      // Remove -SWAP or -FUTURES suffix for spot
      okxSymbol = okxSymbol.replace(/-SWAP$/, "").replace(/-FUTURES$/, "");
    }

    // Convert interval format if needed
    // OKX uses uppercase (1H, 1D) while Tokocrypto uses lowercase (1h, 1d)
    let okxBar: string = params.interval;
    const intervalMap: Record<string, string> = {
      "1m": "1m",
      "3m": "3m",
      "5m": "5m",
      "15m": "15m",
      "30m": "30m",
      "1h": "1H",
      "2h": "2H",
      "4h": "4H",
      "6h": "6H",
      "8h": "6H", // OKX doesn't have 8h, use 6H
      "12h": "12H",
      "1d": "1D",
      "3d": "3D",
      "1w": "1W",
      "1M": "1M",
    };
    okxBar = intervalMap[params.interval] || params.interval.toUpperCase();

    // OKX API:
    // after: Pagination of data to return records earlier than the requested ts.
    // before: Pagination of data to return records newer than the requested ts.
    // To get data between startTime and endTime, we effectively want data *ending* at endTime and going backwards

    // Resolve time range using utility
    // const startTime = params.startTime;
    const endTime = params.endTime;

    const okxParams = {
      instId: okxSymbol,
      bar: okxBar as any,
      limit: params.limit || MAX_KLINES_PER_CALL["okx"],
      after: endTime, // Get data older than endTime
    };

    const okxResponse = await okx.market.getKlines(okxParams);

    if (okxResponse.code !== "0" || !okxResponse.data) {
      throw new Error(
        `OKX klines fetch failed: ${okxResponse.msg || "Unknown error"}`,
      );
    }

    // Convert OKX kline format to unified format
    // OKX: [timestamp, open, high, low, close, volume, volumeCcy, volumeCcyQuote, confirm]
    // Unified (Tokocrypto): [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBaseVolume, takerBuyQuoteVolume, humanTime]
    return okxResponse.data
      .map((okxKline) => {
        const timestamp = parseInt(okxKline[0]);
        // const open = parseFloat(okxKline[1]);
        // const high = parseFloat(okxKline[2]);
        // const low = parseFloat(okxKline[3]);
        // const close = parseFloat(okxKline[4]);
        // const volume = parseFloat(okxKline[5]);
        // const quoteVolume = parseFloat(okxKline[7] || "0");

        // Calculate close time (approximate - add interval duration)
        const intervalMs = this.getIntervalMs(params.interval);
        const closeTime = timestamp + intervalMs - 1;

        // Create unified kline format
        // We'll use minimal required fields, others can be 0 or empty
        return [
          timestamp, // openTime
          okxKline[1], // open (string)
          okxKline[2], // high (string)
          okxKline[3], // low (string)
          okxKline[4], // close (string)
          okxKline[5], // volume (string)
          closeTime, // closeTime
          okxKline[7] || "0", // quoteVolume (string)
          0, // trades (number)
          "0", // takerBuyBaseVolume (string)
          "0", // takerBuyQuoteVolume (string)
          "", // ignore (string)
          new Date(timestamp).toISOString().replace("T", " ").slice(0, 19), // humanTime
        ] as Kline;
      })
      .reverse();
  }

  /**
   * Get open orders
   * @param symbol - Trading pair symbol
   */
  async getOpenOrders(symbol?: string): Promise<UnifiedOrderResponse[]> {
    const okxSymbol = symbol ? this.denormalizeSymbol(symbol) : "";
    // Use the exposed function from okx.order
    const response = await okx.order.getOpenOrders(okxSymbol);

    if (response.code !== "0" || !response.data) {
      throw new Error(
        `OKX open orders fetch failed: ${response.msg || "Unknown error"}`,
      );
    }

    const [standardOrders, algoOrdersResponse] = await Promise.all([
      response.data.map((order: any) => this.mapOrder(order, symbol)),
      getAlgoOpenOrders(okxSymbol || undefined).catch((e) => {
        tradeLog.warn(`[OKX] Failed to fetch algo orders: ${e.message}`);
        return { code: "error", data: [] };
      }),
    ]);

    const algoOrders = (algoOrdersResponse?.data || []).map((order) =>
      this.mapOrder(order, symbol),
    );

    return [...standardOrders, ...algoOrders];
  }

  async getOrder(
    symbol: string,
    orderId: string,
    // options?: { tradingMode?: TradingMode },
  ): Promise<UnifiedOrderResponse> {
    const okxSymbol = this.denormalizeSymbol(symbol);

    const response = await okx.order.getOrder(okxSymbol, orderId);

    if (response.code !== "0" || !response.data || response.data.length === 0) {
      throw new Error(`Order not found: ${response.msg || response.code}`);
    }

    return this.mapOrder(response.data[0], symbol);
  }

  /**
   * Get the last order (filled or otherwise) for a symbol
   */
  async getLastOrder(symbol: string): Promise<UnifiedOrderResponse | null> {
    const okxSymbol = this.denormalizeSymbol(symbol);

    // Determine instrument type
    let instType = "SPOT";
    if (this.defaultTradingMode === TradingMode.FUTURES) {
      instType = "SWAP";
    } else if (
      this.defaultTradingMode === TradingMode.MARGIN_CROSS ||
      this.defaultTradingMode === TradingMode.MARGIN_ISOLATED
    ) {
      instType = "MARGIN";
    }

    // Override if symbol explicitly contains SWAP
    if (okxSymbol.endsWith("-SWAP")) {
      instType = "SWAP";
    }

    // Fetch order history (limit 1)
    const response = await okx.order.getHistoryOrders(okxSymbol, "1", instType);

    if (response.code !== "0" || !response.data || response.data.length === 0) {
      return null;
    }

    return this.mapOrder(response.data[0], symbol);
  }

  /**
   * Helper to map raw OKX order to UnifiedOrderResponse
   */
  private mapOrder(
    order: OKXOrder | OKXAlgoOrder,
    symbol?: string,
  ): UnifiedOrderResponse {
    const isAlgo = "algoId" in order;

    let side = UnifiedOrderSide.BUY;
    if (order.side === "sell") side = UnifiedOrderSide.SELL;

    let type = UnifiedOrderType.LIMIT;
    if (order.ordType === "market") type = UnifiedOrderType.MARKET;

    // Algo specific mapping
    if (isAlgo) {
      const algoOrder = order as OKXAlgoOrder;
      type = UnifiedOrderType.STOP_LIMIT; // Default

      if (algoOrder.tpTriggerPx && parseFloat(algoOrder.tpTriggerPx) > 0) {
        type =
          algoOrder.tpOrdPx === "-1"
            ? UnifiedOrderType.TAKE_PROFIT_MARKET
            : UnifiedOrderType.TAKE_PROFIT_LIMIT;
      } else if (
        algoOrder.slTriggerPx &&
        parseFloat(algoOrder.slTriggerPx) > 0
      ) {
        type =
          algoOrder.slOrdPx === "-1"
            ? UnifiedOrderType.STOP_MARKET
            : UnifiedOrderType.STOP_LIMIT;
      } else if (algoOrder.triggerPx && parseFloat(algoOrder.triggerPx) > 0) {
        type =
          algoOrder.ordPx === "-1"
            ? UnifiedOrderType.STOP_MARKET
            : UnifiedOrderType.STOP_LIMIT;
      }
    }

    const price = isAlgo
      ? parseFloat(
          (order as OKXAlgoOrder).tpTriggerPx ||
            (order as OKXAlgoOrder).slTriggerPx ||
            (order as OKXAlgoOrder).triggerPx ||
            "0",
        )
      : parseFloat((order as OKXOrder).px || "0");

    const executedQty = isAlgo
      ? 0
      : parseFloat((order as OKXOrder).fillSz || "0");
    const executedPrice = isAlgo
      ? 0
      : parseFloat((order as OKXOrder).avgPx || "0");
    const status = isAlgo
      ? order.state === "live"
        ? "NEW"
        : order.state
      : order.state;
    const time = parseInt(
      (isAlgo ? order.cTime : (order as OKXOrder).uTime) ||
        Date.now().toString(),
    );

    return {
      orderId: isAlgo
        ? (order as OKXAlgoOrder).algoId
        : (order as OKXOrder).ordId,
      clientId: order.clOrdId,
      symbol: symbol || this.normalizeSymbol(order.instId),
      side,
      type,
      status,
      executedQty,
      executedPrice,
      time,
      tradingMode:
        order.tdMode === "cash" ? TradingMode.SPOT : TradingMode.FUTURES,
      positionSide: order.posSide
        ? (order.posSide.toUpperCase() as "LONG" | "SHORT" | "NET")
        : undefined,
      targetPrice: price,
      quantity: parseFloat(order.sz || "0"),
      raw: order,
    };
  }

  /**
   * Get interval duration in milliseconds
   */
  private getIntervalMs(interval: IntervalKlines): number {
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
      "12h": 43_200_000,
      "1d": 86_400_000,
      "3d": 259_200_000,
      "1w": 604_800_000,
      "1M": 2_592_000_000,
    };
    return map[interval] || 60_000;
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string, symbol?: string): Promise<boolean> {
    if (!symbol) {
      throw new Error("OKX requires symbol to cancel order");
    }

    const okxSymbol = this.denormalizeSymbol(symbol);
    const response = await okx.order.cancelOrder({
      instId: okxSymbol,
      ordId: orderId,
    });

    return response.code === "0";
  }

  /**
   * Get fee calculator
   */
  getFees() {
    return getFeeCalculator("okx");
  }

  /**
   * Get minimum quantity and step size
   * Note: OKX doesn't have a direct equivalent, so we'll need to implement this
   * For now, return reasonable defaults
   */
  async getMinQtyAndStepSize(
    symbol: string,
  ): Promise<{ minQty: number; stepSize: number }> {
    const okxSymbol = this.denormalizeSymbol(symbol);
    tradeLog.log(`[OKX] getMinQtyAndStepSize: ${symbol} -> ${okxSymbol}`);

    try {
      const info = await okx.market.getInstrumentInfo(okxSymbol);
      // console.log(`[OKX] Instrument Info for ${okxSymbol}:`, info);

      if (info) {
        let minQr = parseFloat(info.minSz);
        let stepQr = parseFloat(info.lotSz);

        // For Futures/Swap, size is in contracts, we need to convert to base asset
        const isFutures =
          okxSymbol.endsWith("-SWAP") || okxSymbol.endsWith("-FUTURES");
        if (isFutures && (info as any).ctVal) {
          const ctVal = parseFloat((info as any).ctVal);
          tradeLog.log(`[OKX] Futures conversion ctVal: ${ctVal}`);
          minQr = minQr * ctVal;
          stepQr = stepQr * ctVal;
        }

        tradeLog.log(
          `[OKX] Resolved limits: minQty=${minQr}, stepSize=${stepQr}`,
        );

        return {
          minQty: minQr,
          stepSize: stepQr,
        };
      }
    } catch (e) {
      tradeLog.warn("Failed to fetch instrument info, using defaults", e);
    }

    const [baseAsset] = okxSymbol.split("-");

    // Default values based on common cryptocurrencies
    const defaults: Record<string, { minQty: number; stepSize: number }> = {
      BTC: { minQty: 0.00001, stepSize: 0.00000001 },
      ETH: { minQty: 0.0001, stepSize: 0.0000001 },
      SOL: { minQty: 0.01, stepSize: 0.0001 },
      USDT: { minQty: 1, stepSize: 0.01 },
    };

    return defaults[baseAsset] || { minQty: 0.0001, stepSize: 0.0000001 };
  }

  async adjustQuantity(quantity: number, symbol: string): Promise<number> {
    const { minQty, stepSize } = await this.getMinQtyAndStepSize(symbol);
    // Round down to nearest step size
    const rounded = Math.floor(quantity / stepSize) * stepSize;

    // Ensure it meets minimum quantity
    if (rounded < minQty) {
      return 0;
    }

    // Fix floating point issues
    // Use a safety precision (e.g. 10 decimals) or derive from stepSize
    return parseFloat(rounded.toFixed(10));
  }

  /**
   * Get price tick size for a symbol
   */
  async getTickSize(symbol: string): Promise<number> {
    const okxSymbol = this.denormalizeSymbol(symbol);
    try {
      const info = await okx.market.getInstrumentInfo(okxSymbol);
      if (info) {
        return parseFloat(info.tickSz);
      }
    } catch (e) {
      tradeLog.warn("Failed to fetch tick size, using default", e);
    }
    return 0.01; // Default fallback
  }

  /**
   * Set Leverage
   */
  async setLeverage(symbol: string, leverage: number): Promise<boolean> {
    const okxSymbol = this.denormalizeSymbol(symbol);
    // Determine margin mode based on default trading mode or default to 'cross'
    // Ideally this should be configurable per call or derived better, but for now we look at the adapter mode
    let mgnMode: "cross" | "isolated" = "cross";
    if (
      this.defaultTradingMode === TradingMode.MARGIN_ISOLATED ||
      this.defaultTradingMode === TradingMode.FUTURES
    ) {
      mgnMode = "isolated";
    }

    const ok = await okx.account.setLeverage(
      okxSymbol,
      leverage.toString(),
      mgnMode,
    );

    if (!ok) {
      tradeLog.warn(
        `[OKX] setLeverage failed for ${okxSymbol} lev=${leverage} mgnMode=${mgnMode}`,
      );
    }

    return ok;
    // ... existing code ...
  }

  /**
   * Repay margin loan
   */
  async repay(
    symbol: string,
    amount: number,
    currency: string,
    options?: { tradingMode?: TradingMode; repayCurrency?: string },
  ): Promise<boolean> {
    const okxSymbol = this.denormalizeSymbol(symbol);
    const tradingMode =
      options?.tradingMode ||
      this.defaultTradingMode ||
      TradingMode.MARGIN_ISOLATED;
    const mgnMode =
      this.getOKXTradeMode(tradingMode) === TradeMode.ISOLATED
        ? "isolated"
        : "cross";

    tradeLog.log(
      `[OKX] Repaying ${amount} ${currency} for ${okxSymbol} (${mgnMode})...`,
    );

    const res = await okx.account.repay({
      ccy: currency,
      amt: amount.toString(),
      instId: mgnMode === "isolated" ? okxSymbol : undefined,
      mgnMode,
      repayCurrency: options?.repayCurrency,
    });

    if (res.code === "0") {
      tradeLog.log("[OKX] Repayment successful.");
      return true;
    } else {
      tradeLog.error("[OKX] Repayment failed:", res);
      throw new Error(`Repayment failed: ${res.msg}`);
    }
  }

  /**
   * Close entire position
   */
  async closePosition(
    symbol: string,
    options?: { tradingMode?: TradingMode },
  ): Promise<boolean> {
    const okxSymbol = this.denormalizeSymbol(symbol);
    const tradingMode =
      options?.tradingMode ||
      this.defaultTradingMode ||
      TradingMode.MARGIN_ISOLATED;
    const mgnMode =
      this.getOKXTradeMode(tradingMode) === TradeMode.ISOLATED
        ? "isolated"
        : "cross";

    tradeLog.log(`[OKX] Closing position for ${okxSymbol} (${mgnMode})...`);

    // Determine margin currency for isolated mode (usually quote currency for Spot Margin)
    let ccy: string | undefined;
    if (mgnMode === "isolated") {
      const parts = okxSymbol.split("-");
      if (parts.length > 1) {
        ccy = parts[1]; // Use Quote currency (e.g. USDT)
      }
    }

    const res = await okx.trade.closePosition({
      instId: okxSymbol,
      mgnMode: mgnMode === "isolated" ? "isolated" : "cross",
      ccy,
    });

    if (res.code === "0") {
      tradeLog.log("[OKX] Close position successful.");
      return true;
    } else {
      tradeLog.error("[OKX] Close position failed:", res);
      throw new Error(`Close position failed: ${res.msg}`);
    }
  }

  /**
   * Get open positions
   */
  async getPositions(symbol?: string): Promise<UnifiedPosition[]> {
    const okxSymbol = symbol ? this.denormalizeSymbol(symbol) : undefined;

    // Fetch positions. Use INST_TYPE="MARGIN" if symbol is not provided?
    // Or just fetch specific symbol if provided.
    const res = await okx.account.getPositions({
      instId: okxSymbol,
      // instType: "MARGIN" // Optional?
    });

    if (res.code !== "0") {
      throw new Error(`Get positions failed: ${res.msg}`);
    }

    return res.data.map((p) => {
      let side: "LONG" | "SHORT" | "NET" = "NET";
      let amount = parseFloat(p.pos);
      const entryPrice = parseFloat(p.avgPx);

      // For Margin Isolated:
      // If there is a liability (liab < 0), it acts as a Short.
      // pos usually represents the collateral (quote ccy) in this case.
      if (p.liab && parseFloat(p.liab) < 0) {
        amount = Math.abs(parseFloat(p.liab));
        side = "SHORT";
      } else if (p.posSide === "long") {
        side = "LONG";
      } else if (p.posSide === "short") {
        side = "SHORT";
      } else if (p.posSide === "net") {
        if (parseFloat(p.pos) > 0) side = "LONG";
        else if (parseFloat(p.pos) < 0) side = "SHORT";
      }

      return {
        exchange: "okx",
        coin: this.normalizeSymbol(p.instId).split("_")[0], // normalizeSymbol returns BTC_USDT
        symbol: this.normalizeSymbol(p.instId),
        originalSymbol: p.instId,
        side,
        amount: Math.abs(amount),
        entryPrice,
        unrealizedPnL: parseFloat(p.upl || "0"),
        leverage: p.lever ? parseFloat(p.lever) : undefined,
        marginMode: p.mgnMode,
        liquidationPrice: p.liqPx ? parseFloat(p.liqPx) : 0,
        marginUSDT: p.margin ? parseFloat(p.margin) : 0,
        sizeUSDT: p.notionalUsd ? parseFloat(p.notionalUsd) : 0,
      };
    });
  }

  /**
   * Get tickers
   */
  async getTickers({
    containSymbol = "USDT",
    marketType,
  }: {
    containSymbol?: string;
    marketType?: "SPOT" | "FUTURES";
  }): Promise<UnifiedTicker[]> {
    const instType = marketType === "FUTURES" ? "SWAP" : "SPOT";
    const res = await okx.market.getTickers(instType);

    if (res.code !== "0" || !res.data) {
      throw new Error("Failed to fetch OKX tickers: " + res.msg);
    }

    let tickers = res.data;

    // Filter by symbol if provided
    if (containSymbol) {
      // OKX symbols are like BTC-USDT.
      // If user passes "USDT", we check if valid.
      // We don't need to denormalize for partial match generally,
      // but let's ensure we match against the unified or raw format consistently.
      // Raw: BTC-USDT. Unified: BTC_USDT.
      // Let's match against the raw instId for simplicity or standardized?
      // User likely passes "USDT".
      tickers = tickers.filter(
        (t) =>
          t.instId.includes(containSymbol) ||
          t.instId.replace("-", "_").includes(containSymbol),
      );
    }

    const out: UnifiedTicker[] = tickers.map((t) => {
      const last = parseFloat(t.last);
      const open24h = parseFloat(t.open24h);
      const changePercent =
        open24h === 0 ? 0 : ((last - open24h) / open24h) * 100;

      return {
        exchange: "okx" as const,
        coin: t.instId.split("-")[0],
        symbol: t.instId,
        lastPrice: last,
        open24h,
        changePercent,
        volume: parseFloat(t.volCcy24h),
        high24h: parseFloat(t.high24h),
        low24h: parseFloat(t.low24h),
        marketCap: 0,
      };
    });

    return out;
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
