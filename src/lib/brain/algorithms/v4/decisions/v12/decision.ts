import { deepCopy } from "@/components/client/utils";
import type { PriceNorm } from "@/lib/dynamic";
import {
  countGrowthOvertime,
  DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION,
} from "@/lib/dynamic";
import { MINIMAL_USDT_TO_TRADE } from "@/lib/trading/constants";
import { TRADE_MESSAGE } from "@/lib/trading/message";
import type { TradingModelMemory } from "@/lib/trading/models";
import type {
  DecisionEngineProps,
  EntryRecommendation,
} from "@lib/brain/algorithms/type-execute";
import { type VolatilityPoint } from "@lib/dynamic/utils/volatility";
import { classifier } from "./classifier";
import { getFeatures } from "./feature";
import { getInvestmentAmount, updatePriceNorm } from "./runtime";
import { tradeLog } from "@/lib/trading";

export function getRecommendations({
  volatilityPointsMap,
  priceNormMapOverTime,
  modelMemoryMap,
  bypass = false,
}: {
  volatilityPointsMap: Record<string, VolatilityPoint[]>;
  priceNormMapOverTime: Record<string, PriceNorm[]>;
  modelMemoryMap: Record<string, TradingModelMemory>;
  bypass?: boolean;
}): EntryRecommendation[] {
  // B. Extract the last bottom and give symbol
  let flattened: VolatilityPoint[] = [];
  for (const symbol of Object.keys(volatilityPointsMap)) {
    // dont enter BTC
    if (symbol == "BTC") {
      continue;
    }

    for (const volatility of volatilityPointsMap[symbol]) {
      volatility.symbol = symbol;
    }

    const last = volatilityPointsMap[symbol].at(-1);

    // if (last && last.l === "B" && !last.used && last.lvl <= 0) {

    if (bypass && last) {
      flattened.push(last);
    } else {
      if (last && !last.used && last.lvl !== 0) {
        const beforeLast = volatilityPointsMap[symbol].at(-2);

        if (beforeLast) {
          last.delta = last.t - beforeLast.t;

          last.used = true;

          flattened.push(last);
        }
      }
    }
  }

  if (bypass) {
    const entry: EntryRecommendation[] = [];

    flattened.forEach((e) => {
      let amountProbab = 0;

      if (e.l == "B") {
        amountProbab = mapScaleValue(-1, -5, e.lvl, 0.5, e.probability ?? 1);
      }

      // for futures
      if (e.l == "T") {
        amountProbab = mapScaleValue(1, 5, e.lvl, 0.5, e.probability ?? 1);
      }

      let message = "";

      if (e.l == "B") {
        message = "Good for SPOT and FUTURES (LONG)";
      }

      if (e.l == "T") {
        message = "Good for FUTURES (SHORT)";
      }

      entry.push({
        ...e,
        amountProbab,
        message,
        maxLeverage: 2,
      });
    });

    return entry;
  }

  if (flattened.length == 0) {
    return [];
  }

  flattened.sort((a, b) => a.lvl - b.lvl);

  // C. Filtering
  const temp2 = [];
  const btcPriceNorm = priceNormMapOverTime["BTC"].at(-1);
  if (!btcPriceNorm) {
    tradeLog.error("btcPriceNorm not found");
    return [];
  }

  for (const item of flattened) {
    // C.1 make feature
    const feature = getFeatures({
      currentPoint: item,
      btcPriceNorm,
      priceNormMapOverTime,
      volatilityPointsMap,
      modelMemoryMap,
    });

    item.feature = deepCopy(feature);

    const result = classifier(item, feature);

    if (result.entry) {
      item.probability = result.probability;
      item.descisionLabel = result.label;
      temp2.push(item);
    }
  }

  flattened = [...temp2];

  if (flattened.length == 0) {
    return [];
  }

  const entry: EntryRecommendation[] = [];

  flattened.forEach((e) => {
    let amountProbab = 0;

    if (e.l == "B") {
      amountProbab = mapScaleValue(-1, -5, e.lvl, 0.5, e.probability ?? 1);
    }

    // for futures
    if (e.l == "T") {
      amountProbab = mapScaleValue(1, 5, e.lvl, 0.5, e.probability ?? 1);
    }

    let message = "";

    if (e.l == "B") {
      message = `PICK LONG with probability ${amountProbab} exit on profit 5%`;
    }

    if (e.l == "T") {
      message = `PICK SHORT with probability ${amountProbab} exit on profit 5%`;
    }

    entry.push({
      ...e,
      amountProbab,
      message,
      maxLeverage: 2,
    });
  });

  return entry;
}

/**
 * decisionEngineV12 - Ankara
 * Created: 4 Dec 2025
 * Updated: 4 Dec 2025
 *
 * Based on volatilityPointsMap we try to recommend the position that we should buy it
 *
 * Return TradeHistoryVolatility[] its recommendation for buy, and we must buy it
 *
 * New Feature:
 * - Always ensure profit in the month
 */
export function decisionEngineV12({
  currentTimeMs,
  volatilityPointsMap,
  modelMemoryMap,
  dynamicTradeMemory = DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION,
  backtestPack,
}: DecisionEngineProps): EntryRecommendation[] {
  updatePriceNorm({
    currentTimeMs,
    dynamicTradeMemory: {
      priceNormMapOverTime: dynamicTradeMemory.priceNormMapOverTime,
    },
    volatilityPointsMap,
    backtestPack,
  });

  const entry: EntryRecommendation[] = getRecommendations({
    volatilityPointsMap,
    priceNormMapOverTime: dynamicTradeMemory.priceNormMapOverTime,
    modelMemoryMap,
  });

  const currentBalance = countGrowthOvertime({
    timeMs: currentTimeMs,
    dynamicTradeMemory,
    modelMemoryMap,
    volatilityMap: volatilityPointsMap,
  });

  const investAmount = getInvestmentAmount({
    dynamicTradeMemory,
    currentBalance,
    allocationPercent: 1,
    recommendedPositionsLength: entry.length,
  });

  if (investAmount < MINIMAL_USDT_TO_TRADE) {
    return [];
  }

  entry.forEach((e) => {
    const amountUSDT = Math.floor(investAmount * e.amountProbab);
    e.investAmount = amountUSDT;
  });

  entry.forEach((e) => {
    e.message = TRADE_MESSAGE.buy.COMMON;
  });

  return entry;
}

/**
 * Map scale1CurrentValue proportionally into scale2's range.
 */
export function mapScaleValue(
  scale1Min: number,
  scale1Max: number,
  scale1CurrentValue: number,
  scale2Min: number,
  scale2Max: number,
): number {
  if (scale1Max === scale1Min) return scale2Min; // avoid division by zero

  const ratio = (scale1CurrentValue - scale1Min) / (scale1Max - scale1Min);
  const scaled = scale2Min + ratio * (scale2Max - scale2Min);

  return scaled;
}
