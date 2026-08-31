import { requestPrivate } from "../utils";

/**
 * Parameters for cancelling an order.
 */
export interface CancelOrderParams {
  /** ID of the order to cancel. Required if `clientId` is not provided. */
  orderId?: string;

  /** Custom client order ID to cancel. Required if `orderId` is not provided. */
  clientId?: string;

  /** Optional time window in milliseconds for which the request is valid. Max 60000. */
  recvWindow?: number;

  /** Current timestamp in milliseconds. Required. */
  timestamp: number;
}

/**
 * Response data from a cancelled order.
 */
export interface CancelOrderResponse {
  code: number;
  message: string;
  timestamp: number;
  data: {
    /** Tokocrypto order ID */
    orderId: string;

    /** Binance order ID */
    bOrderId: string;

    /** Binance OCO order list ID (-1 if not an OCO) */
    bOrderListId: number;

    /** Custom client order ID */
    clientId: string;

    /** Symbol (e.g. BTC_USDT) */
    symbol: string;

    /** Side of the order (0 = BUY, 1 = SELL) */
    side: number;

    /** Type of order (1 = LIMIT, 2 = MARKET, etc.) */
    type: number;

    /** Price of the order */
    price: number;

    /** Status of the order (0 = NEW, etc.) */
    status: number;

    /** Original quantity of the order */
    origQty: number;

    /** Original quote quantity */
    origQuoteQty: number;

    /** Executed quantity */
    executedQty: number;

    /** Executed price */
    executedPrice: number;

    /** Executed quote quantity */
    executedQuoteQty: number;

    /** Time when the order was created (ms) */
    createTime: number;
  };
}

/**
 * Cancels an active order using either `orderId` or `clientId`.
 *
 * @param {CancelOrderParams} params - The parameters including either `orderId` or `clientId`, and a required `timestamp`.
 * @returns {Promise<CancelOrderResponse>} The full cancellation response including order status and metadata.
 *
 * @example
 * const result = await cancelOrder({
 *   orderId: "123456",
 *   timestamp: Date.now()
 * });
 */
export async function cancelOrder(
  params: CancelOrderParams
): Promise<CancelOrderResponse> {
  return await requestPrivate("/open/v1/orders/cancel", params, "post");
}
