import { requestPrivate } from "../utils";

/**
 * Parameters required to create a new OCO order.
 */
export interface CreateOcoOrderParams {
  /** Trading pair symbol (e.g., "BTC_USDT") */
  symbol: string;

  /** Side of the order: 0 = BUY, 1 = SELL */
  side: 0 | 1;

  /** Quantity of the base asset to buy/sell */
  quantity: string;

  /** Limit price (for the limit leg of the OCO) */
  price: string;

  /** Stop price (for triggering the stop-limit order) */
  stopPrice: string;

  /** Stop-limit price (used with stopPrice) */
  stopLimitPrice: string;

  /** Optional: Custom client ID for the OCO group */
  listClientId?: string;

  /** Optional: Custom client ID for the limit order */
  limitClientId?: string;

  /** Optional: Custom client ID for the stop-limit order */
  stopClientId?: string;

  /** Optional: Request validity duration in ms (max 60000) */
  recvWindow?: number;

  /** Required: Request timestamp in milliseconds */
  timestamp: number;
}

/**
 * Represents a single order within an OCO (One-Cancels-the-Other) order group.
 */
export interface OcoOrder {
  /** Unique order ID assigned by the exchange */
  orderId: string;

  /** Order ID of the base (primary) order */
  bOrderId: string;

  /** OCO group ID for the base order */
  bOrderListId: string;

  /** Client-defined identifier for the order */
  clientId: string;

  /** Trading pair symbol (e.g., "BTC_USDT") */
  symbol: string;

  /** Symbol type: 1 = Main, 2 = Next */
  symbolType: number;

  /** Order side: 0 = BUY, 1 = SELL */
  side: number;

  /** Order type: e.g., 1 = LIMIT, 2 = MARKET, etc. (may vary by exchange spec) */
  type: number;

  /** Price at which the order is placed */
  price: string;

  /** Original quantity specified in the order */
  origQty: string;

  /** Original quote quantity (price * quantity) */
  origQuoteQty: string;

  /** Quantity that has been executed (filled) so far */
  executedQty: string;

  /** Price at which the order was actually executed */
  executedPrice: string;

  /** Total quote asset quantity executed (executedQty * executedPrice) */
  executedQuoteQty: string;

  /** Time in force: how long the order remains active (e.g., 1 = GTC) */
  timeInForce: number;

  /** Stop price that triggers the stop-limit leg */
  stopPrice: string;

  /** Iceberg quantity (visible portion of the order, if applicable) */
  icebergQty: string;

  /** Order status: 0 = New, 1 = Partially Filled, 2 = Filled, etc. */
  status: number;

  /** Whether the order is still actively working: 1 = Yes, 0 = No */
  isWorking: number;

  /** Timestamp of when the order was created (in milliseconds) */
  createTime: number;
}

/**
 * Response structure for creating a new OCO order.
 */
/**
 * Response returned by the exchange after successfully placing an OCO (One-Cancels-the-Other) order.
 */
export interface CreateOcoOrderResponse {
  /** Response code: 0 typically means success */
  code: number;

  /** Response message: usually "success" if successful */
  message: string;

  /** Server timestamp when the response was generated (in milliseconds) */
  timestamp: number;

  /** Details of the created OCO order group */
  data: {
    /** Base order list ID for the OCO group */
    bOrderListId: string;

    /** Client-defined identifier for the OCO group */
    listClientId: string;

    /** Trading pair symbol (e.g., "BTC_USDT") */
    symbol: string;

    /** Symbol type: 1 = Main, 2 = Next */
    symbolType: number;

    /** Contingency type: always "OCO" for this endpoint */
    contingencyType: string;

    /** Status type of the order list (e.g., "EXEC_STARTED", "ALL_DONE") */
    listStatusType: string;

    /** Overall order group status (e.g., "EXECUTING", "PARTIALLY_FILLED", "FILLED") */
    listOrderStatus: string;

    /** Timestamp when the OCO group was created (in milliseconds) */
    createTime: number;

    /** Array of individual orders created as part of the OCO group */
    orders: OcoOrder[];
  };
}

/**
 * Sends a new OCO (One-Cancels-the-Other) order to the Tokocrypto exchange.
 *
 * @param {CreateOcoOrderParams} params - Parameters required to place the OCO order.
 * @returns {Promise<CreateOcoOrderResponse>} The response from the exchange.
 *
 * @example
 * const ocoOrder = await createOcoOrder({
 *   symbol: "BTC_USDT",
 *   side: 1,
 *   quantity: "0.5",
 *   price: "45000",
 *   stopPrice: "43000",
 *   stopLimitPrice: "42500",
 *   timestamp: Date.now()
 * });
 */
export async function createOcoOrder(
  params: CreateOcoOrderParams
): Promise<CreateOcoOrderResponse> {
  return await requestPrivate("/open/v1/orders/oco", params, "post");
}
