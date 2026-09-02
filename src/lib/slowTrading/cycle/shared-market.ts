import { assignVolatility } from "@/components/api/production/utils";
import { FILES } from "@/components/storage";
import brain from "@/lib/brain";
import { buildLatestKlineBySymbol } from "@/lib/brain/algorithms/v4/decisions/v19/latest-klines";
import type { LatestKlineBySymbol } from "@/lib/brain/algorithms/v4/decisions/v19/types";
import dynamic, {
  type DynamicTradeMemory,
  type PredictionEngineMemory,
  type VolatilityPoint,
} from "@/lib/dynamic";
import { getExchange } from "@/lib/exchange";
import exchangeFundingRate from "@/lib/exchange/funding-rate";
import type { UnifiedFundingRate } from "@/lib/exchange/types";
import { resolveMarketTypeForTradingMode } from "@/lib/exchange/utils";
import { tradeLog } from "@/lib/trading/helper/log";
import type { TradingModelMemory } from "@/lib/trading/models";
import fs from "fs-extra";
import slowTradingMarket from "../market";
import slowTradingMarketVolume from "../market-volume";
import type { SlowTradingCycleProfiler } from "../performance";
import slowTradingShared from "../shared";
import slowTradingPublicMarketCache from "../public-market-cache";
import type { SlowTradingStorageData } from "../types";
import binanceRequestCoordinator from "@/lib/exchange/platform/binance/request-coordinator";
import slowTradingNotifications from "../notifications";

type PriceNormMap = NonNullable<DynamicTradeMemory["priceNormMapOverTime"]>;
type PricePurpose = "position-sync" | "reporting";
const FIVE_MINUTES_MS = 5 * 60_000;

export interface SlowTradingSharedMarketSnapshot {
  currentTimeMs: number;
  latestKlineBySymbol: LatestKlineBySymbol;
  priceNormMapOverTime: PriceNormMap;
  symbols: string[];
  volatilityMemoryBySymbol: Record<string, PredictionEngineMemory>;
  fundingRates: {
    get(symbols: string[]): Promise<Record<string, UnifiedFundingRate>>;
  };
  prices: {
    get(
      purpose: PricePurpose,
      symbols: string[],
    ): Promise<Record<string, number>>;
  };
  volume24h: {
    get(): Promise<Record<string, number>>;
  };
}

