import { requestPublic } from "../utils";

/**
 * Recent trade item structure.
 */
export interface RecentTrade {
  id: number;
  price: string;
  qty: string;
  time: number;
  isBuyerMaker: boolean;
  isBestMatch: boolean;
}

/**
 * Response structure for recent trades endpoint.
 */
export interface RecentTradesResponse {
  code: number;
  msg: string;
  data: RecentTrade[];
  timestamp: number;
}

interface GetRecentTradesProps {
  symbol: string;
  limit: number;
  symbolType: number;
}

/**
 * Fetch recent trades for a given symbol.
 *
 * When symbolType is 1, the symbol should have underscores removed.
 * Uses Binance API for symbolType 1, otherwise uses TokoCrypto API.
 *
 * @param symbol - Trading pair symbol (e.g. "BTC_USDT")
 * @param limit - Number of trades to return (default 500, max 1000)
 * @param symbolType - Symbol type to decide API endpoint (1 = Binance, others use TokoCrypto)
 * @returns Promise resolving to recent trades data.
 *
 * @example
 * ```ts
 * const trades = await getRecentTrades("ADA_USDT", 100, 1);
 * console.log(trades.data);
 * ```
 */
export async function getRecentTrades({
  symbol,
  limit = 500,
  symbolType,
}: GetRecentTradesProps): Promise<RecentTradesResponse> {
  if (limit > 1000) {
    throw new Error("Limit cannot exceed 1000");
  }

  const formattedSymbol = symbolType === 1 ? symbol.replace(/_/g, "") : symbol;

  let domain = "";
  let endpoint = "";

  if (symbolType === 1) {
    domain = "https://api.binance.com";
    endpoint = "/api/v3/trades";
  } else {
    domain = "https://cloudme-toko.2meta.app";
    endpoint = "/open/v1/market/trades";
  }

  const params = {
    symbol: formattedSymbol,
    limit,
  };

  const data = await requestPublic<RecentTradesResponse>(
    endpoint,
    params,
    domain
  );

  return data;
}
