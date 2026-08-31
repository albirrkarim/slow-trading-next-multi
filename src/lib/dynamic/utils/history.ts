import { deepCopy } from "@/components/client/utils";
import { getRecommendationsProduction } from "@/lib/brain/algorithms";
import type { EntryRecommendation } from "@/lib/brain/algorithms/type-execute";
import { PRICE_NORM_DATA_MS } from "@/lib/brain/constants";
import { updatePriceNorm } from "@/lib/dynamic/utils/priceNorm";
import type { ExchangeType } from "@/lib/exchange";
import { DEFAULT_EXCHANGE } from "@/lib/exchange/constants";
import type { TradingModelMemory } from "@/lib/trading/models";
import {
  cropVolatility,
  DEFAULT_DYNAMIC_TRADING_MEMORY,
  generateInitialPriceNorm,
} from "..";
import type { VolatilityPoint } from "./volatility";
import { tradeLog } from "@/lib/trading";
import moment from "moment-timezone";

interface GetHistoricalEntrySignalProps {
  volatilityMap: Record<string, VolatilityPoint[]>;
  getRecommendations?: typeof getRecommendationsProduction;
  exchangeType?: ExchangeType;
  minActionableAbsoluteLevel?: number;
}

export async function getHistoricalEntrySignal({
  volatilityMap,
  getRecommendations = getRecommendationsProduction,
  exchangeType = DEFAULT_EXCHANGE as ExchangeType,
  minActionableAbsoluteLevel,
}: GetHistoricalEntrySignalProps): Promise<EntryRecommendation[]> {
  const volatilityMapForHistory = deepCopy(volatilityMap);
  const symbols = Object.keys(volatilityMapForHistory);

  for (const symbol of symbols) {
    for (const point of volatilityMapForHistory[symbol] ?? []) {
      delete point.used;
    }
  }

  const entryRecommendations: EntryRecommendation[] = [];

  const modelMemoryMap: Record<string, TradingModelMemory> = {};

  for (const symbol of symbols) {
    modelMemoryMap[symbol] = {
      positions: [],
      volatility: {
        symbol,
        lastVolatility: [],
      },
    };
  }

  const dynamicTradeMemory = deepCopy(DEFAULT_DYNAMIC_TRADING_MEMORY);
  const currentTimeMs = Date.now();

  tradeLog.debug("RUN INITIAL PRICE");
  await generateInitialPriceNorm({
    currentTimeMs,
    symbols,
    startTime: currentTimeMs,
    dynamicTradeMemory,
    useCache: true,
    saveToFile: true,
    exchangeType,
    volatilityMap: volatilityMapForHistory,
  });

  // flattened time
  const times = [
    ...new Set(
      Object.values(volatilityMapForHistory) // get arrays for each key
        .flat() // flatten them
        .map((item) => item.t), // extract `time`
    ),
  ].sort((a, b) => a - b);

  tradeLog.debug("RUN BACKTEST");

  tradeLog.debug("start ", moment(times[0]).format("DD-MMM-YYYY HH:mm"));
  tradeLog.debug(
    "end ",
    moment(times[times.length - 1]).format("DD-MMM-YYYY HH:mm"),
  );

  for (const currentTimeMsLocal of times) {
    // in real production we cut off so the data not too large for storage
    // LIMIT_PRICE_NORM_DATA_MONTHS
    const cutOff = currentTimeMsLocal - PRICE_NORM_DATA_MS;
    for (const symbol of Object.keys(dynamicTradeMemory.priceNormMapOverTime)) {
      dynamicTradeMemory.priceNormMapOverTime[symbol] =
        dynamicTradeMemory.priceNormMapOverTime[symbol].filter(
          (e) => e.t > cutOff,
        );
    }

    // B.2 Crop because we havent seen the next volatility points
    const cropedVMap = cropVolatility(
      currentTimeMsLocal,
      volatilityMapForHistory,
    );

    updatePriceNorm({
      currentTimeMs: currentTimeMsLocal,
      dynamicTradeMemory: {
        priceNormMapOverTime: dynamicTradeMemory.priceNormMapOverTime,
      },
      volatilityPointsMap: cropedVMap,
    });

    const entrySignals = await getRecommendations({
      volatilityPointsMap: cropedVMap,
      priceNormMapOverTime: dynamicTradeMemory.priceNormMapOverTime,
      modelMemoryMap,
      minActionableAbsoluteLevel,
    });

    entryRecommendations.push(...entrySignals);
  }

  tradeLog.debug("RUN BACKTEST END");

  return entryRecommendations;
}
