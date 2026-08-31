import { fetchKlinesFunction } from "@/lib/datasets/fetchKlines";
import type { FetchKlinesFunctionProps } from "@/lib/datasets/type";
import type { IntervalKlines, Kline } from "@/lib/exchange/platform/tokocrypto";
import type { PredictionEngineMemory } from "./memory_design";
import { detectVolatilityPoints } from "./volatility";
import { tradeLog } from "@/lib/trading/helper/log";
import { timeMsToReadable } from "@/lib/datasets/utils";
import { LIMIT_VOLATILITY_POINT } from "@/components/constants";
import { windowsMs } from "../../constants-time";
import { getExchange, type ExchangeType } from "@/lib/exchange";
import { delay } from "@/components/api/utils";

interface PredictionEngineProps {
  tradePair: string;

  /**
   * Inject memory this is will be remember
   */
  memory: PredictionEngineMemory;

  /**
   * When production dont inject this data
   */
  klinesTemp?: Kline[];

  /**
   * Used in backtest. in production we can just undefined
   */
  endTime?: number; // used in backtest

  exchangeType?: ExchangeType;
  exchangeTypeForce?: boolean;

  marketType?: "SPOT" | "FUTURES";

  interval?: IntervalKlines;

  verbose?: boolean;

  /**
   * Use limit volatility point
   */
  useLimit?: boolean;

  /**
   * Minimum absolute volatility level that may trigger an entry.
   */
  minActionableAbsoluteLevel?: number;
}

/**
 * Returns how long kline syncing can wait for the latest volatility level.
 */
function getVPointSyncThrottleMs(
  level: number | undefined,
  minActionableAbsoluteLevel = 3,
): number {
  if (level === undefined) {
    return windowsMs["6h"];
  }

  const absoluteLevel = Math.abs(level);
  const actionableLevel =
    typeof minActionableAbsoluteLevel === "number" &&
    Number.isFinite(minActionableAbsoluteLevel)
      ? Math.max(1, Math.floor(minActionableAbsoluteLevel))
      : 3;
  const levelsBeforeActionable = actionableLevel - absoluteLevel;

  if (levelsBeforeActionable >= 3) {
    return windowsMs["6h"];
  }

  if (levelsBeforeActionable === 2) {
    return windowsMs["1h"] * 4;
  }

  return 0;
}

/**
 * Computes the observed close-price range for fetched klines.
 */
