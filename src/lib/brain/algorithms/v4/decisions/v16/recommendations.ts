import { deepCopy } from "@/components/client/utils";
import type { PriceNorm } from "@/lib/dynamic";
import { tradeLog } from "@/lib/trading";
import type { TradingModelMemory } from "@/lib/trading/models";
import type { EntryRecommendation } from "@lib/brain/algorithms/type-execute";
import { type VolatilityPoint } from "@lib/dynamic/utils/volatility";
import { classifier } from "./classifier";
import { getFeatures } from "./feature";
import { mapScaleValue } from "./decision";

/**
 * Generates entry recommendations based on volatility points and market features (v16).
 *
 * This function orchestrates the decision-making process by:
 * 1. Extracting candidate volatility points.
 * 2. Generating features (BTC correlation, price normalization, etc.).
 * 3. Classifying points using the v16 classifier (Hard/Soft/Top logic).
 * 4. Calculating confidence scores and recommended leverage.
 *
 * @param {Object} params - The parameter object.
 * @param {Record<string, VolatilityPoint[]>} params.volatilityPointsMap - Map of volatility points for each symbol.
 * @param {Record<string, PriceNorm[]>} params.priceNormMapOverTime - Historical price normalization data.
 * @param {Record<string, TradingModelMemory>} params.modelMemoryMap - Current state/memory of the trading models.
 * @param {boolean} [params.bypass=false] - If true, bypasses strict filtering for debugging/testing.
 * @returns {EntryRecommendation[]} A list of recommended entry points with probability and metadata.
 */
export function getRecommendationsV16({
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
  // A. Extract the last bottom and give symbol
  let flattened: VolatilityPoint[] = [];
  for (const symbol of Object.keys(volatilityPointsMap)) {
    if (symbol == "BTC") {
      continue;
    }

    for (const volatility of volatilityPointsMap[symbol]) {
      volatility.symbol = symbol;
    }

    const last = volatilityPointsMap[symbol].at(-1);

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

  if (!bypass) {
    // B. Thinking
    const temp = [];
    const btcPriceNorm = priceNormMapOverTime["BTC"].at(-1);
    if (!btcPriceNorm) {
      tradeLog.error("btcPriceNorm not found");
      return [];
    }

    for (const item of flattened) {
      // Make feature
      const feature = getFeatures({
        currentPoint: item,
        btcPriceNorm,
        priceNormMapOverTime,
        volatilityPointsMap,
        modelMemoryMap,
      });

      // Copy feature to item to debug purpose
      item.feature = deepCopy(feature);

      // Make decision
      const result = classifier(item, feature);

      if (result.entry) {
        item.probability = result.probability;
        item.descisionLabel = result.label;
        item.maxUsdtEntry = result.maxUsdtEntry;
        temp.push(item);
      }
    }

    flattened = [...temp];
  }

  if (flattened.length == 0) {
    return [];
  }

  // C. Recommendation
  const entry: EntryRecommendation[] = [];

  flattened.forEach((e) => {
    let amountProbab = 0;

    // C.1 Scale the probability based on the level
    if (e.l == "B") {
      amountProbab = mapScaleValue(-1, -5, e.lvl, 0.4, e.probability ?? 1);
    }

    if (e.l == "T") {
      amountProbab = mapScaleValue(1, 5, e.lvl, 0.4, e.probability ?? 1);
    }

    // C.2 Give message based on the label
    let message = "";
    if (e.l == "B") {
      message = `PICK LONG with probability ${amountProbab} exit at 5% profit`;
    }

    if (e.l == "T") {
      message = `PICK SHORT with probability ${amountProbab} exit at 5% profit`;
    }

    // C.3 Scale the leverage based on the level
    const level = Math.abs(e.lvl);

    let maxLeverage = 1;

    if (level == 4) {
      maxLeverage = 4;
    }

    if (level == 5) {
      maxLeverage = 5;
    }

    if (level == 6) {
      maxLeverage = 10;
    }

    entry.push({
      ...e,
      amountProbab,
      message,
      maxLeverage,
    });
  });

  return entry;
}
