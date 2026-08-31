import axios from "axios";
import fs from "fs-extra";
import { FILES } from "@/components/storage";
import path from "path";
import { delay } from "@/components/api/utils";

const COINMARKETCAP_BASE_URL = "https://pro-api.coinmarketcap.com";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

type CacheEntry = {
  fetchedAt: number;
  marketCapUSD?: number | null;
};

type MarketCapCacheFile = {
  version: 1;

  /**
   * COIN NAME:
   * {
   *    BTC:{
   *      fetchedAt: 1672531200000,
   *      marketCapUSD: 1000000
   *    },
   *    ETH:{
   *      fetchedAt: 1672531200000,
   *      marketCapUSD: 1000000
   *    },
   * }
   */
  entries: Record<string, CacheEntry>;
};

let cacheLoadPromise: Promise<MarketCapCacheFile> | null = null;
let cacheWritePromise: Promise<void> | null = null;

const inFlight = new Map<string, Promise<number | null>>();

function extractCoinSymbol(symbol: string): string {
  const clean = symbol.trim().toUpperCase();

  // BTC_USDT, BTC-USDT-SWAP
  if (clean.includes("_") || clean.includes("-")) {
    const firstToken = clean.split(/[_-]/)[0];
    return firstToken || clean;
  }

  // BTCUSDT / AUCTIONUSDT / etc.
  const quoteSuffixes = ["USDT", "USDC", "BUSD", "USD", "IDR"];
  for (const q of quoteSuffixes) {
    if (clean.endsWith(q) && clean.length > q.length) {
      return clean.slice(0, -q.length);
    }
  }

  return clean;
}

function normalizeCacheKey(symbol: string): string {
  return extractCoinSymbol(symbol).trim().toUpperCase();
}

function normalizeCacheEntries(entries: Record<string, CacheEntry>): {
  entries: Record<string, CacheEntry>;
  changed: boolean;
} {
  const out: Record<string, CacheEntry> = {};
  let changed = false;

  for (const [rawKey, entry] of Object.entries(entries)) {
    const normKey = normalizeCacheKey(rawKey);
    if (normKey !== rawKey) {
      changed = true;
    }

    const existing = out[normKey];
    if (!existing || (entry?.fetchedAt ?? 0) > (existing?.fetchedAt ?? 0)) {
      out[normKey] = entry;
    } else if (normKey === rawKey) {
      out[normKey] = existing;
    }

    // if multiple raw keys map to same norm key, we treat that as a change
    if (rawKey !== normKey && entries[normKey]) {
      changed = true;
    }
  }

  // Detect if entry count changed (e.g. merges)
  if (Object.keys(out).length !== Object.keys(entries).length) {
    changed = true;
  }

  return { entries: out, changed };
}

async function loadCache(): Promise<MarketCapCacheFile> {
  if (!cacheLoadPromise) {
    cacheLoadPromise = (async () => {
      try {
        if (await fs.pathExists(FILES.slow.marketCapCache)) {
          const raw = (await fs.readJson(
            FILES.slow.marketCapCache,
          )) as Partial<MarketCapCacheFile>;
          if (
            raw &&
            raw.version === 1 &&
            raw.entries &&
            typeof raw.entries === "object"
          ) {
            const { entries, changed } = normalizeCacheEntries(
              raw.entries as Record<string, CacheEntry>,
            );
            const normalized = { version: 1 as const, entries };
            if (changed) {
              await persistCache(normalized);
            }
            return normalized;
          }
        }
      } catch {
        // ignore broken cache
      }
      return { version: 1 as const, entries: {} };
    })();
  }

  return cacheLoadPromise;
}

async function persistCache(cache: MarketCapCacheFile): Promise<void> {
  cacheWritePromise = (cacheWritePromise ?? Promise.resolve()).then(
    async () => {
      await fs.ensureDir(path.dirname(FILES.slow.marketCapCache));
      await fs.writeJson(FILES.slow.marketCapCache, cache);
    },
  );

  await cacheWritePromise;
}

function getCoinMarketCapApiKey(): string | null {
  const key =
    process.env.COINMARKETCAP_API_KEY ??
    process.env.CMC_API_KEY ??
    process.env.NEXT_PUBLIC_COINMARKETCAP_API_KEY;
  return typeof key === "string" && key.trim().length > 0 ? key.trim() : null;
}

