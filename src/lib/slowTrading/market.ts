import dynamic from "@/lib/dynamic";
import type { getExchange } from "@/lib/exchange";
import { getMarketCapUSDMapForSymbols } from "@/lib/exchange/market-cap";
import slowTradingShared from "./shared";
import type { SlowTradingStorageData } from "./types";
import { tradeLog } from "@/lib/trading/helper/log";

/**
 * Builds latest price by symbol from the latest SLOW storage and runtime data.
 */
export async function buildLatestPriceBySymbol(params: {
  exchange: ReturnType<typeof getExchange>;
  marketType: "SPOT" | "FUTURES";
  symbols: string[];
}): Promise<Record<string, number>> {
  const { exchange, marketType, symbols } = params;
  const uniqueSymbols = Array.from(
    new Set(
      symbols
        .map((symbol) =>
          String(symbol || "")
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean),
    ),
  );

  if (uniqueSymbols.length === 0) {
    return {};
  }

  const entries = await Promise.all(
    uniqueSymbols.map(async (symbol) => {
      try {
        const klines = await exchange.getKlines({
          symbol: `${symbol}_USDT`,
          interval: "5m",
          simpleTime: "10minute",
          limit: 5,
          marketType,
        });
        const latestPrice = Number.parseFloat(klines.at(-1)?.[4] ?? "");
        if (!Number.isFinite(latestPrice) || latestPrice <= 0) {
          return null;
        }

        return [symbol, latestPrice] as const;
      } catch (error) {
        tradeLog.warn(
          `[slow-trading] failed to capture reporting snapshot price for ${symbol}`,
          error,
        );
        return null;
      }
    }),
  );

  return Object.fromEntries(
    entries.filter(
      (entry): entry is readonly [string, number] =>
        Array.isArray(entry) &&
        typeof entry[0] === "string" &&
        typeof entry[1] === "number",
    ),
  );
}

/** Builds the latest cached-or-fetched USD market cap by normalized symbol. */
export async function buildLatestMarketCapBySymbol(
  symbols: string[],
): Promise<Record<string, number>> {
  return getMarketCapUSDMapForSymbols(symbols);
}

/**
 * Select the trading model configuration for the current execution.
 */
export function pickModelConfig(storage: SlowTradingStorageData) {
  return slowTradingShared.clone(
    storage.config.modelConfig ??
      dynamic.defaults.tradeConfigProduction.modelConfig,
  );
}

/**
 * Grouped market API for SLOW runtime market data and config selection.
 */
const slowTradingMarket = {
  marketCap: {
    buildLatestBySymbol: buildLatestMarketCapBySymbol,
  },
  price: {
    buildLatestBySymbol: buildLatestPriceBySymbol,
  },
  modelConfig: {
    pick: pickModelConfig,
  },
} as const;

export default slowTradingMarket;
export { slowTradingMarket };
