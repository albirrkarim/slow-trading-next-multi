import { requestPublic } from "../utils";

export interface Ticker {
  instType: string;
  instId: string;
  last: string;
  lastSz: string;
  askPx: string;
  askSz: string;
  bidPx: string;
  bidSz: string;
  open24h: string;
  high24h: string;
  low24h: string;
  volCcy24h: string;
  vol24h: string;
  ts: string;
  sodUtc0: string;
  sodUtc8: string;
}

export interface OKXResponse<T> {
  code: string;
  msg: string;
  data: T;
}

/**
 * Get tickers for a specific instrument type
 * @param instType - Instrument type (SPOT, SWAP, FUTURES, OPTION, MARGIN)
 */
export const getTickers = async (
  instType: "SPOT" | "SWAP" | "FUTURES" | "OPTION" = "SPOT",
) => requestPublic<OKXResponse<Ticker[]>>("/api/v5/market/tickers", {
    instType,
  });