async function fetchMarketCapUSDBySymbol(
  coinSymbol: string,
): Promise<number | null> {
  const apiKey = getCoinMarketCapApiKey();
  if (!apiKey) return null;

  const resp = await axios.get(
    `${COINMARKETCAP_BASE_URL}/v1/cryptocurrency/quotes/latest`,
    {
      params: {
        symbol: coinSymbol,
        convert: "USD",
      },
      headers: {
        "X-CMC_PRO_API_KEY": apiKey,
      },
      timeout: 20_000,
    },
  );

  const data = resp.data?.data?.[coinSymbol];
  const marketCap = data?.quote?.USD?.market_cap;
  return typeof marketCap === "number" && Number.isFinite(marketCap)
    ? marketCap
    : null;
}

/**
 * Get the current USD market cap for a trading symbol, using a 1-day cache.
 *
 * - Normalizes the symbol to a cache key.
 * - Returns a cached value if available and fresh.
 * - Otherwise fetches from CoinMarketCap and caches successful numbers.
 * - Does not cache `null`/unknown market caps to avoid long “unknown” lock‑ins.
 *
 * @param symbol - Trading symbol (e.g., "BTCUSDT").
 * @returns Market cap in USD, or `null` if unavailable/unknown.
 */
export async function getMarketCapUSDForSymbol(
  symbol: string,
  withDelay = true,
): Promise<number | null> {
  const key = normalizeCacheKey(symbol);

  const existing = inFlight.get(key);
  if (existing) return existing;

  const p = (async () => {
    const cache = await loadCache();
    const now = Date.now();

    const cached = cache.entries[key];
    if (
      cached &&
      typeof cached.marketCapUSD === "number" &&
      Number.isFinite(cached.marketCapUSD) &&
      now - cached.fetchedAt < CACHE_TTL_MS
    ) {
      return cached.marketCapUSD;
    }

    const coinSymbol = extractCoinSymbol(symbol);

    const marketCapUSD = await fetchMarketCapUSDBySymbol(coinSymbol);

    if (withDelay) {
      await delay(3000);
    }

    // Do not cache null/unknown market caps (prevents an "MC: -" lock-in)
    if (typeof marketCapUSD === "number" && Number.isFinite(marketCapUSD)) {
      cache.entries[key] = {
        fetchedAt: now,
        marketCapUSD,
      };
      await persistCache(cache);
    } else if (cached && typeof cached.marketCapUSD === "number") {
      // Keep the previous good cached value if we had one.
      cache.entries[key] = cached;
    }

    return marketCapUSD;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, p);
  return p;
}

/**
 * Resolves market caps for a symbol list into a normalized symbol map.
 */
export async function getMarketCapUSDMapForSymbols(
  symbols: string[],
): Promise<Record<string, number>> {
  const entries = await Promise.all(
    Array.from(new Set(symbols.map(normalizeCacheKey).filter(Boolean))).map(
      async (symbol) => {
        try {
          const marketCapUSD = await getMarketCapUSDForSymbol(symbol, false);
          return typeof marketCapUSD === "number" &&
            Number.isFinite(marketCapUSD)
            ? ([symbol, marketCapUSD] as const)
            : null;
        } catch {
          return null;
        }
      },
    ),
  );

  return Object.fromEntries(entries.filter((entry) => entry !== null));
}

/** Reads the persisted fetch timestamp for each valid cached market cap. */
export async function getMarketCapFetchedAtMapForSymbols(
  symbols: string[],
): Promise<Record<string, number>> {
  const cache = await loadCache();
  const entries = Array.from(
    new Set(symbols.map(normalizeCacheKey).filter(Boolean)),
  ).flatMap((symbol) => {
    const cached = cache.entries[symbol];
    return cached &&
      typeof cached.marketCapUSD === "number" &&
      Number.isFinite(cached.marketCapUSD) &&
      Number.isFinite(cached.fetchedAt)
      ? ([[symbol, cached.fetchedAt]] as const)
      : [];
  });

  return Object.fromEntries(entries);
}

export async function enrichMarketCapsForTickers(
  tickers: Array<{ symbol: string; marketCap: number }>,
): Promise<void> {
  for (const t of tickers) {
    try {
      const mc = await getMarketCapUSDForSymbol(t.symbol);
      t.marketCap = typeof mc === "number" && Number.isFinite(mc) ? mc : 0;
    } catch {
      t.marketCap = 0;
    }
  }
}
