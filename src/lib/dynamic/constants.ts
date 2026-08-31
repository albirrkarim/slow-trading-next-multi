import type { DynamicTradeConfig, DynamicTradeMemory } from ".";
import { TradingMode } from "../exchange/types";
import adaptiveAveraging from "../trading/adaptive-averaging";
import postAverageRescue from "../trading/post-average-rescue";
import postAverageStopLoss from "../trading/post-average-stop-loss";
import { DESCISION_MODELS } from "./constants-clients";

export const DEFAULT_DYNAMIC_TRADING_MEMORY: DynamicTradeMemory = {
  startingBalanceUSDT: 0,
  quoteAsset: 0,
  safeHaven: 0,
  safeHavenRequest: 0,
  safeHavenHistory: [],
  volatilitySnapshots: [],
  priceNormMapOverTime: {},
};

export const DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION: DynamicTradeConfig = {
  name: "SLOW Trade",
  description: "",
  symbols: ["SUI", "SOL", "HBAR"],
  decisionEngineVersion: "decision.v14",
  modelConfig: {
    takeProfitPercent: 5,
    stopLossPercent: 20,
    exitOnVPointAbsLevel: 0,
    stopLossUSDT: 50,
    volatilityTargetStopLossPercent: 0,
    postAverageRescueExit: postAverageRescue.config.createDefault(),
    postAverageStopLoss: postAverageStopLoss.config.createDefault(),
    useStopLossPlus: false,
    stopLossPlusTrigger: 1,
    safePercentPerMonth: 0.1,
    minimalAssetOnTrade: 600,
  },

  tradingMode: TradingMode.SPOT,
  exchangeType: "binance",
  adaptiveAveraging: adaptiveAveraging.config.createDefault(),
  averagingRescueProjectionGuardEnabled: true,
  exitSidewaysToFreeWorkersForStrongCandidates: false,
  maxOpenPositions: 0,
  maxEntryBased24HourVolPct: 0.2,
  minActionableAbsoluteLevel: 2,
  exactLeverage: 0,
};

export const DYNAMIC_MODELS = [
  {
    name: "dynamic.v4",
    descrption:
      "Rule based, Selective features selection, More Fluid, Balanced Trades, To minimize the drawdown, and bear market prove",
  },
];

export { DESCISION_MODELS };

/**
 * sampling is 2 month = 60days
 */
export const daysPerChunk = 60;

export const fiveMinutesMs = 5 * 60 * 1000;

/**
 * 12 = number of 5-minute candles in one hour (60 / 5 = 12
 * 24 = hours per day.
 */
export const candlesInDay = 12 * 24;
