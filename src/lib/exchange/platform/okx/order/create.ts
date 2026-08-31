import { requestPrivate } from "../utils";

/**
 * Order side
 */
export enum OrderSide {
  BUY = "buy",
  SELL = "sell",
}

/**
 * Order type
 */
export enum OrderType {
  MARKET = "market",
  LIMIT = "limit",
  POST_ONLY = "post_only",
  FOK = "fok", // Fill or Kill
  IOC = "ioc", // Immediate or Cancel
}

/**
 * Trade mode
 */
export enum TradeMode {
  CASH = "cash", // Spot trading (non-margin)
  CROSS = "cross", // Cross margin
  ISOLATED = "isolated", // Isolated margin
}

/**
 * Parameters for creating a new order on OKX
 */
export interface CreateOrderParams {
  /** Instrument ID, e.g., "BTC-USDT" */
  instId: string;

  /** Trade mode: cash, cross, or isolated */
  tdMode: TradeMode;

  /** Order side: buy or sell */
  side: OrderSide;

  /** Order type: market, limit, post_only, fok, ioc */
  ordType: OrderType;

  /** Quantity to buy or sell (base currency) */
  sz: string;

  /** Price per unit (required for limit orders) */
  px?: string;

  /** Client-defined order ID */
  clOrdId?: string;

  /** Tag for order categorization */
  tag?: string;

  /** Reduce only (true/false) for closing positions */
  reduceOnly?: boolean;

  /** Margin currency (required for isolated margin) */
  ccy?: string;

  /** Position side (long, short, net) - Required for Long/Short mode */
  posSide?: "long" | "short" | "net";
}

/**
 * Response type for order creation
 */
export interface CreateOrderResponse {
  code: string;
  msg: string;
  data: Array<{
    clOrdId: string; // Client order ID
    ordId: string; // Order ID
    tag: string;
    sCode: string; // Status code
    sMsg: string; // Status message
  }>;
}

/**
 * Creates a new order on OKX
 *
 * API Documentation: https://www.okx.com/docs-v5/en/#rest-api-trade-place-order
 *
 * @param params - Order parameters
 * @returns Promise resolving to order creation response
 *
 * @example
 * ```ts
 * // Market buy order
 * const order = await createOrder({
 *   instId: "BTC-USDT",
 *   tdMode: TradeMode.CASH,
 *   side: OrderSide.BUY,
 *   ordType: OrderType.MARKET,
 *   sz: "0.001"
 * });
 *
 * // Limit sell order
 * const limitOrder = await createOrder({
 *   instId: "BTC-USDT",
 *   tdMode: TradeMode.CASH,
 *   side: OrderSide.SELL,
 *   ordType: OrderType.LIMIT,
 *   sz: "0.001",
 *   px: "45000"
 * });
 * ```
 */
export async function createOrder(
  params: CreateOrderParams
): Promise<CreateOrderResponse> {
  // Validate limit orders have price
  if (params.ordType === OrderType.LIMIT && !params.px) {
    throw new Error("Limit orders require a price (px)");
  }

  const body: Record<string, any> = {
    instId: params.instId,
    tdMode: params.tdMode,
    side: params.side,
    ordType: params.ordType,
    sz: params.sz,
  };

  // Add optional parameters
  if (params.px) body.px = params.px;
  if (params.clOrdId) body.clOrdId = params.clOrdId;
  if (params.tag) body.tag = params.tag;
  if (params.reduceOnly !== undefined) body.reduceOnly = params.reduceOnly;
  if (params.ccy) body.ccy = params.ccy;
  if (params.posSide) body.posSide = params.posSide;

  return requestPrivate<CreateOrderResponse>(
    "/api/v5/trade/order",
    body,
    "POST"
  );
}

/**
 * Creates a market buy order
 * @param instId - Instrument ID (e.g., "BTC-USDT")
 * @param sz - Quantity to buy
 * @param clOrdId - Optional client order ID
 * @param tdMode - Optional trade mode (defaults to CASH/spot)
 */
export async function marketBuy(
  instId: string,
  sz: string,
  clOrdId?: string,
  tdMode: TradeMode = TradeMode.CASH
): Promise<CreateOrderResponse> {
  return createOrder({
    instId,
    tdMode,
    side: OrderSide.BUY,
    ordType: OrderType.MARKET,
    sz,
    clOrdId,
  });
}

/**
 * Creates a market sell order
 * @param instId - Instrument ID (e.g., "BTC-USDT")
 * @param sz - Quantity to sell
 * @param clOrdId - Optional client order ID
 * @param tdMode - Optional trade mode (defaults to CASH/spot)
 */
export async function marketSell(
  instId: string,
  sz: string,
  clOrdId?: string,
  tdMode: TradeMode = TradeMode.CASH
): Promise<CreateOrderResponse> {
  return createOrder({
    instId,
    tdMode,
    side: OrderSide.SELL,
    ordType: OrderType.MARKET,
    sz,
    clOrdId,
  });
}

/**
 * Creates a limit buy order
 * @param instId - Instrument ID (e.g., "BTC-USDT")
 * @param sz - Quantity to buy
 * @param px - Price per unit
 * @param clOrdId - Optional client order ID
 * @param tdMode - Optional trade mode (defaults to CASH/spot)
 */
export async function limitBuy(
  instId: string,
  sz: string,
  px: string,
  clOrdId?: string,
  tdMode: TradeMode = TradeMode.CASH
): Promise<CreateOrderResponse> {
  return createOrder({
    instId,
    tdMode,
    side: OrderSide.BUY,
    ordType: OrderType.LIMIT,
    sz,
    px,
    clOrdId,
  });
}

/**
 * Creates a limit sell order
 * @param instId - Instrument ID (e.g., "BTC-USDT")
 * @param sz - Quantity to sell
 * @param px - Price per unit
 * @param clOrdId - Optional client order ID
 * @param tdMode - Optional trade mode (defaults to CASH/spot)
 */
export async function limitSell(
  instId: string,
  sz: string,
  px: string,
  clOrdId?: string,
  tdMode: TradeMode = TradeMode.CASH
): Promise<CreateOrderResponse> {
  return createOrder({
    instId,
    tdMode,
    side: OrderSide.SELL,
    ordType: OrderType.LIMIT,
    sz,
    px,
    clOrdId,
  });
}
