import { requestPublic } from "../utils";
import type { GetKlinesProps } from "../market/klines";
import type { Kline } from "@lib/exchange/platform/tokocrypto";
import moment from "moment-timezone";

/**
 * Fetch Kline/candlestick bars for a symbol from Binance Futures.
 */
export async function getFuturesKlines({
  symbol,
  interval,
  startTime,
  endTime,
  limit = 500,
}: GetKlinesProps): Promise<Kline[]> {
  const params: Record<string, any> = {
    symbol,
    interval,
    limit: Math.min(limit, 1500), // Futures max is 1500, but let's stick to reasonable defaults
  };

  if (startTime) params.startTime = startTime;
  if (endTime) params.endTime = endTime;

  const FUTURES_BASE_URL = "https://fapi.binance.com";

  const rawData = await requestPublic<any[]>(
    "/fapi/v1/klines",
    params,
    FUTURES_BASE_URL,
  );

  // Convert Binance kline format to unified format
  // Binance Futures response format is same as Spot
  return rawData.map(
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
}