function normalizeSymbols(symbols: string[]): string[] {
  return Array.from(
    new Set(
      symbols
        .map((symbol) =>
          String(symbol || "")
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

/** Attaches cloned shared volatility memory to mutable account model memory. */
function attachVolatility(params: {
  modelMemoryMap: Record<string, TradingModelMemory>;
  snapshot: SlowTradingSharedMarketSnapshot;
  symbols: string[];
}): void {
  for (const symbol of normalizeSymbols(params.symbols)) {
    const modelMemory = params.modelMemoryMap[symbol] ?? { positions: [] };
    params.modelMemoryMap[symbol] = modelMemory;
    const sharedMemory = params.snapshot.volatilityMemoryBySymbol[symbol];
    modelMemory.volatility = slowTradingShared.clone(
      sharedMemory ?? {
        lastVolatility: [],
        symbol,
      },
    );
  }
}

/** Builds an account-owned volatility map from cloned model memory. */
function buildVolatilityPointsMap(
  modelMemoryMap: Record<string, TradingModelMemory>,
): Record<string, VolatilityPoint[]> {
  return Object.fromEntries(
    Object.entries(modelMemoryMap).map(([symbol, modelMemory]) => [
      symbol,
      modelMemory.volatility?.lastVolatility ?? [],
    ]),
  );
}

/** Builds the single immutable public-market snapshot used by one stage cycle. */
async function prepareUncached(params: {
  minActionableAbsoluteLevel?: number;
  prepareEntryContext: boolean;
  profiler: SlowTradingCycleProfiler;
  storage: SlowTradingStorageData;
  symbols: string[];
}): Promise<SlowTradingSharedMarketSnapshot | null> {
  const symbols = normalizeSymbols(params.symbols);
  if (symbols.length === 0) {
    // PROD:EMPTY_MONITORING_NO_MARKET_IO
    return null;
  }

  const modelMemoryMap: Record<string, TradingModelMemory> = Object.fromEntries(
    symbols.map((symbol) => [symbol, { positions: [] }]),
  );
  await params.profiler.time("signals.assignVolatility", () =>
    assignVolatility(
      modelMemoryMap,
      symbols,
      params.storage.config.exchangeType,
      params.storage.config.tradingMode,
      params.minActionableAbsoluteLevel,
    ),
  );

  const volatilityMemoryBySymbol = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      slowTradingShared.clone(
        modelMemoryMap[symbol].volatility ?? {
          lastVolatility: [],
          symbol,
        },
      ),
    ]),
  );
  const volatilityPointsMap = buildVolatilityPointsMap(modelMemoryMap);
  const marketType = resolveMarketTypeForTradingMode(
    params.storage.config.tradingMode,
  );
  const exchange = getExchange(params.storage.config.exchangeType, {
    defaultTradingMode: params.storage.config.tradingMode,
  });
  let currentTimeMs = Date.now();
  const firstSymbol = symbols[0];
  const candleRequestTime = Date.now();
  const currentTimeKlines = await params.profiler.time(
    "signals.currentTimeKlines",
    () =>
      slowTradingPublicMarketCache.value.getOrLoad({
        expiresAt: slowTradingPublicMarketCache.boundary.next(
          candleRequestTime,
          FIVE_MINUTES_MS,
        ),
        key: [
          "stage-candle-5m",
          exchange.exchangeType,
          marketType,
          firstSymbol,
        ].join(":"),
        now: candleRequestTime,
        shouldCache: (klines) => {
          const closeTime = Number(klines.at(-1)?.[6]);
          return Number.isFinite(closeTime) && closeTime <= candleRequestTime;
        },
        load: () =>
          exchange.getKlines({
            symbol: `${firstSymbol}_USDT`,
            interval: "5m",
            marketType,
            simpleTime: "10minute",
          }),
      }),
  );
  const currentTimeKline = currentTimeKlines.at(-1);
  if (currentTimeKline) {
    currentTimeMs = currentTimeKline[0];
  }

  const sharedDynamicMemory = slowTradingShared.clone(
    dynamic.defaults.tradingMemory,
  );
  if (params.prepareEntryContext) {
    await params.profiler.time("signals.priceNorm", () =>
      dynamic.priceNorm.generateInitial({
        currentTimeMs,
        symbols,
        startTime: currentTimeMs,
        dynamicTradeMemory: sharedDynamicMemory,
        useCache: true,
        exchangeType: params.storage.config.exchangeType,
        volatilityMap: volatilityPointsMap,
      }),
    );
    brain.algorithms.runtime.updatePriceNorm({
      currentTimeMs,
      dynamicTradeMemory: {
        priceNormMapOverTime: sharedDynamicMemory.priceNormMapOverTime,
      },
      volatilityPointsMap,
    });
    await params.profiler.time("signals.writePriceNorm", () =>
      fs.outputJSON(
        FILES.slow.priceNormMapOverTime(params.storage.config.exchangeType),
        sharedDynamicMemory.priceNormMapOverTime,
        { spaces: 0 },
      ),
    );
  }

  const latestKlineBySymbol =
    params.prepareEntryContext &&
    params.storage.config.decisionEngineVersion === "decision.v19"
      ? await buildLatestKlineBySymbol({
          exchange,
          marketType,
          minActionableAbsoluteLevel: params.minActionableAbsoluteLevel,
          volatilityPointsMap,
        })
      : {};
  const priceCache: Record<PricePurpose, Record<string, number>> = {
    "position-sync": {},
    reporting: {},
  };
  const pricePromises = new Map<PricePurpose, Promise<void>>();
  let volumePromise: Promise<Record<string, number>> | null = null;
  let fundingPromise: Promise<Record<string, UnifiedFundingRate>> | null = null;

  async function getPrices(
    purpose: PricePurpose,
    requestedSymbols: string[],
  ): Promise<Record<string, number>> {
    const requested = normalizeSymbols(requestedSymbols);
    const missing = requested.filter(
      (symbol) => priceCache[purpose][symbol] === undefined,
    );
    if (missing.length > 0) {
      const pending = pricePromises.get(purpose);
      if (pending) {
        await pending;
        return getPrices(purpose, requested);
      }

      const promise = slowTradingMarket.price
        .buildLatestBySymbol({
          exchange,
          marketType,
          symbols: missing,
        })
        .then((prices) => {
          Object.assign(priceCache[purpose], prices);
        })
        .finally(() => {
          pricePromises.delete(purpose);
        });
      pricePromises.set(purpose, promise);
      await promise;
    }

    return Object.fromEntries(
      requested
        .filter((symbol) => priceCache[purpose][symbol] !== undefined)
        .map((symbol) => [symbol, priceCache[purpose][symbol]]),
    );
  }

  return {
    currentTimeMs,
    latestKlineBySymbol,
    priceNormMapOverTime: slowTradingShared.clone(
      sharedDynamicMemory.priceNormMapOverTime ?? {},
    ),
    symbols,
    volatilityMemoryBySymbol,
    fundingRates: {
      async get(requestedSymbols) {
        if (!fundingPromise) {
          fundingPromise = exchangeFundingRate.latest.map({
            exchangeType: params.storage.config.exchangeType,
            tradingMode: params.storage.config.tradingMode,
            symbols,
          });
        }
        const rates = await fundingPromise;
        return Object.fromEntries(
          normalizeSymbols(requestedSymbols)
            .filter((symbol) => rates[symbol] !== undefined)
            .map((symbol) => [symbol, slowTradingShared.clone(rates[symbol])]),
        );
      },
    },
    prices: {
      get: getPrices,
    },
    volume24h: {
      async get() {
        if (!volumePromise) {
          volumePromise = slowTradingMarketVolume.snapshot
            .refresh({
              exchangeType: params.storage.config.exchangeType,
              marketType,
              symbols,
            })
            .then((snapshot) => snapshot.volumes)
            .catch(async (error) => {
              if (binanceRequestCoordinator.error.isRateLimit(error)) {
                await slowTradingNotifications.operationalError.notify({
                  source: "cycle.volume-24h",
                  error,
                });
              }
              tradeLog.error(
                "[slow-trading] failed to refresh 24h volume",
                error,
              );
              const snapshot = await slowTradingMarketVolume.snapshot.read(
                params.storage.config.exchangeType,
                marketType,
              );
              return snapshot?.volumes ?? {};
            });
        }
        return slowTradingShared.clone(await volumePromise);
      },
    },
  };
}

/** Coalesces concurrent consumers of the same immutable public snapshot. */
async function prepare(params: {
  minActionableAbsoluteLevel?: number;
  prepareEntryContext: boolean;
  profiler: SlowTradingCycleProfiler;
  storage: SlowTradingStorageData;
  symbols: string[];
}): Promise<SlowTradingSharedMarketSnapshot | null> {
  const symbols = normalizeSymbols(params.symbols);
  if (symbols.length === 0) {
    // PROD:EMPTY_MONITORING_NO_MARKET_IO
    return null;
  }

  const key = [
    "shared-snapshot",
    params.storage.config.exchangeType,
    params.storage.config.tradingMode,
    params.storage.config.decisionEngineVersion,
    params.minActionableAbsoluteLevel ?? "default",
    params.prepareEntryContext ? "entry" : "monitoring",
    symbols.join(","),
  ].join(":");

  return slowTradingPublicMarketCache.operation.singleFlight(key, () =>
    prepareUncached({ ...params, symbols }),
  );
}

const slowTradingCycleSharedMarket = {
  memory: {
    attachVolatility,
    buildVolatilityPointsMap,
  },
  prepare,
} as const;

export default slowTradingCycleSharedMarket;
