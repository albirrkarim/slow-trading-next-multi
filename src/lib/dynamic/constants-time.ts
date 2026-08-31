import type { VolatilitySnapshot } from "@lib/brain/algorithms/type-execute";

const halfHour = 1000 * 60 * 30;

const oneHour = halfHour * 2;
const oneDay = oneHour * 24;

export const windowsMs: Record<string, number> = {
  "5y": oneDay * 365 * 5,
  "1y": oneDay * 365,
  "6m": oneDay * 30 * 6,
  "3m": oneDay * 30 * 3,
  "1m": oneDay * 30,
  "1w": oneDay * 7,
  "3d": oneDay * 3,
  "2d": oneDay * 2,
  "1d": oneDay,
  "6h": oneHour * 6,
  "3h": oneHour * 3,
  "1h": oneHour,
  "30min": halfHour,
  "15min": halfHour / 2,
  "10min": 1000 * 60 * 10,
  "5min": 1000 * 60 * 5,
};

export const KLINE_TIME_RANGE_PROVIDED = windowsMs["1w"];

export const TIME_RANGE_PRICE = [
  "1y",
  "6m",
  "3m",
  "1m",
  "1w",
  "3d",
  "1d",
  "6h",
  "3h",
  "1h",
  "30min",
];

export const TIME_RANGE_VOLUME = ["1m", "1w", "3d", "1d", "3h", "1h", "30min"];

// export const TIME_RANGE_FED_RATE = ["5y", "1y", "6m", "3m", "1m"];

export const TIME_RANGE_FEAR_GREED = [
  "5y",
  "1y",
  "6m",
  "3m",
  "1m",
  "1w",
  "3d",
  "2d",
];

export const TIME_RANGE_FREQUENCY_LEVEL = [
  "1m",
  "1w",
  "3d",
  "1d",
  "3h",
  "1h",
  "30min",
];

export const FIXED_COINS = [
  "BTC",
  "ETH",
  "BNB",
  "SOL",
  "ADA",
  "SUI",
  "TRX",
  "HBAR",
  "LINK",
  "AAVE",
  "XRP",
  "XLM",
  // when you want to add new symbol put on the last
  // then retrain the NN
];

export const metrics: (
  | keyof VolatilitySnapshot
  | [keyof VolatilitySnapshot, string]
)[] = [
  "averageLevelTop",
  "averageLevelBottom",
  ["levelMap", "4"],
  ["levelMap", "3"],
  ["levelMap", "2"],
  ["levelMap", "1"],
  ["levelMap", "0"],
  ["levelMap", "-1"],
  ["levelMap", "-2"],
  ["levelMap", "-3"],
  ["levelMap", "-4"],
];
