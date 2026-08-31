export type DerivativesAnalyticsInterval = "5m" | "15m" | "30m";

/** Public futures-market values aligned to one completed candle bucket. */
export type DerivativesPositioningPoint = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  oiUnits: number;
  oiUsd: number;
};

export type DerivativesPositioningHistoryParams = {
  exchange: "binance";
  interval: DerivativesAnalyticsInterval;
  limit: number;
  symbol: string;
};
