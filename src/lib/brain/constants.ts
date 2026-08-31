import { windowsMs } from "../dynamic/utils/nn/data/features/constants";

// USED Both backtest and production.
// So the result will be the same
// ========================================================
export const PRICE_NORM_DATA_MONTHS = 6; // in months

export const PRICE_NORM_DATA_MS = windowsMs["1m"] * PRICE_NORM_DATA_MONTHS;

export const VOLATILITY_THRESHOLD = process.env.VOLATILITY_THRESHOLD
  ? parseInt(process.env.VOLATILITY_THRESHOLD)
  : 5; // in percent
