import { requestPrivate } from "../utils";

/**
 * Order side
 */
export enum OrderSide {
  BUY = "BUY",
  SELL = "SELL",
}

/**
 * Order type
 */
export enum OrderType {
  LIMIT = "LIMIT",
  MARKET = "MARKET",
  STOP_LOSS = "STOP_LOSS",
  STOP_LOSS_LIMIT = "STOP_LOSS_LIMIT",
  TAKE_PROFIT = "TAKE_PROFIT",
  TAKE_PROFIT_LIMIT = "TAKE_PROFIT_LIMIT",
  LIMIT_MAKER = "LIMIT_MAKER",
}

/**
 * Time in force options
 */
export enum TimeInForce {
  GTC = "GTC", // Good Till Cancel
  IOC = "IOC", // Immediate Or Cancel
  FOK = "FOK", // Fill Or Kill
}

/**
 * Parameters for creating a new order on Binance
 */
export interface CreateOrderParams {
  /** Trading pair symbol, e.g., "BTCUSDT" */
  symbol: string;

  /** Order side: BUY or SELL */
  side: OrderSide;

  /** Order type: LIMIT, MARKET, etc. */
  type: OrderType;

  /** Time in force (required for LIMIT orders) */
  timeInForce?: TimeInForce;

  /** Quantity of base asset to trade */
  quantity?: string;

  /** Quantity in quote asset to spend (for MARKET BUY only) */
  quoteOrderQty?: string;

  /** Price per unit (required for LIMIT orders) */
  price?: string;

  /** Stop price (for STOP orders) */
  stopPrice?: string;

  /** Iceberg quantity (for iceberg orders) */
  icebergQty?: string;

  /** Client-defined order ID */
  newClientOrderId?: string;

  /** Recv window (optional) */
  recvWindow?: number;

  /** Timestamp (auto-generated if not provided) */
  timestamp?: number;
}

/**
 * Response type for order creation
 */
export interface CreateOrderResponse {
  symbol: string;
  orderId: number;
  orderListId: number; // Unless OCO, value will be -1
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string; // NEW, PARTIALLY_FILLED, FILLED, etc.
  timeInForce: string;
  type: string;
  side: string;
  fills?: Array<{
    price: string;
    qty: string;
    commission: string;
    commissionAsset: string;
  }>;
}

/**
 * Creates a new order on Binance
 *
 * API Documentation: https://binance-docs.github.io/apidocs/spot/en/#new-order-trade
 *
 * @param params - Order parameters
 * @returns Promise resolving to order creation response
 *
 * @example
 * ```ts
 * // Market buy order
 * const order = await createOrder({
 *   symbol: "BTCUSDT",
 *   side: OrderSide.BUY,
 *   type: OrderType.MARKET,
 *   quoteOrderQty: "100"
 * });
 *
 * // Limit sell order
 * const limitOrder = await createOrder({
 *   symbol: "BTCUSDT",
 *   side: OrderSide.SELL,
 *   type: OrderType.LIMIT,
 *   timeInForce: TimeInForce.GTC,
 *   quantity: "0.001",
 *   price: "45000"
 * });
 * ```
 */
export async function createOrder(
  params: CreateOrderParams
): Promise<CreateOrderResponse> {
  // Validate limit orders have price and timeInForce
  if (params.type === OrderType.LIMIT || params.type === OrderType.LIMIT_MAKER) {
    if (!params.price) {
      throw new Error("Limit orders require a price");
    }
    if (!params.timeInForce) {
      throw new Error("Limit orders require timeInForce");
    }
  }

  const body: Record<string, any> = {
    symbol: params.symbol,
    side: params.side,
    type: params.type,
  };

  // Add optional parameters
  if (params.quantity) body.quantity = params.quantity;
  if (params.quoteOrderQty) body.quoteOrderQty = params.quoteOrderQty;
  if (params.price) body.price = params.price;
  if (params.timeInForce) body.timeInForce = params.timeInForce;
  if (params.stopPrice) body.stopPrice = params.stopPrice;
  if (params.icebergQty) body.icebergQty = params.icebergQty;
  if (params.newClientOrderId) body.newClientOrderId = params.newClientOrderId;
  if (params.recvWindow) body.recvWindow = params.recvWindow;
  if (params.timestamp) body.timestamp = params.timestamp;

  return requestPrivate<CreateOrderResponse>(
    "/api/v3/order",
    body,
    "post"
  );
}

/**
 * Creates a market buy order
 */
export async function marketBuy(
  symbol: string,
  quoteOrderQty: string,
  newClientOrderId?: string
): Promise<CreateOrderResponse> {
  return createOrder({
    symbol,
    side: OrderSide.BUY,
    type: OrderType.MARKET,
    quoteOrderQty,
    newClientOrderId,
  });
}

/**
 * Creates a market sell order
 */
export async function marketSell(
  symbol: string,
  quantity: string,
  newClientOrderId?: string
): Promise<CreateOrderResponse> {
  return createOrder({
    symbol,
    side: OrderSide.SELL,
    type: OrderType.MARKET,
    quantity,
    newClientOrderId,
  });
}

/**
 * Creates a limit buy order
 */
export async function limitBuy(
  symbol: string,
  quantity: string,
  price: string,
  newClientOrderId?: string
): Promise<CreateOrderResponse> {
  return createOrder({
    symbol,
    side: OrderSide.BUY,
    type: OrderType.LIMIT,
    timeInForce: TimeInForce.GTC,
    quantity,
    price,
    newClientOrderId,
  });
}

/**
 * Creates a limit sell order
 */
export async function limitSell(
  symbol: string,
  quantity: string,
  price: string,
  newClientOrderId?: string
): Promise<CreateOrderResponse> {
  return createOrder({
    symbol,
    side: OrderSide.SELL,
    type: OrderType.LIMIT,
    timeInForce: TimeInForce.GTC,
    quantity,
    price,
    newClientOrderId,
  });
}

