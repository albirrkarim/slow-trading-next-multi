import { type GrowthOvertimeDetail } from "@/lib/dynamic/backtest-volatility/type";
import { tradeLog } from "@/lib/trading/helper/log";
import { type TradingModelMemory } from "@/lib/trading/models";
import type { DataBacktestPurpose } from "@lib/brain/algorithms/type-execute";

import { DEFAULT_DYNAMIC_TRADING_MEMORY } from "../constants";

import type {
  BacktestReturnDynamic,
  DynamicTradeMemory,
  RunBacktestDynamicProps,
  TradeHistoryDynamic,
} from "../";
import {
  countGrowthOvertime,
  cropVolatility,
  onlyPushUnique,
} from "../";
import {
  performSafeHavenWithdrawal,
  scheduleSafeHavenRequest,
} from "../utils/safeHaven";
import { generateInitialPriceNorm } from "./utils";
import { deepCopy } from "@/components/client/utils";
import { decisionEngineV14 } from "@/lib/brain/algorithms/v4/decisions/v14/decision";
import { PRICE_NORM_DATA_MS } from "@/lib/brain/constants";
import slowTradingSidewaysExit from "@/lib/slowTrading/exit-sideways";
import { generateAveragingRecommendations } from "@/lib/slowTrading/watch-reserve";
import { resolveMarketTypeForTradingMode } from "@/lib/exchange/utils";
import { windowsMs } from "../constants-time";
import { tryToExit } from "./exit";
import { tryExecuteBacktestAveraging, tryOpenBacktestEntry } from "./trading";

async function yieldToCancellation(signal: AbortSignal) {
  signal.throwIfAborted();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  signal.throwIfAborted();
}

/**
 * Executes a dynamic multi-symbol backtest simulation using the configured trading model.
 *
 * 9 Nov 20225
 */