function getKlineCloseRange(klines: Kline[]) {
  let min = Infinity;
  let max = -Infinity;

  for (const kline of klines) {
    const close = parseFloat(kline[4]);
    if (!Number.isFinite(close)) continue;
    min = Math.min(min, close);
    max = Math.max(max, close);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;

  const rangePct = min > 0 ? ((max - min) / min) * 100 : 0;

  return {
    max,
    min,
    rangePct,
  };
}

export async function predictionEngine({
  tradePair,
  memory,
  klinesTemp,
  endTime,
  exchangeType = "binance",
  exchangeTypeForce = true,
  marketType,
  interval = "5m",
  verbose = false,
  useLimit = true,
  minActionableAbsoluteLevel,
}: PredictionEngineProps): Promise<PredictionEngineMemory> {
  const syncTime = endTime ?? Date.now();
  const oldVolatilityPoints = memory.lastVolatility ?? [];
  const lastVPoint = oldVolatilityPoints.at(-1);
  const throttleMs = getVPointSyncThrottleMs(
    lastVPoint?.lvl,
    minActionableAbsoluteLevel,
  );

  // BOTH:VOLATILITY_LEVEL_SYNC_THROTTLE
  if (
    throttleMs > 0 &&
    memory.vPointLastUpdate !== undefined &&
    syncTime >= memory.vPointLastUpdate &&
    syncTime - memory.vPointLastUpdate < throttleMs
  ) {
    tradeLog.debug(
      "Throttle vPoint sync",
      tradePair,
      `level ${lastVPoint?.lvl}`,
      `until ${timeMsToReadable(memory.vPointLastUpdate + throttleMs)}`,
    );
    return memory;
  }

  const fetchKlinesCustom = async (
    props: FetchKlinesFunctionProps,
  ): Promise<Kline[]> =>
    await fetchKlinesFunction({
      ...props,
      exchangeType,
      exchangeTypeForce,
      // inject static data to it so it not calling real API
      klines: klinesTemp,
      marketType,
    });

  let startTime: number | undefined = undefined;

  if (lastVPoint) {
    tradeLog.debug("USE lastVPoint", timeMsToReadable(lastVPoint.t));
    startTime = lastVPoint.t;
  }

  // Use small klines or we need look up back?
  let useSmallKlines = Boolean(
    lastVPoint !== undefined &&
    oldVolatilityPoints.length >= LIMIT_VOLATILITY_POINT,
  );

  // This for BTC its not that volatile
  if (startTime !== undefined && useSmallKlines == false) {
    // is starttime is older than one month
    const oneMonthAgo = Date.now() - windowsMs["1m"];
    if (startTime > oneMonthAgo) {
      useSmallKlines = true;
    }
  }

  tradeLog.debug("useSmallKlines ", tradePair, useSmallKlines);
  tradeLog.debug(
    "startTime ",
    timeMsToReadable(startTime),
    "endTime ",
    timeMsToReadable(endTime),
  );

  const simpleTime = useSmallKlines ? undefined : "6month";

  const exchange = getExchange(exchangeType);

  let klines: Kline[] = [];

  if (useSmallKlines) {
    if (!tradePair.includes("BTC") && lastVPoint) {
      // is the last volatility point is older than 1 month
      const oneMonthAgo = Date.now() - windowsMs["1m"];
      if (lastVPoint.t > oneMonthAgo) {
        klines = await fetchKlinesCustom({
          symbol: tradePair,
          interval,
          startTime,
          endTime,
          verbose: verbose ?? tradeLog.categories.includes("debug"),
        });
      }
    }

    if (klines.length === 0) {
      // Use small klines
      klines = await exchange.getKlines({
        symbol: tradePair,
        interval,
        simpleTime: "30minute",
        marketType,
      });
    }

    await delay((minActionableAbsoluteLevel ?? 0) >= 3 ? 300 : 1000);
  } else {
    klines = await fetchKlinesCustom({
      symbol: tradePair,
      interval,
      simpleTime,
      startTime,
      endTime,
      verbose: verbose ?? tradeLog.categories.includes("debug"),
    });
  }

  // Generate volatility map
  let newVolatilityPoints = detectVolatilityPoints({
    klines,
    symbol: memory.symbol,
    vPointBefore: lastVPoint,
  });

  if (lastVPoint) {
    newVolatilityPoints = newVolatilityPoints.filter((v) => v.t > lastVPoint.t);
  }

  const allVolatility = [...oldVolatilityPoints, ...newVolatilityPoints];

  if (allVolatility.length === 0 && klines.length > 0) {
    const closeRange = getKlineCloseRange(klines);

    tradeLog.warn(
      "No volatility points generated",
      tradePair,
      `klines ${klines.length}`,
      closeRange
        ? `close range ${closeRange.rangePct.toFixed(2)}% (${closeRange.min} - ${closeRange.max})`
        : "close range unavailable",
    );
  }

  if (klines.length > 0) {
    // detect something wrong
    // if (klinesTemp) {
    //   const lastTemp = klinesTemp.at(-1)?.[0] ?? 0;
    //   const requestedEndTime
    // }
    // console.log("useSmallKlines ", useSmallKlines);
    // console.log("lastVPoint ", lastVPoint);
    // console.log(
    //   oldVolatilityPoints.length,
    //   "oldVolatilityPoints.length >= limitPoints ",
    //   oldVolatilityPoints.length >= limitPoints
    // );
    // if (klinesTemp) {
    //   console.log("temp Start ", timeMsToReadable(klinesTemp[0][0]));
    //   console.log("temp End ", timeMsToReadable(klinesTemp.at(-1)?.[0] ?? 0));
    // }
    // console.log(
    //   "FETCH startTime",
    //   startTime ? timeMsToReadable(startTime) : "undefined"
    // );
    // console.log("FETCH endTime", timeMsToReadable(endTime));
    // console.log("result Start ", timeMsToReadable(klines[0][0]));
    // console.log("result End ", timeMsToReadable(klines.at(-1)?.[0] ?? 0));
    // console.log(memory.symbol, "allVolatility ", allVolatility.length);
    // console.log("\n\n");
  }

  if (useLimit) {
    memory.lastVolatility = [...allVolatility.slice(-LIMIT_VOLATILITY_POINT)];
  } else {
    memory.lastVolatility = [...allVolatility];
  }

  // give symbol
  memory.lastVolatility.forEach((e) => {
    e.symbol = memory.symbol;
  });

  memory.vPointLastUpdate = syncTime;

  return memory;
}
