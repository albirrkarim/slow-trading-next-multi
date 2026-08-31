import { getExchange } from "./index";
import type {
  ExchangeType,
  TradingMode,
  UnifiedFundingRate,
} from "./types";

const FUNDING_RATE_CACHE_TTL_MS = 5 * 60 * 1_000;

interface FundingRateCacheEntry {
  loadedAt: number;
  rates: UnifiedFundingRate[];
}

const cacheByMarket = new Map<string, FundingRateCacheEntry>();
const failedUntilByMarket = new Map<string, number>();
const inFlightByMarket = new Map<string, Promise<UnifiedFundingRate[]>>();

function getMarketKey(exchangeType: ExchangeType, tradingMode: TradingMode) {
  return `${exchangeType}:${tradingMode}`;
}

/** Loads one all-symbol snapshot while coalescing requests for five minutes. */
async function getCachedLatestRates(params: {
  exchangeType: ExchangeType;
  tradingMode: TradingMode;
}): Promise<UnifiedFundingRate[]> {
  if (params.tradingMode !== "futures") return [];

  const key = getMarketKey(params.exchangeType, params.tradingMode);
  const now = Date.now();
  const cached = cacheByMarket.get(key);
  if (cached && now - cached.loadedAt < FUNDING_RATE_CACHE_TTL_MS) {
    return cached.rates;
  }

  if ((failedUntilByMarket.get(key) ?? 0) > now) {
    return cached?.rates ?? [];
  }

  const inFlight = inFlightByMarket.get(key);
  if (inFlight) return inFlight;

  const request = (async () => {
    const exchange = getExchange(params.exchangeType, {
      defaultTradingMode: params.tradingMode,
    });
    if (!exchange.getFundingRates) {
      cacheByMarket.set(key, { loadedAt: Date.now(), rates: [] });
      return [];
    }

    // One all-symbol call keeps monitoring cost independent of position count.
    const rates = await exchange.getFundingRates();
    cacheByMarket.set(key, { loadedAt: Date.now(), rates });
    failedUntilByMarket.delete(key);
    return rates;
  })()
    .catch((error) => {
      failedUntilByMarket.set(key, Date.now() + FUNDING_RATE_CACHE_TTL_MS);
      throw error;
    })
    .finally(() => {
      inFlightByMarket.delete(key);
    });

  inFlightByMarket.set(key, request);
  return request;
}

/** Builds the latest funding-rate map keyed by normalized base coin symbol. */
async function getLatestMap(params: {
  exchangeType: ExchangeType;
  tradingMode: TradingMode;
  symbols: string[];
}): Promise<Record<string, UnifiedFundingRate>> {
  if (params.tradingMode !== "futures") return {};

  const rates = await getCachedLatestRates(params);
  const requested = new Set(
    params.symbols
      .map((symbol) => String(symbol || "").trim().toUpperCase())
      .filter(Boolean),
  );

  return Object.fromEntries(
    rates.flatMap((fundingRate) => {
      const symbol = fundingRate.symbol.split("_")[0]?.toUpperCase();
      return symbol && requested.has(symbol) ? [[symbol, fundingRate]] : [];
    }),
  );
}

function clearFundingRateCache() {
  cacheByMarket.clear();
  failedUntilByMarket.clear();
  inFlightByMarket.clear();
}

const exchangeFundingRate = {
  cache: {
    clear: clearFundingRateCache,
    ttlMs: FUNDING_RATE_CACHE_TTL_MS,
  },
  latest: {
    map: getLatestMap,
  },
} as const;

export default exchangeFundingRate;