export async function runBacktestVolatilityDynamic({
  symbols,
  interval = "5m",
  range = "1year",
  signal,
  startTime,
  endTime,
  useVolatilityCache = true,
  volatilityMap: injectedVolatilityMap,
  warmupVolatilityMap,
  volume24hBySymbol,
  entryCutoffBufferMs = windowsMs["1m"] * 3,
  config,
  verbose = false,
  decisionEngine = decisionEngineV14,
}: RunBacktestDynamicProps): Promise<BacktestReturnDynamic> {
  signal?.throwIfAborted();
  symbols.sort();

  const { modelConfig: configuredModelConfig, startingBalanceUSDT } = config;
  const pureConfig = deepCopy(config);
  // BTEST:BACKTEST_MARKET_TYPE
  const marketType = resolveMarketTypeForTradingMode(config.tradingMode);

  // A. INITIALIZE
  tradeLog.log("A. Initialize runBacktestVolatilityDynamic");
  tradeLog.log("symbols: ", symbols);

  // A.1 We need BTC
  if (!symbols.includes("BTC")) {
    symbols.push("BTC");
  }

  // A.2 Initialize Balance USDT and base for all symbols
  const dynamicTradeMemory: DynamicTradeMemory = deepCopy({
    ...DEFAULT_DYNAMIC_TRADING_MEMORY,
    startingBalanceUSDT,
    quoteAsset: startingBalanceUSDT,
    volatilitySnapshots: [],

    priceNormMapOverTime: {},
  });

  // A.3 Overall asset growth
  const growthOvertime: GrowthOvertimeDetail[] = [];

  // A.4 Trade History for each coins
  const tradeHistoryMap: Record<string, TradeHistoryDynamic[]> = {};
  for (const symbol of symbols) {
    tradeHistoryMap[symbol] = [];
  }

  // A.5 fill up the model memory
  const modelMemoryMap: Record<string, TradingModelMemory> = {};
  for (const symbol of symbols) {
    modelMemoryMap[symbol] = {
      positions: [],

      volatility: {
        symbol: symbol + "_USDT",
        lastVolatility: [],
      },
    };
  }

  // A.6 Load compact volatility events without persisting raw/common klines,
  // unless the caller injects the already-visible SLOW volatility points.
  // BTEST:BACKTEST_VOLATILITY_DATASET
  // PROD:QUICK_BACKTEST_VISIBLE_VPOINTS
  const volatilityDatasetInput = injectedVolatilityMap
    ? buildInjectedVolatilityDataset({
        symbols,
        startTime,
        endTime,
        volatilityMap: injectedVolatilityMap,
        warmupVolatilityMap,
      })
    : await loadStoredVolatilityDataset({
        symbols,
        interval,
        range,
        startTime,
        endTime,
        useCache: useVolatilityCache,
        marketType,
      });
  const { commonTime, volatilityMap, warmupMap } = volatilityDatasetInput;

  // A.7 Volatility Map
  for (const symbol of symbols) {
    const volatilityPoints = volatilityMap[symbol];
    tradeLog.log("symbol ", volatilityPoints.length);
    modelMemoryMap[symbol].volatility = {
      symbol: `${symbol}_USDT`,
      lastVolatility: volatilityPoints,
    };
  }

  // A.8 make time
  const times = [
    ...new Set(
      Object.values(volatilityMap) // get arrays for each key
        .flat() // flatten them
        .map((item) => item.t), // extract compact volatility time
    ),
  ].sort((a, b) => a - b);

  const cutOffNoMoreEntry = times[times.length - 1] - entryCutoffBufferMs;

  // A.9 Generate Initial price norm with time
  generateInitialPriceNorm({
    symbols,
    dynamicTradeMemory,
    volatilityMap: warmupMap,
  });

  // tradeLog.log("BEGIN WITH ", dynamicTradeMemory.priceNormMapOverTime);

  // A.10 Initialize the single all-time model config
  const modelConfig = deepCopy(configuredModelConfig);

  // A.11 initialize first step
  const cropedVMapInit = cropVolatility(
    times[0],
    volatilityMap,
    undefined,
    true,
  );
  growthOvertime.push(
    countGrowthOvertime({
      timeMs: times[0],
      dynamicTradeMemory,
      modelMemoryMap,
      volatilityMap: cropedVMapInit,
      verbose: true,
    }),
  );

  // A.12 Doing reference
  const backtestPack: DataBacktestPurpose = {
    currentTimeMsBacktest: times[0],

    // used in evaluation
    tradeHistoryMap,
    growthOvertime,
    modelMemoryMap,

    // Overtime
    volatilitySnapshots: [],
    downTrend: [],

    priceNormMapOverTime: {},

    verbose,
  };

  for (const symbol of symbols) {
    backtestPack.priceNormMapOverTime[symbol] = [];
  }

  // B. BEGIN BACKTEST
  for (let index = 0, len = times.length; index < len; index++) {
    if (signal && index % 50 === 0) {
      await yieldToCancellation(signal);
    }
    const currentTimeMs = times[index];

    // in real production we cut off so the data not too large for storage
    // LIMIT_PRICE_NORM_DATA_MONTHS
    const cutOff = currentTimeMs - PRICE_NORM_DATA_MS;
    for (const symbol of Object.keys(dynamicTradeMemory.priceNormMapOverTime)) {
      dynamicTradeMemory.priceNormMapOverTime[symbol] =
        dynamicTradeMemory.priceNormMapOverTime[symbol].filter(
          (e) => e.t > cutOff,
        );
    }

    // B.1 Crop because we havent seen the next volatility points
    const cropedVMap = cropVolatility(
      currentTimeMs,
      volatilityMap,
      undefined,
      true,
    );

    // B.3 Save Haven Logic
    // tradeLog.debug("A.3 Save Haven Logic");
    const needToSafe =
      modelConfig.safePercentPerMonth !== undefined ||
      modelConfig.safeUSDTPerMonth !== undefined;

    if (needToSafe) {
      const currentBalance = countGrowthOvertime({
        timeMs: currentTimeMs,
        dynamicTradeMemory,
        modelMemoryMap,
        volatilityMap: cropedVMap,
        verbose: false,
      });

      scheduleSafeHavenRequest({
        currentTimeMs,
        config: modelConfig,
        currentAsset: currentBalance.currentAsset,
        memory: dynamicTradeMemory,
      });

      // save money
      performSafeHavenWithdrawal({ currentTimeMs, memory: dynamicTradeMemory });
    }

    if (currentTimeMs < cutOffNoMoreEntry) {
      // B.4 Decide
      const recommendedPositions = decisionEngine({
        currentTimeMs,
        volatilityPointsMap: deepCopy(cropedVMap),
        modelConfig,
        modelMemoryMap,
        dynamicTradeMemory,
        backtestPack,
        minActionableAbsoluteLevel:
          config.minActionableAbsoluteLevel,
      });

      // B.5 Do buy
      slowTradingSidewaysExit.backtest.apply({
        config,
        currentTimeMs,
        dynamicTradeMemory,
        entrySignals: recommendedPositions,
        modelMemoryMap,
        volatilityMap: cropedVMap,
      });

      for (const recommend of recommendedPositions) {
        const didOpen = tryOpenBacktestEntry({
          currentTimeMs,
          modelMemoryMap,
          dynamicTradeMemory,
          backtestPack,
          config,
          recommend,
          volume24hBySymbol,
        });

        if (didOpen) {
          onlyPushUnique(
            backtestPack.growthOvertime,
            countGrowthOvertime({
              timeMs: currentTimeMs,
              dynamicTradeMemory,
              modelMemoryMap,
              volatilityMap: cropedVMap,
              verbose: true,
            }),
            ["timeMs", "timeMsHuman"],
          );
        }
      }
    }

    // B.7 Always try to averaging
    if (config.enableWatchLogic !== false) {
      const activePositions = Object.values(modelMemoryMap).flatMap(
        (modelMemory) => modelMemory.positions ?? [],
      );
      const watchResult = generateAveragingRecommendations({
        activePositions,
        volatilityPointsMap: cropedVMap,
        config: config as any,
        currentTimeMs,
        quoteAsset: dynamicTradeMemory.quoteAsset,
        reservedQuoteAsset: dynamicTradeMemory.reservedQuoteAsset,
      });

      for (const recommend of watchResult.recommendations) {
        const didAverage = tryExecuteBacktestAveraging({
          currentTimeMs,
          modelMemoryMap,
          dynamicTradeMemory,
          backtestPack,
          config,
          recommend,
          volatilityPoints: cropedVMap[recommend.symbol ?? ""] ?? [],
        });

        if (didAverage) {
          onlyPushUnique(
            backtestPack.growthOvertime,
            countGrowthOvertime({
              timeMs: currentTimeMs,
              dynamicTradeMemory,
              modelMemoryMap,
              volatilityMap: cropedVMap,
              verbose: true,
            }),
            ["timeMs", "timeMsHuman"],
          );
        }
      }
    }

    // B.8 Always try to exit
    const sellAmount = tryToExit({
      currentTimeMs,
      volatilityMap: cropedVMap,
      modelMemoryMap,
      backtestPack,
      config,
      modelConfig,
      dynamicTradeMemory,
    });

    dynamicTradeMemory.quoteAsset += sellAmount;

    onlyPushUnique(
      backtestPack.growthOvertime,
      countGrowthOvertime({
        timeMs: currentTimeMs,
        dynamicTradeMemory,
        modelMemoryMap,
        volatilityMap: cropedVMap,
        verbose: sellAmount !== 0,
      }),
      ["timeMs", "timeMsHuman"],
    );
  }

  // C. FINAL EXIT
  signal?.throwIfAborted();
  dynamicTradeMemory.quoteAsset += tryToExit({
    currentTimeMs: commonTime.commonEnd,
    volatilityMap,
    modelMemoryMap,
    forceSell: true,
    backtestPack,
    config,
    modelConfig,
    dynamicTradeMemory,
  });

  onlyPushUnique(
    backtestPack.growthOvertime,
    countGrowthOvertime({
      timeMs: commonTime.commonEnd,
      dynamicTradeMemory,
      modelMemoryMap,
      verbose: true,
    }),
    ["timeMs", "timeMsHuman"],
  );

  const totalTrades = Object.keys(tradeHistoryMap)
    .map((key) => tradeHistoryMap[key].length)
    .reduce((acc, n) => acc + n, 0);

  // cut back the padding of price norm
  for (const item of Object.keys(dynamicTradeMemory.priceNormMapOverTime)) {
    dynamicTradeMemory.priceNormMapOverTime[item] =
      dynamicTradeMemory.priceNormMapOverTime[item].filter(
        (e) => e.t >= times[0],
      );
  }

  return {
    // To make id for cache
    symbols,
    config: pureConfig,
    range,

    // Simple report
    startingBalanceUSDT,
    finalBalance: dynamicTradeMemory.quoteAsset,
    dynamicTradeMemory,

    // Reporting
    totalTrades,
    backtestPack,
  };
}

