import { tradeLog } from "@/lib/trading";
import { requestPublic } from "../utils";
import moment from "moment-timezone";

/**
 * Represents a single OHLCV (Open, High, Low, Close, Volume) candlestick (Kline)
 * data point, typically retrieved from an exchange like Binance.
 *
 * The Last is the latest kline in the array
 *
 * Each Kline captures the full market activity for a specific time interval.
 *
 * @typedef {[
 *   number, // 0: Open time — Unix timestamp in milliseconds marking when this candle starts.
 *   string, // 1: Open price — The price at the beginning of the candle.
 *   string, // 2: High price — The highest price reached during the candle interval.
 *   string, // 3: Low price — The lowest price reached during the candle interval.
 *   string, // 4: Close price — The price at the end of the candle.
 *   string, // 5: Volume — Total base asset volume traded during the candle.
 *   number, // 6: Close time — Unix timestamp in milliseconds when the candle closes.
 *   string, // 7: Quote asset volume — Total quote asset volume traded.
 *   number, // 8: Number of trades — Total number of completed trades in this interval.
 *   string, // 9: Taker buy base asset volume — Base asset volume bought by takers.
 *   string, // 10: Taker buy quote asset volume — Quote asset volume bought by takers.
 *   string, // 11: Ignore (unused) — Reserved field, may be blank or unused.
 *   string  // 12: Human-readable time — Readable date/time string for debugging/logging (e.g. "2025-05-06 20:35:00").
 * ]}
 *
 * Example:
 * ```ts
 * const kline: Kline = [
 *   1715010900000,  // open time
 *   "63000.00",     // open price
 *   "63250.00",     // high price
 *   "62950.00",     // low price
 *   "63120.00",     // close price
 *   "150.45",       // volume
 *   1715011200000,  // close time
 *   "9450000.00",   // quote asset volume
 *   1200,           // number of trades
 *   "80.23",        // taker buy base volume
 *   "5050000.00",   // taker buy quote volume
 *   "",             // ignore
 *   "2025-05-06 20:35:00" // human time
 * ];
 * ```
 */
export type Kline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
  string,
];

// Define valid intervals
export type IntervalKlines =
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "8h"
  | "12h"
  | "1d"
  | "3d"
  | "1w"
  | "1M";

export const INTERVAL_MS_MAP: Record<string, number> = {
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "6h": 21_600_000,
  "8h": 28_800_000,
  "12h": 43_200_000,
  "1d": 86_400_000,
  "3d": 259_200_000,
  "1w": 604_800_000,
  "1M": 2_592_000_000, // Approx, for monthly
};

export interface GetKlinesProps {
  /**
   * BTC_USDT
   */
  symbol: string;
  /**
   * Kline interval (e.g. "1m", "5m", "1h", "1d")
   */
  interval: IntervalKlines;

  symbolType?: number;

  /**
   * msƒ
   */
  startTime: number;
  endTime: number;
}
/**
 * Fetch Kline/candlestick bars for a symbol.
 *
 * When symbolType is 1, symbol underscores are removed.
 * Uses Binance API for symbolType 1, otherwise TokoCrypto API.
 *
 * @param symbol - Trading pair symbol (e.g. "BTC_USDT")
 * @param interval - Kline interval (e.g. "1m", "5m", "1h", "1d")
 * @param symbolType - Symbol type to select API endpoint (1 = Binance, 3 = TokoCrypto)
 * @param limit - Number of klines to fetch (default 500, max 1000)
 * @param startTime - Start timestamp (ms, inclusive)
 * @param endTime - End timestamp (ms, inclusive)
 * @returns Promise resolving to Kline data.
 *
 * @example
 * ```ts
 * const klines = await getKlines("BTC_USDT", "1h", 1, 200, 1620000000000, 1620086400000);
 * console.log(klines.data);
 * ```
 */
export async function getKlines({
  symbol,
  interval,
  symbolType = 1,
  startTime,
  endTime,
}: GetKlinesProps): Promise<Kline[]> {
  const intervalMs = INTERVAL_MS_MAP[interval];
  if (!intervalMs) {
    throw new Error(`Unsupported interval: ${interval}`);
  }

  const expected = Math.ceil((endTime - startTime) / intervalMs);
  if (expected > 1000) {
    throw new Error(
      `Predicted result count ${expected} exceeds max limit (1000). Use batching.`
    );
  }

  tradeLog.debug("get kline tokocrypto");

  const formattedSymbol = symbolType === 1 ? symbol.replace(/_/g, "") : symbol;

  const domain =
    symbolType === 1
      ? "https://api.binance.com"
      : "https://cloudme-toko.2meta.app";

  const endpoint = "/api/v1/klines";

  const params: Record<string, any> = {
    symbol: formattedSymbol,
    interval,
    limit: expected,
    startTime,
    endTime,
  };

  const rawData = await requestPublic<Kline[]>(endpoint, params, domain);

  // 🧠 Append readable time to each kline
  const klinesWithTime: Kline[] = rawData.map(
    (kline) =>
      [
        ...kline,
        moment(kline[0]).format("YYYY-MM-DD HH:mm:ss"),
      ] as unknown as Kline
  );

  return klinesWithTime;
}
