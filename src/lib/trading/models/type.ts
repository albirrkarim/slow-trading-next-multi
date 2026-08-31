import { type FetchKlinesFunction } from "@lib/datasets/type";
import { type Kline } from "@/lib/exchange/platform/tokocrypto";
import type {
  PredictionEngineMemory,
  TradingModelConfigDynamic,
} from "@lib/dynamic";
import type {
  ExchangeType,
  TradingMode,
  UnifiedPosition,
} from "@/lib/exchange";
import type { DecisionEngineVersionType } from "@/lib/brain";

/**
 * The type of order used for simulation, which affects fee calculation.
 * - `"taker"`: immediate execution, higher fees.
 * - `"maker"`: order placed in the book, lower fees. limit order
 */
export type OrderType = "taker" | "maker";

/** One completed-averaging threshold for the post-average rescue exit. */
export interface PostAverageRescueExitThreshold {
  /** Minimum completed averaging executions required to use this threshold. */
  minAveragingCount: number;
  /** Minimum fee-aware net PnL percentage required for exit. */
  minNetPnlPct: number;
}

/** Configures the tiered post-average rescue exit shared by all trading flows. */
export interface PostAverageRescueExitConfig {
  /** Enables the post-average rescue exit rule. */
  enabled: boolean;
  /** Threshold selected by the greatest qualifying minimum averaging count. */
  thresholds: PostAverageRescueExitThreshold[];
}

/** One completed-averaging tier for the post-average stop loss. */
export interface PostAverageStopLossThreshold {
  /** Minimum completed averaging executions required to use this tier. */
  minAveragingCount: number;
  /** Negative fee-aware net PnL percentage boundary; zero disables it. */
  maxNetPnlPct: number;
  /** Negative fee-aware net USDT boundary; zero disables it. */
  maxNetPnlUsdt: number;
}

/** Configures tiered post-average loss boundaries shared by all trading flows. */
export interface PostAverageStopLossConfig {
  enabled: boolean;
  thresholds: PostAverageStopLossThreshold[];
}

interface TradingModelConfigAccumulator {
  /**
   * Decimal drop from the last buy price required to trigger a DCA buy.
   *   - Unit: decimal (e.g. 0.05 = 5%)
   *   - Default: 0.05
   *   - Recommended: 0.02–0.10 (2%–10%)
   * 0.05; // 5% drop
   */
  dcaDipPercent?: number;

  /**
   * Maximum number of DCA rounds (includes the initial buy as round 1).
   * - Default: 5
   * - Recommended: 1–10
   */
  maxDcaRounds?: number;

  /**
   * Base confidence (0–1) used to compute position sizing for the initial buy.
   *   Higher = more aggressive sizing.
   *   - Default: 0.5
   *   - Recommended: 0.1–0.8
   */
  confidenceBase?: number;
}

interface TradingModelConfigExecution {
  /**
   * Max Amount of USDT that you will use on buy order
   * Unit: USDT
   */
  maxBuyUSDT?: number;

  /**
   * Only TP from date and so on. no more buy
   *
   * eg: 8/21/2025
   *
   * @example
   * const targetMoment = moment(onlyTPFromDate, "M/D/YYYY");
   */
  onlyTPFromDate?: string;
}

/**
 * Config that model trading use to determine descission
 */
