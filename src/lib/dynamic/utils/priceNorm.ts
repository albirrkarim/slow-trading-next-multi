import { FILES } from "@/components/storage";
import { PRICE_NORM_DATA_MONTHS } from "@/lib/brain/constants";
import type { DataBacktestPurpose } from "@/lib/brain/algorithms/type-execute";
import type { ExchangeType } from "@/lib/exchange";
import { DEFAULT_EXCHANGE } from "@/lib/exchange/constants";
import { tradeLog } from "@/lib/trading";
import fs from "fs-extra";
import { onlyPushUnique } from "./assets";
import { windowsMs } from "./nn/data/features/constants";
import type { PriceNorm } from "../type-dynamic";
import type { VolatilityPoint } from "./volatility";

export interface DynamicTradeMemorySimple {
  priceNormMapOverTime: Record<string, PriceNorm[]>;
}

interface UpdatePriceNormProps {
  currentTimeMs: number;
  dynamicTradeMemory: DynamicTradeMemorySimple;
  volatilityPointsMap: Record<string, VolatilityPoint[]>;

  backtestPack?: DataBacktestPurpose;
}

/**
 * Updates compact price-normalization history from current volatility points.
 */
export function updatePriceNorm({
  currentTimeMs,
  dynamicTradeMemory,
  volatilityPointsMap,
  backtestPack,
}: UpdatePriceNormProps) {
  const cutOffOneYear = currentTimeMs - windowsMs["1y"];

  for (const symbol of Object.keys(volatilityPointsMap)) {
    const prices = volatilityPointsMap[symbol].map((point) => point.p);
    const price = prices.at(-1);

    if (!price) {
      continue;
    }

    if (!dynamicTradeMemory.priceNormMapOverTime[symbol]) {
      dynamicTradeMemory.priceNormMapOverTime[symbol] = [];
    }

    const oneYear = dynamicTradeMemory.priceNormMapOverTime[symbol].filter(
      (point) => point.t > cutOffOneYear,
    );

    const min = Math.min(...prices, ...oneYear.map((point) => point.n));
    const max = Math.max(...prices, ...oneYear.map((point) => point.x));

    const priceNorm = {
      t: currentTimeMs,
      x: max,
      n: min,
      c: parseFloat(((price - min) / (max - min || 1)).toFixed(2)),
    };

    if (backtestPack) {
      onlyPushUnique(backtestPack.priceNormMapOverTime[symbol], priceNorm, [
        "t",
      ]);
    }

    onlyPushUnique(dynamicTradeMemory.priceNormMapOverTime[symbol], priceNorm, [
      "t",
    ]);
  }
}

interface GenerateInitialPriceNorm {
  currentTimeMs?: number;

  symbols: string[];

  startTime: number;

  dynamicTradeMemory: DynamicTradeMemorySimple;

  months?: number;

  useCache?: boolean;

  exchangeType?: ExchangeType;

  volatilityMap: Record<string, VolatilityPoint<any>[]>;

  saveToFile?: boolean;
}

/**
 * so we can know price norm before
 */
export async function generateInitialPriceNorm({
  currentTimeMs,
  symbols,
  dynamicTradeMemory,
  months = PRICE_NORM_DATA_MONTHS,
  useCache = false,
  exchangeType = DEFAULT_EXCHANGE as ExchangeType,
  volatilityMap,
  saveToFile = false,
}: GenerateInitialPriceNorm) {
  if (!dynamicTradeMemory.priceNormMapOverTime) {
    dynamicTradeMemory.priceNormMapOverTime = {};
  }

  const requestedSymbols = [...new Set(symbols)];

  // A. PRODUCTION
  // check cache
  if (
    (await fs.exists(FILES.slow.priceNormMapOverTime(exchangeType))) &&
    useCache
  ) {
    dynamicTradeMemory.priceNormMapOverTime = await fs.readJSON(
      FILES.slow.priceNormMapOverTime(exchangeType),
    );

    if (currentTimeMs) {
      // in real production we cut off so the data not too large for storage
      const cutOffOneYear = currentTimeMs - windowsMs["1m"] * months;
      for (const symbol of Object.keys(
        dynamicTradeMemory.priceNormMapOverTime,
      )) {
        dynamicTradeMemory.priceNormMapOverTime[symbol] =
          dynamicTradeMemory.priceNormMapOverTime[symbol].filter(
            (e) => e.t > cutOffOneYear,
          );
      }
    }
  }

  // B. Detect only the symbols that still need initial price-norm data.
  const missingSymbols: string[] = [];
  for (const symbol of requestedSymbols) {
    if (!dynamicTradeMemory.priceNormMapOverTime[symbol]) {
      dynamicTradeMemory.priceNormMapOverTime[symbol] = [];
    }

    if (dynamicTradeMemory.priceNormMapOverTime[symbol].length == 0) {
      if (volatilityMap[symbol] && volatilityMap[symbol].length > 0) {
        missingSymbols.push(symbol);
      } else {
        tradeLog.warn(
          symbol,
          "Vpoints.length of symbol is empty, cant generate price norm",
        );
      }
    }
  }

  if (missingSymbols.length === 0) {
    // no need to give initialization
    return;
  }

  // C. Generate only missing symbols so adding one symbol does not rebuild all.
  tradeLog.debug("C. GENERATE MISSING PRICE NORM", {
    exchangeType,
    symbols: missingSymbols,
  });

  for (const symbol of missingSymbols) {
    dynamicTradeMemory.priceNormMapOverTime[symbol] = [];

    const vPoints = volatilityMap[symbol];

    const times = vPoints.map((e) => e.t);

    for (let index = 0, len = times.length; index < len; index++) {
      const currentTimeMsLocal = times[index];

      const cropedVMap = cropVolatility(currentTimeMsLocal, {
        symbol: vPoints,
      });

      updatePriceNorm({
        currentTimeMs: currentTimeMsLocal,
        dynamicTradeMemory: {
          priceNormMapOverTime: dynamicTradeMemory.priceNormMapOverTime,
        },
        volatilityPointsMap: cropedVMap,
      });
    }
  }

  if (saveToFile) {
    await fs.writeJson(
      FILES.slow.priceNormMapOverTime(exchangeType),
      dynamicTradeMemory.priceNormMapOverTime,
    );
  }
}

/**
 * Crop because we havent seen the next volatility points
 * @param currentTimeMs
 * @param volatilityMap
 */
export function cropVolatility(
  currentTimeMs: number,
  volatilityMap: Record<string, VolatilityPoint[]>,
  startTimeMs?: number,
  includeCurrentPoint = false,
): Record<string, VolatilityPoint[]> {
  const newVMap: Record<string, VolatilityPoint[]> = {};

  for (const symbol of Object.keys(volatilityMap)) {
    const points = volatilityMap[symbol];

    let filtered = points.filter((p) =>
      includeCurrentPoint ? p.t <= currentTimeMs : p.t < currentTimeMs,
    );

    if (startTimeMs) {
      filtered = filtered.filter((p) => p.t >= startTimeMs);
    }

    // Keep only last 100 points to avoid memory bloat
    newVMap[symbol] = filtered.slice(-100);
  }

  return {
    ...newVMap,
  };
}
