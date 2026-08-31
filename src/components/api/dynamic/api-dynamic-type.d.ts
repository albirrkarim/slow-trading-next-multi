import type { Leaderboards } from "@/components/dev/DynamicTrade/type-dynamic-report";
import type {
  BacktestConfigDynamic,
  CommonTime,
} from "@/lib/dynamic";
import type { DynamicTradeAlgorithm } from "@lib/brain/algorithms";
import type { DecisionEngineVersionType } from "@lib/brain/algorithms/v4/decisions";
import type {
  GetIncomePerMonthReturn,
  PassiveIncomeMetrics,
  TradingPerformance,
} from "@/lib/evaluate";
import type { Aggregated } from "@/lib/evaluate/analysis/volatility";
import type { IntervalKlines } from "@/lib/exchange/platform/tokocrypto";
import type {
  PositionCloseReason,
  TradingModelMemory,
} from "@/lib/trading/models";

export interface SeriesMinimal {
  time: number;
  level: number;
  color?: string;
  text?: string;
}

interface MultiLinePair {
  series: SeriesMinimal[][];
  names: string[];
}

export interface DynamicTradeBacktestReturn {
  symbols: string[];
  range: string;
  startingBalanceUSDT: number;

  /**
   * Compact closed-position results used by backtest reporting views.
   */
  tradeHistory: DynamicTradeClosedTrade[];

  /**
   * All Series must follow the start and the end of the growthOvertimeSeries
   */
  growthOvertimeSeries?: MultiLinePair;

  vPointsSeries: MultiLinePair;

  priceSeries: MultiLinePair;

  customSeries?: MultiLinePair;

  vSnapshots: Record<string, MultiLinePair>;

  tradeCountMap: Record<string, number>;

  /**
   * Traditional evaluation
   */
  evaluation: {
    performance: TradingPerformance;
    stability: GetIncomePerMonthReturn;
    passive: PassiveIncomeMetrics;
    positionPerformance: Aggregated[];
  };

  /**
   * So we can just easy choose
   */
  leaderboards: Leaderboards;

  /**
   * For the klines
   */
  commonTime: CommonTime;
}

export interface DynamicTradeClosedTrade {
  symbol: string;
  entryTime: number;
  exitTime?: number;
  exitReason?: PositionCloseReason;
  netProfitUSDT: number;
}

export interface DynamicTradeBacktestInput {
  mode: "kline" | "volatility_point";
  symbols: string[];
  range: string;
  interval: IntervalKlines;

  startTime?: number;
  endTime?: number;

  algorithm: DynamicTradeAlgorithm;
  decisionEngineVersion: DecisionEngineVersionType;

  config: BacktestConfigDynamic;

  upToDateKlines: boolean;
  upToDateDecisionBacktest: boolean;
  verbose: boolean;
}

export interface TradeSettings {
  symbol: string
  model_memory: TradingModelMemory
}
