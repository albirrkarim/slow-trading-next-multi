import {
  DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION,
  DEFAULT_DYNAMIC_TRADING_MEMORY,
} from "./constants";
import { countGrowthOvertime } from "./utils/assets";
import {
  buildMonthToSeasonMap,
  findSeasonIndexForMonth,
  monthFromMs,
  validateSeasonalConfig,
} from "./utils/config";
import { generateInitialPriceNorm } from "./utils/priceNorm";

export type * from "./type-dynamic.d";
export type * from "./type-backtest.d";

export * from "./client";
export * from "./constants";

export * from "./utils/nn/data/features/data";
export * from "./utils/assets";
export * from "./utils/priceNorm";
export * from "./utils/config";
export * from "./utils/data";
export * from "./utils/volatility/memory_design";
export * from "./utils/volatility";
export * from "./utils/volatility/engine";

/**
 * Grouped dynamic/backtest API for callers that need related dynamic trading
 * helpers without importing many standalone functions.
 */
const dynamic = {
  defaults: {
    tradeConfigProduction: DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION,
    tradingMemory: DEFAULT_DYNAMIC_TRADING_MEMORY,
  },
  balance: {
    countGrowthOvertime,
  },
  config: {
    buildMonthToSeasonMap,
    findSeasonIndexForMonth,
    monthFromMs,
    validateSeasonalConfig,
  },
  priceNorm: {
    generateInitial: generateInitialPriceNorm,
  },
} as const;

export default dynamic;
export { dynamic };
