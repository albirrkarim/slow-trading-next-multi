import type { IExchange } from "@/lib/exchange";
import { tradeLog } from "@/lib/trading";
import type { VolatilityPoint } from "@lib/dynamic/utils/volatility";
import {
  DECISION_V19_LATEST_KLINE_CONCURRENCY,
  decisionEngineLevelConfig,
} from "./constants";
import type { LatestKlineBySymbol } from "./types";

export async function buildLatestKlineBySymbol(params: {
  exchange: IExchange;
  marketType?: "SPOT" | "FUTURES";
  minActionableAbsoluteLevel?: number;
  volatilityPointsMap: Record<string, VolatilityPoint[]>;
}): Promise<LatestKlineBySymbol> {
  const minActionableAbsoluteLevel =
    decisionEngineLevelConfig.resolveMinActionableAbsoluteLevel(
      params.minActionableAbsoluteLevel,
    );

  // PROD:DECISION_V19_LATEST_KLINE
  const symbols = Object.entries(params.volatilityPointsMap)
    .filter(([symbol]) => symbol !== "BTC")
    .filter(([, points]) => {
      const currentPoint = points.at(-1);
      return (
        currentPoint &&
        !currentPoint.used &&
        Math.abs(currentPoint.lvl) === minActionableAbsoluteLevel - 1
      );
    })
    .map(([symbol]) => symbol);

  const latestKlineBySymbol: LatestKlineBySymbol = {};

  for (
    let index = 0;
    index < symbols.length;
    index += DECISION_V19_LATEST_KLINE_CONCURRENCY
  ) {
    const batch = symbols.slice(
      index,
      index + DECISION_V19_LATEST_KLINE_CONCURRENCY,
    );
    const entries = await Promise.all(
      batch.map(async (symbol) => {
        try {
          const klines = await params.exchange.getKlines({
            symbol: `${symbol}_USDT`,
            interval: "5m",
            limit: 5,
            marketType: params.marketType,
            simpleTime: "10minute",
          });

          return [symbol, klines.at(-1)] as const;
        } catch (error) {
          if (
            error instanceof Error &&
            "retryAt" in error &&
            Number.isFinite(Number(error.retryAt))
          ) {
            throw error;
          }
          tradeLog.error(
            `decision.v19 failed to fetch latest kline for ${symbol}`,
            error,
          );
          return [symbol, undefined] as const;
        }
      }),
    );

    for (const [symbol, kline] of entries) {
      latestKlineBySymbol[symbol] = kline;
    }
  }

  return latestKlineBySymbol;
}
