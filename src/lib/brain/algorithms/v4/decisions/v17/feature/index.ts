
import { windowsMs } from "@/lib/dynamic/utils/nn/data/features/constants";
import { type VolatilityPoint } from "@/lib/dynamic/utils/volatility";
import { type TradingModelMemory } from "@/lib/trading/models";
import { type Features } from "./feature-type";
import {
  calculateMarketFeatures,
  extractBTCFeatures,
  extractTargetCoinFeatures,
} from "./utils";
import { calculateSensitiveFeatures } from "./sensitive";
import type { PriceNorm } from "@/lib/dynamic";

export type { Features };

const last15Day = windowsMs["1m"] / 2;

interface GetFeatureProps {
  currentPoint: VolatilityPoint;

  btcPriceNorm: PriceNorm;

  priceNormMapOverTime: Record<string, PriceNorm[]>;

  volatilityPointsMap: Record<string, VolatilityPoint[]>;

  modelMemoryMap: Record<string, TradingModelMemory>;
}

/**
 * Function to extract features for decision making
 *
 * So decision functions will easily consume the features
 */
export function getFeatures({
  currentPoint,
  btcPriceNorm,
  priceNormMapOverTime,
  volatilityPointsMap,
  modelMemoryMap,
}: GetFeatureProps): Features {
  const symbol = currentPoint.symbol ?? "";
  const cutOff = currentPoint.t - last15Day;

  // A. Extract Target Coin Features
  const targetCoinFeatures = extractTargetCoinFeatures({
    currentPoint,
    symbol,
    cutOff,
    priceNormMapOverTime,
    volatilityPointsMap,
  });

  // B. Extract BTC Features
  const btcFeatures = extractBTCFeatures({
    btcPriceNorm,
    cutOff,
    currentPoint,
    priceNormMapOverTime,
    volatilityPointsMap,
  });

  // C. Calculate Comparative Metrics
  const comparativeFeatures = {
    diffWithBTC:
      btcFeatures.currentPriceNorm -
      targetCoinFeatures.currentPriceNorm.c,
  };

  // D. Calculate Market-Wide Metrics
  const marketFeatures = calculateMarketFeatures({
    currentPoint,
    volatilityPointsMap,
  });

  // first day of current month
  const currentDate = new Date(currentPoint.t);
  const currentMonth = currentDate.getUTCMonth();
  const firstDayOfMonth = Date.UTC(
    currentDate.getUTCFullYear(),
    currentMonth,
    1,
    0,
    0,
    0
  );

  let numberOfProfitTrades = 0;
  for (const symbolLocal of Object.keys(modelMemoryMap)) {
    const modelMemory = modelMemoryMap[symbolLocal];

    const tradesThisMonth = (modelMemory.positionsSell ?? []).filter(
      (trade) => (trade.closed?.t ?? 0) >= firstDayOfMonth
    );

    numberOfProfitTrades += tradesThisMonth.length;
  }

  // E. Calculate Sensitive Market Metrics
  const sensitive = calculateSensitiveFeatures({
    currentPoint,
    volatilityPointsMap,
  });

  return {
    currentPoint,
    targetCoin: targetCoinFeatures,
    btc: btcFeatures,
    comparative: comparativeFeatures,
    market: marketFeatures,
    trading: {
      numberOfProfitTrades,
    },
    sensitive,
    debug: {
      priceNormsLength: targetCoinFeatures.priceNormsLength,
    },
  };
}
