import { requestPublic } from "../utils";
import type { BinanceTicker } from "../market/tickers";

/**
 * Get 24hr ticker price change statistics for Futures
 * @param symbol - Optional symbol
 */
export const getFuturesTickers = async (symbol?: string) => {
  const params: any = {};
  if (symbol) {
    params.symbol = symbol;
  }

  const FUTURES_BASE_URL = "https://fapi.binance.com";

  return requestPublic<BinanceTicker | BinanceTicker[]>(
    "/fapi/v1/ticker/24hr",
    params,
    FUTURES_BASE_URL,
  );
};
