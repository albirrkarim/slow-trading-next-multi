import { requestPrivate } from "../utils";

/**
 * Parameters for retrieving account trade history.
 */
export interface GetAccountTradesParams {
  /** Trading pair symbol (e.g., "ADA_USDT") */
  symbol: string;

  /** Optional: Specific order ID to filter trades */
  orderId?: string;

  /** Optional: Start time in milliseconds */
  startTime?: number;

  /** Optional: End time in milliseconds */
  endTime?: number;

  /** Optional: Start trade ID (used as reference point for pagination) */
  fromId?: number;

  /** Optional: Search direction if fromId is specified. 'prev' = ascending, 'next' = descending */
  direct?: "prev" | "next";

  /** Optional: Max number of results to return (default 500, max 1000) */
  limit?: number;

  /** Optional: Return only completed trades with rebate calculations when set to 10 */
  rebateStatus?: number;

  /** Optional: Validity duration of the request in ms (max 60000) */
  recvWindow?: number;

  /** Required: Timestamp in milliseconds */
  timestamp: number;
}

/**
 * A single trade entry in the account trade list.
 */
export interface Trade {
  tradeId: string;
  orderId: string;
  symbol: string;
  price: string;
  qty: string;
  matchId: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  isBuyer: number;
  isMaker: number;
  isBestMatch: number;
  taxAmount: string;
  taxRate: string;
  time: string;
}

/**
 * Response for the account trade list endpoint.
 */
export interface GetAccountTradesResponse {
  code: number;
  msg: string;
  timestamp: number;
  data: {
    list: Trade[];
  };
}

/**
 * Fetches the trade history of the authenticated account for a given symbol.
 *
 * @param {GetAccountTradesParams} params - Parameters to filter trade history.
 * @returns {Promise<GetAccountTradesResponse>} The list of trade records.
 *
 * @example
 * const trades = await getAccountTrades({
 *   symbol: "ADA_USDT",
 *   limit: 100,
 *   timestamp: Date.now()
 * });
 */
export async function getAccountTrades(
  params: GetAccountTradesParams
): Promise<GetAccountTradesResponse> {
  return await requestPrivate("/open/v1/orders/trades", params, "get");
}
