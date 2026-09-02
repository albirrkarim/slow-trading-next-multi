import { getExchange } from "@/lib/exchange";
import type {
  ExchangeType,
  UnifiedTicker,
} from "@/lib/exchange/types";
import { resolvePersistentStorageRoot } from "@/lib/persistent-storage-root";
import fs from "fs-extra";
import path from "node:path";
import slowTradingPublicMarketCache from "./public-market-cache";

const VOLUME_24H_CACHE_TTL_MS = 10 * 60_000;

export type SlowTradingMarketType = "FUTURES" | "SPOT";

export interface SlowTradingVolume24hSnapshot {
  exchangeType: ExchangeType;
  marketType: SlowTradingMarketType;
  /** Snapshot creation time. */
  t: number;
  /** Per-coin 24-hour quote volume. */
  volumes: Record<string, number>;
}

function normalizeCoin(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[_-]/g, "")
    .replace(/USDT$/, "");
}

/** Builds a requested-symbol volume map from normalized exchange tickers. */
function buildVolumeMap(symbols: string[], tickers: UnifiedTicker[]) {
  const requested = new Set(symbols.map(normalizeCoin).filter(Boolean));
  const volumes: Record<string, number> = {};

  for (const ticker of tickers) {
    const coin = normalizeCoin(ticker.coin || ticker.symbol);
    if (
      requested.has(coin) &&
      Number.isFinite(ticker.volume) &&
      ticker.volume >= 0
    ) {
      volumes[coin] = ticker.volume;
    }
  }

  return volumes;
}

function snapshotPath(
  exchangeType: ExchangeType,
  marketType: SlowTradingMarketType,
) {
  return path.join(
    resolvePersistentStorageRoot(),
    "slow",
    exchangeType,
    `ticker-24h-${marketType.toLowerCase()}.json`,
  );
}

/** Reads the last persisted ticker-volume snapshot for one exchange market. */
async function readSnapshot(
  exchangeType: ExchangeType,
  marketType: SlowTradingMarketType,
) {
  try {
    return (await fs.readJson(
      snapshotPath(exchangeType, marketType),
    )) as SlowTradingVolume24hSnapshot;
  } catch {
    return null;
  }
}

/** Fetches one ticker batch, persists compact JSON, then reads it back. */
async function refreshSnapshotUncached({
  exchangeType,
  marketType,
  symbols,
}: {
  exchangeType: ExchangeType;
  marketType: SlowTradingMarketType;
  symbols: string[];
}) {
  const tickers = await getExchange(exchangeType).getTickers({
    containSymbol: "USDT",
    marketType,
  });
  const snapshot: SlowTradingVolume24hSnapshot = {
    exchangeType,
    marketType,
    t: Date.now(),
    volumes: buildVolumeMap(symbols, tickers),
  };
  const file = snapshotPath(exchangeType, marketType);
  await fs.ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(snapshot));
  return (await readSnapshot(exchangeType, marketType)) ?? snapshot;
}

/** Reuses one 24-hour ticker batch for ten minutes across stage consumers. */
async function refreshSnapshot(params: {
  exchangeType: ExchangeType;
  marketType: SlowTradingMarketType;
  symbols: string[];
}) {
  const now = Date.now();
  const symbols = Array.from(
    new Set(params.symbols.map(normalizeCoin).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right));
  const key = [
    "volume-24h",
    snapshotPath(params.exchangeType, params.marketType),
    symbols.join(","),
  ].join(":");

  const snapshot = await slowTradingPublicMarketCache.value.getOrLoad({
    expiresAt: now + VOLUME_24H_CACHE_TTL_MS,
    key,
    now,
    load: () => refreshSnapshotUncached({ ...params, symbols }),
  });
  return {
    ...snapshot,
    volumes: { ...snapshot.volumes },
  };
}

const slowTradingMarketVolume = {
  cache: {
    ttlMs: VOLUME_24H_CACHE_TTL_MS,
  },
  map: {
    build: buildVolumeMap,
  },
  snapshot: {
    read: readSnapshot,
    refresh: refreshSnapshot,
  },
};

export default slowTradingMarketVolume;
