import { requestPublic } from "../utils";

/**
 * Aggregate trade item structure.
 */
export interface AggregateTrade {
  a: number; // Aggregate trade ID
  p: string; // Price
  q: string; // Quantity
  f: number; // First trade ID
  l: number; // Last trade ID
  T: number; // Timestamp (ms)
  m: boolean; // Was the buyer the maker?
  M: boolean; // Was the trade the best price match?
}

/**
 * Response structure for aggregate trades endpoint.
 */
export interface AggregateTradesResponse {
  code: number;
  msg: string;
  data: AggregateTrade[];
  timestamp: number;
}

interface GetAggregateTradesProps {
  symbol: string;
  symbolType: number;
  limit: number;
  fromId?: number;
  startTime?: number;
  endTime?: number;
}

/**
 * Fetch compressed/aggregate trades for a given symbol.
 *
 * When symbolType is 1, symbol underscores are removed.
 * Uses Binance API for symbolType 1, otherwise TokoCrypto API.
 *
 * @param symbol - Trading pair symbol (e.g. "BTC_USDT")
 * @param symbolType - Symbol type to select API endpoint (1 = Binance, 3 = TokoCrypto)
 * @param limit - Number of trades to fetch (default 500, max 1000)
 * @param fromId - Aggregate trade ID to fetch from (inclusive)
 * @param startTime - Start timestamp (ms, inclusive)
 * @param endTime - End timestamp (ms, inclusive)
 * @returns Promise resolving to aggregate trades data.
 *
 * @example
 * ```ts
 * const aggTrades = await getAggregateTrades("BTC_USDT", 1, 100, 26100, 1620000000000, 1620003600000);
 * console.log(aggTrades.data);
 * ```
 */
export async function getAggregateTrades({
  symbol,
  symbolType,
  limit = 500,
  fromId,
  startTime,
  endTime,
}: GetAggregateTradesProps): Promise<AggregateTradesResponse> {
  if (limit > 1000) {
    throw new Error("Limit cannot exceed 1000");
  }

  const formattedSymbol = symbolType === 1 ? symbol.replace(/_/g, "") : symbol;

  const domain =
    symbolType === 1
      ? "https://api.binance.com"
      : "https://cloudme-toko.2meta.app";

  const endpoint = symbolType === 1 ? "/api/v3/aggTrades" : "/api/v1/aggTrades";

  // Build params object to pass to requestPublic
  const params: Record<string, any> = {
    symbol: formattedSymbol,
    limit,
  };

  if (fromId !== undefined) params.fromId = fromId;
  if (startTime !== undefined) params.startTime = startTime;
  if (endTime !== undefined) params.endTime = endTime;

  // Use your generic requestPublic helper
  const data = await requestPublic<AggregateTradesResponse>(
    endpoint,
    params,
    domain
  );

  return data;
}