export interface TradingModelConfig
  extends
    TradingModelConfigAccumulator,
    TradingModelConfigExecution,
    TradingModelConfigDynamic {
  /**
   * The percentage of profit at which the system should take profit and close the position.
   * For example, 5 means take profit when the position gains 5%.
   */
  takeProfitPercent: number;

  /**
   * The maximum percentage loss allowed before the system triggers a stop loss.
   * For example, 3 means stop loss will trigger if the position loses 3%.
   */
  stopLossPercent?: number;

  /**
   * Exit when the latest volatility point reaches this absolute level.
   * Set 0 to disable. Production/runtime only.
   */
  exitOnVPointAbsLevel?: number;

  /**
   * Maximum fee-adjusted net USDT loss allowed before exit.
   * Set 0 to disable. Production/runtime only.
   */
  stopLossUSDT?: number;

  /**
   * Fee-adjusted, unlevered stop loss enabled after the position has hit its
   * opposite volatility target zone. Set 0 to disable.
   */
  volatilityTargetStopLossPercent?: number;

  /** Tiered net-PnL thresholds for the post-average rescue exit. */
  postAverageRescueExit?: PostAverageRescueExitConfig;

  /** Tiered fee-aware loss boundaries enabled after averaging. */
  postAverageStopLoss?: PostAverageStopLossConfig;

  /**
   * The maximum amount of time (in minutes) a position should be held before closing it.
   *
   * 60 * 24 * 30 * 5, // 5 month
   */
  maxHoldMinutes?: number;

  /**
   * The type of order used for simulation, which affects fee calculation.
   * - `"taker"`: immediate execution, higher fees.
   * - `"maker"`: order placed in the book, lower fees. limit order
   */
  orderType?: OrderType;

  useStopLossPlus?: boolean;

  /**
   * The percentage drop from the peak profit at which the Stop Loss Plus (trailing stop)
   * will sell the position.
   *
   * Example: 1 means if profit retraces by 1% from the peak after activation,
   * the position is closed to lock in gains.
   */
  stopLossPlusTrigger?: number;

  /**
   * Current User available balance USDT
   */
  balanceUSDT?: number;

  /**
   * Maximum percentage of the total USDT balance to risk per trade.
   *
   * - Expressed as a percentage (e.g. `5` = 5% of balance).
   * - Ensures the strategy never over-allocates capital, even on
   *   high-confidence setups.
   * - Used together with the confidence score to determine
   *   final position sizing:
   *
   *   ```ts
   *   const maxAllocation = balanceUSDT * (config.maxRiskPercent / 100);
   *   const allocation = Math.min(balanceUSDT * confidence, maxAllocation);
   *   ```
   *
   * Example:
   * - balanceUSDT = 1000
   * - maxRiskPercent = 5
   * - → max risk per trade = 50 USDT
   * - With confidence = 0.6 (60%)
   *   → actual allocation = 30 USDT
   */
  maxRiskPercent?: number;

  /**
   * Exist on model passive v3
   *
   * Multiplier applied to each subsequent DCA (Dollar-Cost Averaging) buy.
   *
   * For example:
   * - `1` means always buy the same amount (`baseUSDT`) each time.
   * - `2` means double the amount on each DCA step (e.g., $50 → $100 → $200).
   *
   * Helps average down faster in strong downtrends.
   *
   * @example
   * dcaMultiplier: 2 // Doubles the USDT spent on each additional buy
   */
  dcaMultiplier?: number;
}

/**
 * Some memory for the trading model
 *
 * So the next run can remember what previous action thinking
 */
export interface TradingModelMemory {
  [key: string]: any;

  /**
   * Tell model to execute this amount of USDT.
   *
   * used in dynamic trading
   */
  quoteAssetToTrade?: number;

  positions: Position[];

  /**
   * Legacy closed-position buffer used by older dynamic/backtest flows.
   * Production SLOW history is persisted in split history files, so guards that
   * need durable closed-trade state should not rely on this field.
   */
  positionsSell?: Position[];

  timeToBuyMS?: number | null;

  /**
   * Volatility Info. Used to determine DYNAMIC COINS trade
   */
  volatility?: PredictionEngineMemory;

  /**
   * Used in backtest for FINAL SELLING
   */
  forceSell?: boolean;

  /**
   * Ask the model no more buy only selling
   */
  onlySell?: boolean;

  /**
   * When it is boolean so ALL IN
   *
   * When its number so its USDT to buy
   */
  justBuy?: number | boolean;
}

export type PositionExecutionMode = "live" | "sandbox";
export type PositionDirection = Exclude<UnifiedPosition["side"], "NET">;
export type PositionEntrySourceOverride = "MANUAL" | "BYPASS";
export type PositionOpenReason = "COMMON" | "MANUAL" | "BYPASS" | "UNKNOWN";
export type PositionCloseSourceOverride = "MANUAL" | "EXCHANGE";

export interface PositionVPointRef {
  id: string;
  lvl: number;
}

export interface PositionOpenEvent {
  t: number;
  vPoint: PositionVPointRef;
  /** Omitted for automatic entries. */
  source?: PositionEntrySourceOverride;
  reason: PositionOpenReason;
  message: string;
  /** Immutable initial execution price before any averaging. */
  price: number;
}

export interface PositionExposure {
  quantity: number;
  averageEntryPrice: number;
  notionalUsdt: number;
  marginUsdt: number;
  leverage: number;
}

export interface PositionFees {
  entryUsdt: number;
  /** Open-position estimate only. Removed after close. */
  estimatedExitUsdt?: number;
}

export type PositionReserveStepStatus =
  "RESERVED" | "UNRESERVED" | "USED" | "RELEASED";

export interface PositionReserveStep {
  level: number;
  marginUsdt: number;
  allocationPct: number;
  status: PositionReserveStepStatus;
  reservedMarginUsdt?: number;
  usedAt?: number;
  usedPrice?: number;
  releasedAt?: number;
}

export interface PositionAveragingExecution {
  t: number;
  level: number;
  marginUsdt: number;
  price: number;
  allocationPct: number;
  reservedMarginUsdt?: number;
  adaptiveMultiplier?: number;
  projectedProfitPct?: number;
}

export interface PositionAveragingState {
  entryLevel: number;
  lastHandledLevel: number;
  reserveBaseMarginUsdt: number;
  reservedRemainingMarginUsdt: number;
  steps: PositionReserveStep[];
  executions?: PositionAveragingExecution[];
}

export interface PositionEntryDecision<TFeature = unknown> {
  /** Missing only when historical migration cannot recover the engine. */
  engine?: DecisionEngineVersionType;
  feature?: TFeature;
  label?: string;
}

