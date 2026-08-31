import { FILES } from "@/components/storage";
import { mergeVolatilityMemoryById } from "@/components/api/production/utils";
import fs from "fs-extra";
import type { SlowTradingModeState, SlowTradingStorageData } from "./types";

/**
 * Persist runtime caches derived from a completed cycle back to disk.
 */
export async function persistModeStateCaches(params: {
  exchangeType: SlowTradingStorageData["config"]["exchangeType"];
  modeState: SlowTradingModeState;
}) {
  const { exchangeType, modeState } = params;

  await fs.ensureDir(FILES.slow.volatility(exchangeType));

  for (const tradeSetting of modeState.tradeSettings) {
    const symbol = tradeSetting.symbol;
    const modelMemory = tradeSetting.model_memory;

    if (modelMemory.volatility) {
      const volatilityFile = `${FILES.slow.volatility(exchangeType)}/${symbol}.json`;
      const persistedVolatility = (await fs.pathExists(volatilityFile))
        ? ((await fs.readJSON(volatilityFile)) as
            | NonNullable<typeof modelMemory.volatility>
            | undefined)
        : undefined;

      await fs.writeJSON(
        volatilityFile,
        mergeVolatilityMemoryById(persistedVolatility, modelMemory.volatility),
      );
      delete modelMemory.volatility;
    }
  }

  const dynamicTradeMemory = modeState.dynamicTradeMemory;
  if (dynamicTradeMemory.priceNormMapOverTime) {
    await fs.writeJSON(
      FILES.slow.priceNormMapOverTime(exchangeType),
      dynamicTradeMemory.priceNormMapOverTime,
    );
    dynamicTradeMemory.priceNormMapOverTime = {};
  }
}

/**
 * Grouped cache API for persisting transient SLOW runtime caches.
 */
const slowTradingCache = {
  modeState: {
    persistCaches: persistModeStateCaches,
  },
} as const;

export default slowTradingCache;
export { slowTradingCache };
