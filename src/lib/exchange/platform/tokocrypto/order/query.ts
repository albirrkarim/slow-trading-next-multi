import { requestPrivate } from "../utils";

/**
 * Parameters for querying an order.
 */
export interface QueryOrderParams {
  /** The order ID returned when the order was created. */
  orderId: string;

  /** Optional client-supplied custom order ID */
  clientId?: string;

  /** The maximum time the request is valid for (ms). Max: 60000 */
  recvWindow?: number;

  /** Current timestamp in milliseconds (required for signature) */
  timestamp: number;
}

/**
 * Response from querying an order.
 */
export interface QueryOrderResponse {
  code: number;
  message: string;
  timestamp: number;
  data: {
    /** Tokocrypto order ID */
    orderId: string;

    /** Binance order ID (linked) */
    bOrderId: string;

    /** Binance OCO order list ID (typically -1 if not an OCO) */
    bOrderListId: number;

    /** Client-provided custom order ID */
    clientId: string;

    /** Trading pair symbol (e.g. BTC_USDT) */
    symbol: string;

    /** Order side: 0 = BUY, 1 = SELL */
    side: number;

    /** Order type (1 = LIMIT, 2 = MARKET, etc.) */
    type: number;

    /** Order price */
    price: number;

    /** Order status (0 = NEW, 1 = PARTIALLY_FILLED, etc.) */
    status: number;

    /** Original order quantity */
    origQty: number;

    /** Original quote quantity (used with MARKET buy) */
    origQuoteQty: number;

    /** Executed quantity */
    executedQty: number;

    /** Executed price */
    executedPrice: number;

    /** Quote quantity executed */
    executedQuoteQty: number;

    /** Trading fee paid */
    taxFee: string;

    /** Asset used to pay fee (e.g., USDT) */
    taxFeeAsset: string;

    /** Order creation time in milliseconds */
    createTime: number;
  };
}

/**
 * Queries an existing order by order ID and optional client ID.
 *
 * @param {QueryOrderParams} params - Parameters including orderId, timestamp, and optional clientId and recvWindow.
 * @returns {Promise<QueryOrderResponse>} The order's full detail including status, executed amount, fees, etc.
 *
 * @example
 * const result = await queryOrder({
 *   orderId: "12345678",
 *   timestamp: Date.now()
 * });
 */
export async function queryOrder(
  params: QueryOrderParams
): Promise<QueryOrderResponse> {
  return await requestPrivate("/open/v1/orders/detail", params, "get");
}