/**
 * Loads the dev/backtest volatility dataset only for file-backed backtests.
 * Quick SLOW backtests inject visible points and skip this path entirely.
 */
async function loadStoredVolatilityDataset(params: {
  symbols: string[];
  interval: RunBacktestDynamicProps["interval"];
  range: string;
  startTime?: number;
  endTime?: number;
  useCache: boolean;
  marketType: "SPOT" | "FUTURES";
}) {
  const { default: volatilityDataset } =
    await import("@/lib/devBacktest/volatility-dataset");

  return volatilityDataset.load({
    ...params,
    interval: params.interval ?? "5m",
    exchangeType: "binance",
    warmupMs: PRICE_NORM_DATA_MS,
  });
}

/**
 * Normalizes caller-provided volatility points into the same shape as the
 * compact volatility dataset loader, without any filesystem or kline work.
 */
function buildInjectedVolatilityDataset({
  symbols,
  startTime,
  endTime,
  volatilityMap,
  warmupVolatilityMap,
}: {
  symbols: string[];
  startTime?: number;
  endTime?: number;
  volatilityMap: Record<string, any[]>;
  warmupVolatilityMap?: Record<string, any[]>;
}) {
  const normalizedMap: Record<string, any[]> = {};
  const normalizedWarmupMap: Record<string, any[]> = {};

  for (const symbol of symbols) {
    const points = [...(volatilityMap[symbol] ?? [])]
      .filter((point) => {
        const time = Number(point.t);
        if (!Number.isFinite(time)) return false;
        if (startTime !== undefined && time < startTime) return false;
        if (endTime !== undefined && time > endTime) return false;
        return true;
      })
      .sort((a, b) => a.t - b.t);

    normalizedMap[symbol] = points;
    normalizedWarmupMap[symbol] = [
      ...(warmupVolatilityMap?.[symbol] ?? volatilityMap[symbol] ?? []),
    ]
      .filter((point) => Number.isFinite(Number(point.t)))
      .sort((a, b) => a.t - b.t);
  }

  const times = Array.from(
    new Set(
      Object.values(normalizedMap)
        .flat()
        .map((point) => point.t),
    ),
  ).sort((a, b) => a - b);

  if (times.length === 0) {
    throw new Error("Quick backtest has no volatility points in this range");
  }

  return {
    commonTime: {
      commonStart: times[0],
      commonEnd: times[times.length - 1],
      commonLength: times.length,
    },
    volatilityMap: normalizedMap,
    warmupMap: normalizedWarmupMap,
  };
}
