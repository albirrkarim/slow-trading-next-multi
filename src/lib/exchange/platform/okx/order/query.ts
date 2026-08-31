import { requestPrivate } from "../utils";

/**
 * OKX Order Data
 */
export interface OKXOrder {
  instId: string;
  ordId: string;
  clOrdId: string;
  px: string;
  sz: string;
  ordType: string;
  side: string;
  posSide: string;
  tdMode: string;
  fillSz: string;
  fillPx: string;
  tradeId: string;
  accFillSz: string;
  fee: string;
  feeCcy: string;
  rebate: string;
  rebateCcy: string;
  state: string; // live, partially_filled
  avgPx: string;
  uTime: string;
  cTime: string;
}

export interface GetOrdersResponse {
  code: string;
  msg: string;
  data: OKXOrder[];
}

/**
 * Get open orders
 * 
 * @param instId - Instrument ID (e.g. BTC-USDT)
 * @param ordType - Order type (optional)
 */
export async function getOpenOrders(
  instId?: string,
  ordType?: string
): Promise<GetOrdersResponse> {
  const params: Record<string, string> = {};
  if (instId) params.instId = instId;
  if (ordType) params.ordType = ordType;

  return requestPrivate<GetOrdersResponse>(
    "/api/v5/trade/orders-pending",
    params,
    "GET"
  );
}

/**
 * Get order details
 * 
 * @param instId - Instrument ID
 * @param ordId - Order ID
 * @param clOrdId - Client Order ID
 */
export async function getOrder(
  instId: string,
  ordId?: string,
  clOrdId?: string
): Promise<GetOrdersResponse> {
  const params: Record<string, string> = { instId };
  if (ordId) params.ordId = ordId;
  if (clOrdId) params.clOrdId = clOrdId;

  return requestPrivate<GetOrdersResponse>(
    "/api/v5/trade/order",
    params,
    "GET"
  );
}

/**
 * Get completed order history
 * 
 * @param instId - Instrument ID
 * @param limit - Number of records to return
 */
/**
 * Get completed order history
 * 
 * @param instId - Instrument ID
 * @param limit - Number of records to return
 * @param explicitInstType - Optional explicit instrument type (SPOT, MARGIN, SWAP, etc)
 */
export async function getHistoryOrders(
  instId: string,
  limit: string = "10",
  explicitInstType?: string
): Promise<GetOrdersResponse> {
  let instType = explicitInstType;
  if (!instType) {
    const isSwap = instId.includes("SWAP") || instId.includes("FUTURES");
    instType = isSwap ? "SWAP" : "SPOT";
  }

  const params: Record<string, string> = {
    instType,
    instId,
    limit,
    state: "filled" // Only get filled orders
  };

  return requestPrivate<GetOrdersResponse>(
    "/api/v5/trade/orders-history",
    params,
    "GET"
  );
}


