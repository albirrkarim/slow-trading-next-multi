import type {
  DynamicTradeMemory,
  TradeHistoryDynamic,
} from "@/lib/dynamic/backtest/type";
import type { GrowthOvertimeDetail } from "@/lib/dynamic/backtest-volatility/type";
import type { Kline } from "@/lib/exchange/platform/tokocrypto";
import type { TradingReturn } from "@/lib/trading";
import type {
  TradeDecisionFunction,
  TradingModelConfig,
  TradingModelMemory,
} from "@/lib/trading/models";
import type { GlobalMarketData } from "@lib/dynamic/utils/nn/data";
import { type VolatilityPoint } from "@lib/dynamic/utils/volatility";
import { type DecisionEngineVersionType } from "./v4/decisions";

export interface DecisionEngineProps {
  currentTimeMs: number;

  volatilityPointsMap: Record<string, VolatilityPoint[]>;

  modelConfig: TradingModelConfig;

  modelMemoryMap: Record<string, TradingModelMemory>;

  dynamicTradeMemory?: DynamicTradeMemory;

  backtestPack?: DataBacktestPurpose;

  /**
   * Minimum absolute volatility level a compatible engine may enter immediately.
   */
  minActionableAbsoluteLevel?: number;
}

export interface TradeRecommendationBase extends VolatilityPoint {
  /**
   * eg.
   * - good for FUTURES (LONG) and SPOT
   * - good for FUTURES (SHORT)
   */
  message: string;
}

/**
 * This is a recommendation to open a new position.
 */
export interface EntryRecommendation extends TradeRecommendationBase {
  /**
   * Confidence/allocation weight from the decision engine, from 0 to 1.
   *
   * Backtest:
   * - Decision engines convert this into investAmount before opening entries.
   * - Backtest entry then uses investAmount as the desired margin USDT.
   * - Futures backtest entry maps amountProbab into the same initial leverage
   *   range as production before applying the leverage caps.
   *
   * Production:
   * - Live entry sizes the order as runtimeBudgetUSDT * amountProbab.
   * - Futures entry also maps amountProbab into the initial leverage range
   *   before applying entrySignal.maxLeverage and dynamicTradeConfig.maxLeverage
   *   as caps. A positive dynamicTradeConfig.exactLeverage overrides that
   *   calculation.
   */
  amountProbab: number;

  /**
   * Max leverage suggested by the decision engine.
   * Futures entry uses this as an engine cap in both backtest and production.
   */
  maxLeverage: number;

  /**
   * Resolved margin USDT for this entry recommendation.
   * Backtest entry uses this directly; live entry currently receives
   * the budget separately and still sizes by amountProbab.
   */
  investAmount?: number;
}

export interface EntryRecommendationDiagnostic {
  code: string;
  level: number;
  pointId: string;
  reason: string;
  status: "blocked" | "ready";
  symbol: string;
}

export interface EntryRecommendationEvaluation<
  TDiagnostic extends EntryRecommendationDiagnostic = EntryRecommendationDiagnostic,
> {
  diagnostics: TDiagnostic[];
  recommendations: EntryRecommendation[];
}

/**
 * This is a recommendation to add margin to an existing open position.
 */
export interface AveragingRecommendation extends TradeRecommendationBase {
  /**
   * Margin USDT to spend on this averaging step.
   */
  investAmount: number;

  /**
   * Position leverage retained for fallback/reporting.
   */
  maxLeverage?: number;

}

/**
 * Sharing type across dynamic trade algorithms
 */

interface RequiredForTrade {
  /**
   * So we can modify the global
   *
   * precalculate this inside the api code, not from the n8n
   */
  dynamicTradeMemory: DynamicTradeMemory;

  /**
   * model memory map from google sheet
   */
  modelMemoryMap: Record<string, TradingModelMemory>;

  /**
   * model config is also from google sheet
   */
  modelConfig: TradingModelConfig;

  /**
   * Chunked Klines.
   *
   * In api code make this, also
   */
  klinesMap: Record<string, Kline[]>;

  /**
   * dynamic.v1 - model that can be controlled
   */
  getTradingDecisionFunction?: TradeDecisionFunction;
}

/**
 * n8n will send this
 */
export interface DataFromAPI extends Omit<
  RequiredForTrade,
  "getTradingDecisionFunction"
> {
  /**
   * BTC, ETH
   */
  symbols: string[];

  decisionEngineVersion?: DecisionEngineVersionType;

  /**
   * Minimum absolute volatility level a compatible engine may enter immediately.
   */
  minActionableAbsoluteLevel?: number;
}

/**
 * Something related to backtest for reporting
 */
export interface DataBacktestPurpose {
  /**
   * This will be interable
   */
  currentTimeMsBacktest: number; // when its backtest

  /**
   * {
   *  BTC:[]
   * }
   */
  tradeHistoryMap: Record<string, TradeHistoryDynamic[]>;

  // Overtime ======================================================
  /**
   * All asset growth
   */
  growthOvertime: GrowthOvertimeDetail[];

  /**
   * Track the model memory change overtime
   */
  // modelMemoryOvertime?: Record<string, any>;

  modelMemoryMap: Record<string, TradingModelMemory>;

  /**
   * VolatilityLevelSnapshot
   */
  volatilitySnapshots?: VolatilitySnapshot[];

  /**
   * to determine we should change the model config
   */
  downTrend?: { timeMs: number; level: number }[];

  priceNormMapOverTime: Record<string, PriceNorm[]>;

  verbose: boolean;
}

/**
 * Snapshot of all volatility point of the coins
 */
export interface VolatilitySnapshot {
  /**
   * Save only the month
   * Defined in miliseconds
   *
   * [INCLUDE FOR DATASET]
   */
  timeMs: number;

  /**
   * [INCLUDE FOR DATASET]
   * Value will be 0 - maybe about 5 or more..
   *
   * Based on the levelMap this averageLevelBottom is avg of count of the level where bellow 0
   *
   * Example:
   *
   */
  averageLevelTop: number;

  /**
   * [INCLUDE FOR DATASET]
   * Value will be 0 - maybe about 5 or more..
   *
   * Based on the levelMap this averageLevelBottom is avg of count of the level where bellow 0
   *
   * Example:
   *  3: 45
   *  2: 33
   *  1: 20
   */
  averageLevelBottom: number;

  /**
   * [INCLUDE FOR DATASET:
   *   as we dont know how big the level is so do maximal level 10.
   *   so when the record is not reach 10. just make the level number and the count is 0
   *    (fill the blank)
   *  .
   *  then flatten this object
   * ]
   *
   * At the current time. count how many present for each level of the volatility point for each coins
   *
   * Value will be 0 - maybe about 5 or more..
   *
   * Data look like:
   *
   * {
   *  3: 45
   *  2: 33
   *  1: 20
   *  0: 50
   *  -1: 20
   *  -2: 30
   *  -3: 20
   * }
   */
  levelMap: Record<string, number>;
}

export interface ExecuteDynamicTradeProps extends DataFromAPI {
  globalMarketData: GlobalMarketData;

  backtest?: DataBacktestPurpose;
}

export interface DoTradeProps extends RequiredForTrade {
  /**
   * BTC, ETH
   */
  symbol: string;

  /**
   * klines[0]
   */
  currentTimeMs: number;

  /**
   *
   */
  backtest?: DataBacktestPurpose;
}

export interface DynamicTradeReturn {
  /**
   * For further debugging
   */
  reports: TradingReturn[];
  /**
   * Continue Looping?
   */
  continue: boolean;
}
