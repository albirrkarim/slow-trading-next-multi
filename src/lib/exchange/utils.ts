import { enrichMarketCapsForTickers } from "./market-cap";
import { TradingMode, type IExchange, type UnifiedTicker } from "./types";
import { tradeLog } from "@/lib/trading/helper/log";

/** Maps an execution trading mode to the market that supplies its klines. */
export function resolveMarketTypeForTradingMode(
  tradingMode: TradingMode,
): "SPOT" | "FUTURES" {
  return tradingMode === TradingMode.FUTURES ? "FUTURES" : "SPOT";
}

/**
 * Convert simple time format (e.g., '10minute', '2week') to minutes.
 *
 * @param simpleTime - The simple time string to parse
 * @returns Number of minutes
 * @throws Error if format is invalid
 */
export function simpleTimeToMinutes(simpleTime: string): number {
  if (!simpleTime || simpleTime.includes("to")) {
    return 0;
  }

  const match = simpleTime.match(/^(\d+)(minute|hour|day|week|month|year)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const unit = match[2];
    const unitToMinutes: Record<string, number> = {
      minute: 1,
      hour: 60,
      day: 1440,
      week: 10080,
      month: 43200,
      year: 525600,
    };
    return num * unitToMinutes[unit];
  } else {
    throw new Error(`Invalid simpleTime format: ${simpleTime}`);
  }
}

/**
 * Resolve start time from params that might contain simpleTime
 *
 * @param params Object containing optional simpleTime, startTime, and endTime
 * @returns The resolved startTime in milliseconds, or undefined if not calculable
 */
export function resolveStartTime(params: {
  simpleTime?: string;
  startTime?: number;
  endTime?: number;
}): number | undefined {
  let { endTime } = params;
  const { simpleTime, startTime } = params;

  if (startTime !== undefined) {
    return startTime;
  }

  if (simpleTime) {
    const minutes = simpleTimeToMinutes(simpleTime);
    if (minutes > 0) {
      if (endTime === undefined) {
        endTime = Date.now();
      }
      return endTime - minutes * 60_000;
    }
  }

  return undefined;
}

/**
 * Verify and filter gainers by checking if they have valid recent volume
 *
 * @param exchange The exchange instance to fetch klines from
 * @param tickers List of tickers to verify
 * @param need Number of valid gainers needed
 * @param marketType Market type for klines (SPOT or FUTURES)
 * @returns List of verified gainers
 */
export async function verifyAndFilterGainers(
  exchange: IExchange, // Using any to avoid circular dependency with IExchange
  tickers: UnifiedTicker[], // Using any[] to avoid circular dependency with UnifiedTicker
  need: number = 10,
  marketType?: "SPOT" | "FUTURES",
): Promise<UnifiedTicker[]> {
  // 1. Filter for positive gainers and sort by change percent descending
  const potentialGainers = tickers
    .filter((t) => t.changePercent > 0 && t.lastPrice > 0)
    .sort((a, b) => b.changePercent - a.changePercent);

  const verifiedGainers: any[] = [];

  // 2. Verify each gainer has real volume by fetching klines
  for (const ticker of potentialGainers) {
    if (verifiedGainers.length >= need) {
      break;
    }

    try {
      // Fetch recent 4h klines to verify the symbol has proper trading history
      // Using 4h to exactly match the dashboard charting requirements
      const klines = await exchange.getKlines({
        symbol: ticker.symbol,
        interval: "4h",
        limit: 10,
        marketType,
      });

      // Strict verification:
      // 1. Must have at least 5 klines
      // 2. Must have volume in at least one kline
      // 3. Most recent kline must be within the last 5 hours (for 4h interval)
      const MIN_KLINES = 5;
      const MAX_AGE_MS = 5 * 60 * 60 * 1000; // 5 hours

      if (klines.length < MIN_KLINES) {
        // console.warn("A. klines small ", klines.length);
        continue;
      }

      // check if any of the klines has volume
      // verify that we have at least one kline with volume > 0
      const hasVolume = klines.some((k: any) => parseFloat(k[5]) > 0);

      if (!hasVolume) {
        // console.warn(
        //   "B. klines no volume",
        // );
        continue;
      }

      // Check if the most recent kline is fresh
      const latestKline = klines[klines.length - 1];
      const latestTime =
        typeof latestKline[0] === "number"
          ? latestKline[0]
          : parseInt(latestKline[0]);
      const age = Date.now() - latestTime;

      if (age > MAX_AGE_MS) {
        // Stale data - likely from SPOT fallback, skip this symbol
        // console.warn("C. klines stale age: ", age);
        continue;
      }

      // console.log(
      //   "VERIF ",
      //   ticker.symbol,
      //   ` have klines valid ${hasVolumeKlines.length} / ${klines.length}`,
      // );

      ticker.klines = klines;

      verifiedGainers.push(ticker);
    } catch (e) {
      // Failed to fetch klines or verify, skip this ticker
      tradeLog.warn(`Failed to verify gainer ${ticker.symbol}:`, e);
    }
  }

  await enrichMarketCapsForTickers(verifiedGainers);

  return verifiedGainers;
}
