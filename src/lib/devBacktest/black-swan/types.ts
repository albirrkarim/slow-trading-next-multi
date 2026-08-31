import type { DynamicTradeConfig } from "@/lib/dynamic/type-dynamic";
import type {
  BlackSwanConfig,
  BlackSwanReason,
  BlackSwanStatus,
} from "@/lib/trading/black-swan";
import type { PositionCloseReason, PositionDirection } from "@/lib/trading/models";

export interface BlackSwanBacktestInput {
  symbols: string[];
  startTime: number;
  endTime: number;
  config: BlackSwanConfig;
  /** Cancels server-side replay work when its requesting client disconnects. */
  signal?: AbortSignal;
  useCache?: boolean;
}

export interface BlackSwanBacktestPoint {
  t: number;
  price: number;
  btc5Pct?: number;
  btc15Pct?: number;
  btc60Pct?: number;
  breadthPct?: number;
  breadthValid?: number;
  status: BlackSwanStatus;
  reason: BlackSwanReason;
}

export interface BlackSwanBacktestTransition {
  t: number;
  from: BlackSwanStatus;
  to: BlackSwanStatus;
  reason: BlackSwanReason;
  btc5Pct?: number;
  btc15Pct?: number;
  btc60Pct?: number;
  breadthPct?: number;
  breadthAffected?: number;
  breadthValid?: number;
}

export interface BlackSwanBacktestResult {
  config: BlackSwanConfig;
  symbols: string[];
  startTime: number;
  endTime: number;
  points: BlackSwanBacktestPoint[];
  transitions: BlackSwanBacktestTransition[];
  summary: {
    candleCount: number;
    crisisMinutes: number;
    dataStaleMinutes: number;
    maxBreadthPct: number;
    maxDrawdownPct: number;
    protectiveMinutes: number;
    watchMinutes: number;
  };
}

export interface BlackSwanSavingsBacktestInput extends BlackSwanBacktestInput {
  monitoringConfig?: {
    negativePnlThresholdPct?: number;
    positivePnlThresholdPct?: number;
    takeProfitOffsetPct?: number;
  };
  startingBalanceUSDT: number;
  tradingConfig: DynamicTradeConfig;
  /** Test-only fee override. Production uses the standard backtest fee. */
  oneSideFeeRatio?: number;
}

export interface BlackSwanSavingsBacktestPoint extends BlackSwanBacktestPoint {
  protectedPnlUsdt: number;
  unprotectedPnlUsdt: number;
}

export type BlackSwanSavingsExitReason =
  | "BLACK_SWAN_CRISIS"
  | PositionCloseReason;

export type BlackSwanSavingsKline = [
  t: number,
  open: number,
  high: number,
  low: number,
  close: number,
];

export interface BlackSwanSavingsVPoint {
  /** First closed 5-minute candle on which this pivot was confirmed. */
  confirmedT?: number;
  id: string;
  l: "T" | "B";
  lvl: number;
  p: number;
  pct?: number;
  t: number;
}

export interface BlackSwanSavingsAveragingExecution {
  level: number;
  marginUsdt: number;
  multiplier: number;
  price: number;
  t: number;
}

export interface BlackSwanSavingsPositionResult {
  averageEntryPrice: number;
  averagingExecutions: BlackSwanSavingsAveragingExecution[];
  direction: PositionDirection;
  displayEndT: number;
  displayStartT: number;
  entryLevel: number;
  entryPrice: number;
  entryT: number;
  monitoringReasonAtExit: string;
  monitoringStageAtExit: "speedup" | "standard";
  protectedExitReason: BlackSwanSavingsExitReason;
  protectedExitPrice: number;
  protectedExitT: number;
  protectedPnlPct: number;
  protectedPnlUsdt: number;
  symbol: string;
  totalMarginUsdt: number;
  totalNotionalUsdt: number;
  unprotectedExitReason: BlackSwanSavingsExitReason;
  unprotectedExitPrice: number;
  unprotectedExitT: number;
  unprotectedPnlPct: number;
  unprotectedPnlUsdt: number;
  vPoints: BlackSwanSavingsVPoint[];
}

export interface BlackSwanSavingsBacktestResult extends Omit<
  BlackSwanBacktestResult,
  "points" | "summary"
> {
  entryT: number;
  incidentT: number;
  klinesBySymbol: Record<string, BlackSwanSavingsKline[]>;
  points: BlackSwanSavingsBacktestPoint[];
  positions: BlackSwanSavingsPositionResult[];
  vPointGenerationEndT: number;
  vPointGenerationStartT: number;
  summary: BlackSwanBacktestResult["summary"] & {
    emergencyClosedPositions: number;
    generatedVPointCount: number;
    positionCount: number;
    protectedLossUsdt: number;
    protectedPnlUsdt: number;
    savedPct: number;
    savedUsdt: number;
    totalMarginUsdt: number;
    totalNotionalUsdt: number;
    unprotectedLossUsdt: number;
    unprotectedPnlUsdt: number;
  };
}