export interface PositionStrategyState<TFeature = unknown> {
  entry: PositionEntryDecision<TFeature>;
  averaging: PositionAveragingState;
}

export interface PositionPnlPoint {
  t: number;
  pct: number;
}

export interface PositionPnl {
  markPrice?: number;
  netPct?: number;
  netUsdt?: number;
  currentValueUsdt?: number;
  maxUpPct?: number;
  maxDownPct?: number;
  history?: PositionPnlPoint[];
}

/** Latest perpetual-futures funding snapshot observed while monitoring. */
export interface PositionFundingSnapshot {
  /** Exchange that supplied this snapshot. */
  exchange: ExchangeType;
  /** Raw decimal rate, where `0.0001` means `0.01%`. */
  rate: number;
  /** Exchange snapshot timestamp in Unix milliseconds. */
  t: number;
  /** Next scheduled funding settlement in Unix milliseconds. */
  nextT?: number;
}

export type PositionCloseReason =
  | "TAKE_PROFIT"
  | "STOP_LOSS"
  | "EXIT_ON_VPOINT_LEVEL"
  | "STOP_LOSS_BY_USDT_LOSS"
  | "STOP_LOSS_PLUS_TP"
  | "VOLATILITY_TARGET_TP"
  | "VOLATILITY_TARGET_SL"
  | "POST_AVERAGE_RESCUE_EXIT"
  | "POST_AVERAGE_STOP_LOSS"
  /** @deprecated Retained so existing persisted history remains readable. */
  | "POST_AVERAGE_RESCUE_TP"
  | "FINAL"
  | "LIQUIDATED"
  | "MANUAL"
  | "FORCED"
  | "UNKNOWN";

export interface PositionCloseEvent {
  t: number;
  /** Omitted for automatic exits. */
  source?: PositionCloseSourceOverride;
  price: number;
  feeUsdt: number;
  vPoint?: PositionVPointRef;
  reason: PositionCloseReason;
  message: string;
}

export interface PositionControl {
  forceExit?: {
    reason: string;
  };
}

export type PositionMonitoringStage = "speedup" | "standard";

/** Last successful production monitoring pass recorded on the position. */
export interface PositionLastMonitoringStage {
  stage: PositionMonitoringStage;
  lastUpdated: number;
  reason: string;
}

/** Canonical position persisted by production, sandbox, and backtest flows. */
export interface Position<TFeature = unknown> {
  symbol: string;
  executionMode: PositionExecutionMode;
  tradingMode: TradingMode;
  direction: PositionDirection;
  /** User-authored note attached to this persisted position or history row. */
  notes?: string;
  /** Latest successful production monitoring stage and its classification reason. */
  lastMonitoringStage?: PositionLastMonitoringStage;
  opened: PositionOpenEvent;
  /** Ordered intermediate vPoints; excludes opened.vPoint and closed.vPoint. */
  vPoints?: PositionVPointRef[];
  exposure: PositionExposure;
  fees: PositionFees;
  strategy: PositionStrategyState<TFeature>;
  pnl: PositionPnl;
  /** Latest valid funding snapshot for a monitored futures position. */
  funding?: PositionFundingSnapshot;
  control?: PositionControl;
  closed?: PositionCloseEvent;
}

/**
 * A union type representing the possible trade decisions.
 */
export interface TradeDecision {
  action: "BUY" | "SELL" | "HOLD";

  /**
   * Current Price USDT in klines
   */
  price?: number;

  /**
   * Amount to buy or sell that the model trading suggest
   *
   * BUY decisions tell you how much USDT to spend.
   * SELL decisions tell you how much of the coin to sell (your current holdings).
   */
  amount?: number;

  /**
   * Position mana yang di jual ini untuk jual partial
   */
  position?: Position;

  /**
   * Net Profit or loss in percentage (%)
   *
   * 0-1
   */
  profit?: number;

  /**
   * Decision reason
   */
  reason?: string;

  /**
   *
   */
  category?: string;

  /**
   * Server Logging
   */
  log?: string;

  /**
   * Simple notif to email
   */
  emailNotif?: string;

  /** Volatility point that authorized a new entry. */
  entryVPoint?: PositionVPointRef;
}

/**
 * Parameters passed into the trading decision function.
 */
export interface GetTradingDecisionProps {
  /**
   * symbol
   * BTC_USDT
   */
  symbol: string;

  /**
   * Current kline (candlestick)
   */
  current: Kline;

  /**
   *
   * Function that we made before
   */
  fetchKlines: FetchKlinesFunction;

  /**
   * Active position, or null if none
   */
  position: Position | null;

  /**
   * Strategy configuration
   */
  config: TradingModelConfig;

  /**
   * Some memory for the trading model
   *
   * So the next run can remember what previous action thinking
   */
  memory: TradingModelMemory;
}

export type TradeDecisionFunction = (
  props: GetTradingDecisionProps,
) => Promise<TradeDecision>;
