// marketData.ts

import { requestPublic } from "../utils";

export interface OrderBookEntry {
  price: string;
  quantity: string;
}

export interface OrderBookResponse {
  code: number;
  msg: string;
  data: {
    lastUpdateId: number;
    bids: Array<[string, string]>;
    asks: Array<[string, string]>;
  };
  timestamp: number;
}

interface GetOrderBookProps {
  symbol: string;
  limit: number;
  symbolType: number;
}

/**
 * Fetches the order book (market depth) for a symbol.
 *
 * When symbol type is 1, the symbol’s underscore (_) must be removed before the request.
 * When symbol type is 3, use the alternative endpoint.
 *
 * @param {string} symbol - The trading pair symbol, e.g. 'BTCUSDT' or 'ADA_USDT'.
 * @param {number} [limit=100] - Optional limit of order book entries (valid: 5,10,20,50,100,500).
 * @param {number} symbolType - Symbol type (1 or 3) to determine which API endpoint to use.
 * @returns {Promise<OrderBookResponse>} The order book data.
 *
 * @example
 * ```ts
 * import { getOrderBook } from './marketData';
 *
 * async function fetchOrderBook() {
 *   const symbolType = 1;
 *   const symbol = 'BTC_USDT';
 *   const response = await getOrderBook(symbol, 20, symbolType);
 *   console.log('Bids:', response.data.bids);
 *   console.log('Asks:', response.data.asks);
 * }
 * fetchOrderBook();
 * ```
 */
export async function getOrderBook({
  symbol,
  limit = 100,
  symbolType,
}: GetOrderBookProps): Promise<OrderBookResponse> {
  if (![5, 10, 20, 50, 100, 500].includes(limit)) {
    throw new Error("Invalid limit. Valid limits are: 5, 10, 20, 50, 100, 500");
  }

  let domain = "";
  let endpoint = "/api/v3/depth"; // default for symbolType 1

  let formattedSymbol = symbol;

  if (symbolType === 1) {
    // For symbolType 1, remove underscore
    formattedSymbol = symbol.replace(/_/g, "");
    domain = "https://api.binance.com";
    endpoint = "/api/v3/depth";
  } else if (symbolType === 3) {
    domain = "https://cloudme-toko.2meta.app";
    endpoint = "/api/v1/depth";
  } else {
    throw new Error("Invalid symbol type. Must be 1 or 3.");
  }

  const params = {
    symbol: formattedSymbol,
    limit,
  };

  const data = await requestPublic<OrderBookResponse>(endpoint, params, domain);

  return data;
}
