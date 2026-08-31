import { requestPrivate } from "../utils";

/**
 * Parameters for canceling an order
 */
export interface CancelOrderParams {
  /** Trading pair symbol, e.g., "BTCUSDT" */
  symbol: string;

  /** Order ID (either orderId or origClientOrderId is required) */
  orderId?: number;

  /** Client-defined order ID */
  origClientOrderId?: string;

  /** New client order ID (optional) */
  newClientOrderId?: string;

  /** Recv window (optional) */
  recvWindow?: number;

  /** Timestamp (auto-generated if not provided) */
  timestamp?: number;
}

/**
 * Response type for order cancellation
 */
export interface CancelOrderResponse {
  symbol: string;
  origClientOrderId: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
}

/**
 * Cancels an existing order on Binance
 *
 * API Documentation: https://binance-docs.github.io/apidocs/spot/en/#cancel-order-trade
 *
 * @param params - Cancel order parameters
 * @returns Promise resolving to cancellation response
 *
 * @example
 * ```ts
 * // Cancel by order ID
 * const result = await cancelOrder({
 *   symbol: "BTCUSDT",
 *   orderId: 123456789
 * });
 *
 * // Cancel by client order ID
 * const result = await cancelOrder({
 *   symbol: "BTCUSDT",
 *   origClientOrderId: "my-order-123"
 * });
 * ```
 */
export async function cancelOrder(
  params: CancelOrderParams
): Promise<CancelOrderResponse> {
  if (!params.orderId && !params.origClientOrderId) {
    throw new Error("Either orderId or origClientOrderId is required to cancel an order");
  }

  const body: Record<string, any> = {
    symbol: params.symbol,
  };

  if (params.orderId) body.orderId = params.orderId;
  if (params.origClientOrderId) body.origClientOrderId = params.origClientOrderId;
  if (params.newClientOrderId) body.newClientOrderId = params.newClientOrderId;
  if (params.recvWindow) body.recvWindow = params.recvWindow;
  if (params.timestamp) body.timestamp = params.timestamp;

  return requestPrivate<CancelOrderResponse>(
    "/api/v3/order",
    body,
    "delete"
  );
}

