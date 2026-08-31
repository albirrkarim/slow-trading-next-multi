import { deepCopy } from "@/components/client/utils";
import type { PriceNorm } from "@/lib/dynamic";
import { tradeLog } from "@/lib/trading";
import type { TradingModelMemory } from "@/lib/trading/models";
import type { EntryRecommendation } from "@lib/brain/algorithms/type-execute";
import { type VolatilityPoint } from "@lib/dynamic/utils/volatility";
import { classifier } from "./classifier";
import { mapScaleValue } from "./decision";
import { getFeatures } from "../v17/feature";

export function getRecommendationsV18({
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

  flattened.sort((a, b) => a.lvl - b.lvl);

  if (!bypass) {
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

      const result = classifier(item, feature, 3);

      if (result.entry) {
        item.probability = result.probability;
        item.descisionLabel = result.label;
        temp2.push(item);
      }
    }

    flattened = [...temp2];
  }

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
      message = `Good entry (LONG) with probability ${amountProbab} exit on profit 5%`;
    }

    if (e.l == "T") {
      message = `Good entry (SHORT) with probability ${amountProbab} exit on profit 5%`;
    }

    entry.push({
      ...e,
      amountProbab,
      message,
      maxLeverage: 3,
    });
  });

  return entry;
}
