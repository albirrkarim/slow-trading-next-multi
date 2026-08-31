import { requestPrivate } from "../utils";

/**
 * Order side options.
 * - 0 = BUY
 * - 1 = SELL
 */
export enum OrderSide {
  BUY = 0,
  SELL = 1,
}

/**
 * Order type options.
 * - 1 = LIMIT
 * - 2 = MARKET
 * - 3 = STOP_LOSS
 * - 4 = STOP_LOSS_LIMIT
 * - 5 = TAKE_PROFIT
 * - 6 = TAKE_PROFIT_LIMIT
 * - 7 = LIMIT_MAKER
 */
export enum OrderType {
  LIMIT = 1,
  MARKET = 2,
  STOP_LOSS = 3,
  STOP_LOSS_LIMIT = 4,
  TAKE_PROFIT = 5,
  TAKE_PROFIT_LIMIT = 6,
  LIMIT_MAKER = 7,
}

/**
 * Time in force options.
 * - 1 = GTC (Good Till Cancel)
 * - 2 = IOC (Immediate Or Cancel)
 * - 3 = FOK (Fill Or Kill)
 * - 4 = GTX (Good Till Crossing)
 */
export enum TimeInForce {
  GTC = 1,
  IOC = 2,
  FOK = 3,
  GTX = 4,
}

/**
 * Self-trade prevention modes.
 * - 0 = EXPIRE_MAKER
 * - 1 = EXPIRE_TAKER
 * - 2 = EXPIRE_BOTH
 * - 3 = NONE
 */
export enum SelfTradePreventionMode {
  EXPIRE_MAKER = 0,
  EXPIRE_TAKER = 1,
  EXPIRE_BOTH = 2,
  NONE = 3,
}

/**
 * Parameters required to create a new order.
 */
export interface CreateOrderParams {
  /** Trading pair symbol, e.g., "BTCUSDT" */
  symbol: string;

  /** Order side: 0 = BUY, 1 = SELL */
  side: OrderSide;

  /** Order type (1–7). Use OrderType enum for clarity */
  type: OrderType;

  /** Time in force policy. Required for LIMIT and similar orders */
  timeInForce?: TimeInForce;

  /** Quantity of the base asset to trade */
  quantity?: number;

  /** Quantity in quote asset to spend (for MARKET BUY only) */
  quoteOrderQty?: number;

  /** Price per unit (required for LIMIT, STOP_LOSS_LIMIT, etc.) */
  price?: number;

  /** Custom client order ID. Auto-generated if not provided */
  clientId?: string;

  /** Stop price (trigger) for stop/trigger orders */
  stopPrice?: string;

  /** Iceberg quantity (hidden portion) for iceberg orders */
  icebergQty?: string;

  /** Self-trade prevention behavior */
  selfTradePreventionMode?: SelfTradePreventionMode;

  /** Max duration (ms) the request is valid for (default: 5000–60000 ms) */
  recvWindow?: number;

  /** Current timestamp in milliseconds (mandatory for signature) */
  timestamp: number;
}

/**
 * Response returned after creating an order.
 */
export interface CreateOrderResponse {
  code: number;
  message: string;
  messageDetail: string | null;
  timestamp: number;
  success: boolean;
  data: {
    /** Unique order ID assigned by the exchange */
    orderId: number;
    /** Custom client ID if provided */
    clientId: string;
    /** Trading pair symbol */
    symbol: string;
    /** Type of market (e.g., spot) */
    symbolType: number;
    /** Order side: 0 = BUY, 1 = SELL */
    side: OrderSide;
    /** Order type */
    type: OrderType;
    /** Order price */
    price: string;
    /** Original quantity requested */
    origQty: string;
    /** Original quote quantity requested */
    origQuoteQty: string;
    /** Executed quantity so far */
    executedQty: string;
    /** Average price at which the order executed */
    executedPrice: string;
    /** Total quote quantity used in executions */
    executedQuoteQty: string;
    /** Time in force */
    timeInForce: TimeInForce;
    /** Stop price (for triggers) */
    stopPrice: string;
    /** Iceberg quantity (if applicable) */
    icebergQty: string;
    /** Order status (0 = NEW, 1 = PARTIALLY_FILLED, etc.) */
    status: number;
    /** 1 if working, 0 if inactive */
    isWorking: number;
    /** Timestamp when the order was created */
    createTime: number;
    /** Border ID (internal use) */
    borderId: string;
    /** Border list ID (internal use) */
    borderListId: number;
  };
}

