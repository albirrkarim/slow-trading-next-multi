import type { Kline } from "@lib/exchange/platform/tokocrypto";
import type { IntervalKlines } from "@lib/exchange/platform/tokocrypto/market/klines";
import moment from "moment-timezone";
import { requestPublic } from "../utils";

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
   * Trading pair symbol (e.g. "BTCUSDT")
   */
  symbol: string;

  /**
   * Kline interval (e.g. "1m", "5m", "1h", "1d")
   */
  interval: IntervalKlines;

  /**
   * Start time in milliseconds
   */
  startTime?: number;

  /**
   * End time in milliseconds
   */
  endTime?: number;

  /**
   * Number of klines to fetch (default 500, max 1000)
   */
  limit?: number;
}

/**
 * Fetch Kline/candlestick bars for a symbol from Binance.
 *
 * @param symbol - Trading pair symbol (e.g. "BTCUSDT")
 * @param interval - Kline interval (e.g. "1m", "5m", "1h", "1d")
 * @param limit - Number of klines to fetch (default 500, max 1000)
 * @param startTime - Start timestamp (ms, optional)
 * @param endTime - End timestamp (ms, optional)
 * @returns Promise resolving to Kline data.
 *
 * @example
 * ```ts
 * const klines = await getKlines({
 *   symbol: "BTCUSDT",
 *   interval: "1h",
 *   limit: 100,
 *   startTime: 1620000000000,
 *   endTime: 1620086400000
 * });
 * ```
 */
export async function getKlines({
  symbol,
  interval,
  startTime,
  endTime,
  limit = 500,
}: GetKlinesProps): Promise<Kline[]> {
  const params: Record<string, any> = {
    symbol,
    interval,
    limit: Math.min(limit, 1000), // Binance max is 1000
  };

  // tradeLog.debug("get kline binance")

  if (startTime) params.startTime = startTime;
  if (endTime) params.endTime = endTime;

  const rawData = await requestPublic<any[]>("/api/v3/klines", params);

  // Convert Binance kline format to unified format
  // Binance: [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBaseVolume, takerBuyQuoteVolume, ignore]
  // Unified: [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBaseVolume, takerBuyQuoteVolume, ignore, humanTime]
  const klinesWithTime: Kline[] = rawData.map(
    (kline) =>
      [
        kline[0], // openTime
        kline[1], // open (string)
        kline[2], // high (string)
        kline[3], // low (string)
        kline[4], // close (string)
        kline[5], // volume (string)
        kline[6], // closeTime
        kline[7], // quoteVolume (string)
        kline[8], // trades (number)
        kline[9], // takerBuyBaseVolume (string)
        kline[10], // takerBuyQuoteVolume (string)
        kline[11] || "", // ignore (string)
        moment(kline[0]).format("YYYY-MM-DD HH:mm:ss"), // humanTime
      ] as Kline,
  );

  return klinesWithTime;
}
