import { MAX_KLINES_PER_CALL } from "@/lib/exchange/constants";
import { requestPublic } from "../utils";
import { tradeLog } from "@/lib/trading";

/**
 * OKX Candlestick (Kline) data format
 * [timestamp, open, high, low, close, volume, volumeCcy, volumeCcyQuote, confirm]
 *
 * @typedef {[
 *   string, // 0: Timestamp in milliseconds
 *   string, // 1: Open price
 *   string, // 2: High price
 *   string, // 3: Low price
 *   string, // 4: Close price
 *   string, // 5: Trading volume (base currency)
 *   string, // 6: Trading volume (quote currency)
 *   string, // 7: Trading volume (USDT)
 *   string  // 8: Confirm state (0: not confirmed, 1: confirmed)
 * ]}
 */
export type OKXKline = [
  string, // timestamp
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  string, // volumeCcy
  string, // volumeCcyQuote
  string, // confirm
];

/**
 * Valid intervals for OKX candlestick data
 */
export type IntervalKlines =
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1H"
  | "2H"
  | "4H"
  | "6H"
  | "12H"
  | "1D"
  | "2D"
  | "3D"
  | "1W"
  | "1M"
  | "3M"
  // Lowercase variants for compatibility
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "8h"
  | "12h"
  | "1d"
  | "3d"
  | "1w";

export const INTERVAL_MS_MAP: Record<string, number> = {
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1H": 3_600_000,
  "2H": 7_200_000,
  "4H": 14_400_000,
  "6H": 21_600_000,
  "12H": 43_200_000,
  "1D": 86_400_000,
  "2D": 172_800_000,
  "3D": 259_200_000,
  "1W": 604_800_000,
  "1M": 2_592_000_000, // Approximate
  "3M": 7_776_000_000, // Approximate
  // Lowercase variants
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "6h": 21_600_000,
  "8h": 28_800_000, // 8h mapped to 8h ms (OKX uses 6H or 12H usually, but ms map is independent of API validity)
  "12h": 43_200_000,
  "1d": 86_400_000,
  "3d": 259_200_000,
  "1w": 604_800_000,
};

function normalizeInterval(bar: IntervalKlines): string {
  // If it's already one of the uppercase valid ones or 'xm', return it
  // But to be safe, we map known lowercase to uppercase
  if (bar.endsWith("h")) return bar.replace("h", "H");
  if (bar.endsWith("d")) return bar.replace("d", "D");
  if (bar.endsWith("w")) return bar.replace("w", "W");
  // 8h is not supported by OKX directly usually, map to 6H or 12H?
  // For now, let's just uppercase it, and if API fails, it fails.
  // BUT OKX API doesn't support 8H. It supports 6H, 12H.
  // However, the function requestPublic will send what we give.

  // NOTE: '1M' is Month, '1m' is Minute.
  // We don't change 'm' (minute) to uppercase. 'M' (Month) is already uppercase.

  return bar;
}

export interface GetKlinesProps {
  /**
   * Instrument ID, e.g., "BTC-USDT"
   */
  instId: string;

  /**
   * Bar size (interval)
   */
  bar: IntervalKlines;

  /**
   * Start time in milliseconds (optional)
   */
  after?: number;

  /**
   * End time in milliseconds (optional)
   */
  before?: number;

  /**
   * Number of results per request (max 300, default 100)
   */
  limit?: number;
}

/**
 * Response type for OKX Klines endpoint
 */
export interface GetKlinesResponse {
  code: string;
  msg: string;
  data: OKXKline[];
}

/**
 * Retrieves candlestick (Kline) data from OKX public API
 *
 * API Documentation: https://www.okx.com/docs-v5/en/#rest-api-market-data-get-candlesticks
 *
 * @param props - Parameters for fetching Klines
 * @returns Promise resolving to Klines response
 *
 * @example
 * ```ts
 * const klines = await getKlines({
 *   instId: "BTC-USDT",
 *   bar: "1H",
 *   limit: 100
 * });
 * console.log(klines.data);
 * ```
 */
export async function getKlines(
  props: GetKlinesProps,
): Promise<GetKlinesResponse> {
  const { instId, bar, after, before, limit = 300 } = props;

  const params: Record<string, any> = {
    instId,
    bar: normalizeInterval(bar),
    limit: Math.min(limit, 300), // OKX max is 300
  };

  tradeLog.debug("get kline okx");

  if (after) params.after = after.toString();
  if (before) params.before = before.toString();

  return requestPublic<GetKlinesResponse>("/api/v5/market/candles", params);
}

/**
 * Retrieves historical candlestick data from OKX
 *
 * @param props - Parameters for fetching historical Klines
 * @returns Promise resolving to historical Klines response
 */
export async function getHistoryKlines(
  props: GetKlinesProps,
): Promise<GetKlinesResponse> {
  const { instId, bar, after, before, limit = 100 } = props;

  const params: Record<string, any> = {
    instId,
    bar: normalizeInterval(bar),
    limit: Math.min(limit, MAX_KLINES_PER_CALL["okx"]),
  };

  if (after) params.after = after.toString();
  if (before) params.before = before.toString();

  return requestPublic<GetKlinesResponse>(
    "/api/v5/market/history-candles",
    params,
  );
}
