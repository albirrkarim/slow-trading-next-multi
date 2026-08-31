import { requestPublic } from "../utils";

export interface BinanceTicker {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string;
  lastQty: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

/**
 * Get 24hr ticker price change statistics
 * @param symbol - Optional symbol
 */
export const getTickers = async (symbol?: string) => {
  const params: any = {};
  if (symbol) {
    params.symbol = symbol;
  }

  // If symbol is provided, Binance returns a single object.
  // If not, it returns an array.
  // We will handle this by checking the response type in usage or normalizing here if possible.
  // But requestPublic<T> implies we expect T.

  return requestPublic<BinanceTicker | BinanceTicker[]>(
    "/api/v3/ticker/24hr",
    params,
  );
};