/**
 * Sends a new order to the Tokocrypto exchange.
 *
 * @param {CreateOrderParams} params - All parameters required to create a new order. Some fields are optional depending on the order type:
 *
 * - `LIMIT` requires `price`, `quantity`, and `timeInForce`.
 * - `MARKET` requires `quantity` (sell) or `quoteOrderQty` (buy).
 * - `STOP_LOSS`, `TAKE_PROFIT` require `quantity` and `stopPrice`.
 * - `STOP_LOSS_LIMIT`, `TAKE_PROFIT_LIMIT` require `price`, `quantity`, and `stopPrice`.
 * - `LIMIT_MAKER` requires `price`, `quantity`.
 *
 * @returns {Promise<CreateOrderResponse>} Response object containing order ID, status, execution info, and more.
 *
 * @example
 * // LIMIT BUY Order – Buy 0.01 BTC at $27,000, good till cancelled
 * const response = await createOrder({
 *   symbol: "BTCUSDT",
 *   side: OrderSide.BUY,
 *   type: OrderType.LIMIT,
 *   quantity: "0.01",
 *   price: "27000",
 *   timeInForce: TimeInForce.GTC,
 *   timestamp: Date.now(),
 * });
 *
 * @example
 * // MARKET SELL Order – Instantly sell 0.005 BTC at current market price
 * const response = await createOrder({
 *   symbol: "BTCUSDT",
 *   side: OrderSide.SELL,
 *   type: OrderType.MARKET,
 *   quantity: "0.005",
 *   timestamp: Date.now(),
 * });
 *
 * @example
 * // MARKET BUY Order – Spend $100 USDT to buy BTC at market price
 * const response = await createOrder({
 *   symbol: "BTCUSDT",
 *   side: OrderSide.BUY,
 *   type: OrderType.MARKET,
 *   quoteOrderQty: "100",
 *   timestamp: Date.now(),
 * });
 *
 * @example
 * // STOP LOSS Order – Automatically sell 0.01 BTC if price drops to $25,000
 * const response = await createOrder({
 *   symbol: "BTCUSDT",
 *   side: OrderSide.SELL,
 *   type: OrderType.STOP_LOSS,
 *   quantity: "0.01",
 *   stopPrice: "25000",
 *   timestamp: Date.now(),
 * });
 *
 * @example
 * // STOP LOSS LIMIT Order – Trigger limit sell at $24800 if price hits $25000
 * const response = await createOrder({
 *   symbol: "BTCUSDT",
 *   side: OrderSide.SELL,
 *   type: OrderType.STOP_LOSS_LIMIT,
 *   quantity: "0.01",
 *   price: "24800",
 *   stopPrice: "25000",
 *   timeInForce: TimeInForce.GTC,
 *   timestamp: Date.now(),
 * });
 *
 * @example
 * // LIMIT MAKER BUY Order – Buy only if order adds liquidity
 * const response = await createOrder({
 *   symbol: "BTCUSDT",
 *   side: OrderSide.BUY,
 *   type: OrderType.LIMIT_MAKER,
 *   quantity: "0.01",
 *   price: "26900",
 *   timestamp: Date.now(),
 * });
 */
export async function createOrder({
  type = OrderType.LIMIT,
  ...rest
}: CreateOrderParams): Promise<CreateOrderResponse> {
  const params: CreateOrderParams = {
    type,
    ...rest,
  };
  validateOrderParams(params);
  return await requestPrivate("/open/v1/orders", params, "post");
}

function validateOrderParams(params: CreateOrderParams): void {
  const { type, price, quantity, timeInForce, stopPrice, quoteOrderQty } =
    params;

  // Check symbol format and support
  // if (!symbol || !SUPPORTED_SYMBOLS.includes(symbol)) {
  //   throw new Error(`Unsupported or invalid symbol: ${symbol}`);
  // }

  switch (type) {
    case OrderType.LIMIT:
    case OrderType.LIMIT_MAKER:
      if (!price || !quantity || !timeInForce)
        throw new Error(
          "LIMIT orders require price, quantity, and timeInForce."
        );
      break;

    case OrderType.MARKET:
      if (!quantity && !quoteOrderQty)
        throw new Error(
          "MARKET orders require either quantity (sell) or quoteOrderQty (buy)."
        );
      break;

    case OrderType.STOP_LOSS:
    case OrderType.TAKE_PROFIT:
      if (!quantity || !stopPrice)
        throw new Error("STOP/TAKE orders require quantity and stopPrice.");
      break;

    case OrderType.STOP_LOSS_LIMIT:
    case OrderType.TAKE_PROFIT_LIMIT:
      if (!price || !quantity || !stopPrice || !timeInForce)
        throw new Error(
          "STOP/TAKE LIMIT orders require price, quantity, stopPrice, and timeInForce."
        );
      break;

    default:
      throw new Error(`Unsupported order type: ${type}`);
  }
}
