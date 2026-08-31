import { requestPrivate } from "../utils";
import { tradeLog } from "@/lib/trading/helper/log";

/**
 * Request parameters for fetching all account orders.
 */
export interface AllOrdersParams {
  /** Symbol in the format "BTC_USDT", required. */
  symbol: string;

  /** Order type filter: 1 = open, 2 = history, -1 = all (optional) */
  type?: 1 | 2 | -1;

  /** Side of the order: 0 = BUY, 1 = SELL (optional) */
  side?: 0 | 1;

  /** Start time in milliseconds (optional) */
  startTime?: number;

  /** End time in milliseconds (optional) */
  endTime?: number;

  /** Starting order ID to begin search from (optional) */
  fromId?: string;

  /** Direction to search from the starting ID: "prev" or "next" (mandatory if fromId is provided) */
  direct?: "prev" | "next";

  /** Max number of records to return (default: 500, max: 1000) */
  limit?: number;

  /** Request validity window in ms (optional, max: 60000) */
  recvWindow?: number;

  /** Required request timestamp in milliseconds */
  timestamp: number;
}

/**
 * Represents a single order in the all orders list.
 */
export interface OrderRecord {
  orderId: string;
  bOrderId: string;
  bOrderListId: number;
  clientId: string;
  symbol: string;
  symbolType: number;
  side: number;
  type: number;
  price: string;
  origQty: string;
  origQuoteQty: string;
  executedQty: string;
  executedPrice: string;
  executedQuoteQty: string;
  timeInForce: number;
  stopPrice: string;
  icebergQty: string;
  status: number;
  isWorking: number;
  createTime: number;
}

/**
 * Response from the all orders endpoint.
 */
export interface AllOrdersResponse {
  code: number;
  msg: string;
  timestamp: number;
  data: {
    list: OrderRecord[];
  };
}

/**
 * Fetches all orders (active, canceled, filled) for a symbol on the Tokocrypto exchange.
 *
 * @param {AllOrdersParams} params - The query parameters including required `symbol` and `timestamp`.
 * @returns {Promise<AllOrdersResponse>} List of matching order records and metadata.
 *
 * @example
 * const orders = await allOrders({
 *   symbol: "BTC_USDT",
 *   type: -1,
 *   timestamp: Date.now()
 * });
 */
export async function allOrders(
  params: AllOrdersParams
): Promise<AllOrdersResponse> {
  return await requestPrivate("/open/v1/orders", params, "get");
}

/**
 * Fetches the most recent order (buy/sell) for BTC_USDT.
 */
export async function getLastOrder(
  symbol: string = "BTC_USDT"
): Promise<OrderRecord | null> {
  try {
    const response = await allOrders({
      symbol,
      type: -1, // Fetch all orders (open + history)
      limit: 1, // Only want the most recent one
      timestamp: Date.now(),
    });

    const orders = response.data.list;

    if (orders.length === 0) return null;

    // Orders are usually returned from newest to oldest
    return orders[0];
  } catch (err) {
    tradeLog.error("Error fetching last BTC_USDT order:", err);
    return null;
  }
}
