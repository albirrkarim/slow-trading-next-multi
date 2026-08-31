import type { IExchange, TradingMode } from "@/lib/exchange";
import { resolveMarketTypeForTradingMode } from "@/lib/exchange/utils";
import type { Kline } from "@/lib/exchange/platform/tokocrypto";

/** Fetches the latest candle used by the production entry guards. */
async function getLatestEntryKline(params: {
  exchange: IExchange;
  symbol: string;
  tradingMode: TradingMode;
}): Promise<Kline | undefined> {
  const tradingSymbol = params.symbol.includes("_")
    ? params.symbol
    : `${params.symbol}_USDT`;
  const candles = await params.exchange.getKlines({
    symbol: tradingSymbol,
    interval: "1m",
    simpleTime: "5minute",
    limit: 5,
    marketType: resolveMarketTypeForTradingMode(params.tradingMode),
  });

  return candles.at(-1);
}

const entryMarket = {
  currentKline: {
    getLatest: getLatestEntryKline,
  },
} as const;

export default entryMarket;
