import type {
  Position,
  TradingModelConfig,
  TradingModelMemory,
  type EventPosition
} from "@/lib/trading/models";

/**
 * Configuration options for running a backtest simulation on historical trading data.
 */
export interface BacktestConfig {
  modelMemory: TradingModelMemory;

  /**
   * Model Trading config
   */
  modelConfig: TradingModelConfig;

  /**
   * The amount of USDT available at the start of the backtest.
   */
  startingBalanceUSDT: number;

  /**
   * 12 mean history klines suplied to trading model is one hour data because
   *
   * the dataset of klines is every 5 minutes so
   *
   * 5 * 12 mean = 60 minutes / one hour history klines
   */
  countLastRecord?: number;
}

/**
 * The summary result of a completed backtest, including financial outcomes and trade log.
 */
export interface BacktestReturn {
  symbol: string;

  startingBalanceUSDT: number;

  /**
   * The total USDT balance remaining at the end of the simulation after all trades.
   */
  finalBalance: number;

  /**
   * The total number of trades executed during the backtest.
   */
  totalTrades: number;

  /**
   * Legacy/backtest closed positions.
   */
  positionsSell: Position[];

  /**
   * The cumulative amount of trading fees paid (in USDT).
   */
  totalFee: number;
  totalTax: number;

  /**
   * A list of individual trade events, including timestamps, actions, fees, and outcomes.
   */
  tradeHistory: TradeHistory[]; // Consider replacing `any` with a defined `TradeEvent` interface
}

/**
 * time, side, message, price
 */
export interface TradeHistorySimple {
  /**
   * The timestamp (in milliseconds) when the trade was executed.
   * Can be used to reconstruct the timeline of trades.
   */
  time: number;

  side: "BUY" | "SELL" | "SHORT"

  message: string;

  /**
   * Current Trade price
   */
  price: number;
}

/**
 * Track your asset growth
 */
export interface GrowthOvertime {
  /**
   * Current BALANCE_USDT ready to use for buy
   */
  currentBalance: number;

  /**
   * Quote asset still available after subtracting reserved watch capital.
   */
  currentSpendableBalance?: number;

  /**
   * Quote asset locked for open-position watch averaging steps.
   */
  currentReservedBalance?: number;

  /**
   * Current Aset: (TRADABLE ASSET)
   *
   * BALANCE_USDT +  All entry USDT positions
   */
  currentAsset: number;

  /**
   * Current Aset Floating:
   *
   * BALANCE_USDT +  All floating USDT value positions
   */
  currentAssetFloating: number;

  /**
   * Current Base asset (usdt on positions)
   * current Total USDT spend on some coins
   */
  currentBaseAsset: number;

  /**
   * Defined in USDT: this asset will not traded, its outside the trading system.
   * this will grow up overtime, depend on the trading config
   * You can just ignore this
   */
  currentSafeHaven: number;
}

export interface GrowthOvertimeDetail extends GrowthOvertime {
  /**
   * Time miliseconds from klines
   */
  timeMs: number;

  /**
   * Readable time for debugging
   */
  timeMsHuman: string;

  /**
   * TRADE_CATEGORY :USDT
   *
   * example:
   *
   * {
   *   COMMON: 0
   *   HIT: 0
   * }
   */
  currentBaseAssetLabeled: Record<string, number>;

  /**
   *
   * TOTAL BASE ASSET $1000
   *
   * percentage 0-1
   *
   * {
   *   ETH: 0.8
   * }
   */
  currentBaseAssetPercentCoin: Record<string, number>;
}

/**
 * positionsBefore, positionsAfter
 */
export interface TradePositionHistory {
  /**
   * The position state before the trade took place.
   * Includes price, time, and quantity of the open position at that moment.
   */
  positionsBefore: Position[];

  /**
   * The position state after the trade was executed.
   * Will be empty array if the position was closed after a sell.
   */
  positionsAfter: Position[];
}

/**
 * fee, tax, profit
 */
export interface TradeHistoryDetail {
  /**
   * The fee paid for this particular trade (in quote currency, e.g., USDT).
   */
  fee: number;

  /**
   * The tax paid (if any) for this trade (in quote currency, e.g., USDT).
   */
  tax: number;

  /**
   * The net profit or loss resulting from this trade (in quote currency, e.g., USDT).
   * Negative if it was a loss.
   */
  profit: number;
}

/**
 * Represents the record of a single trade event that occurred during backtesting.
 */
export interface TradeHistory
  extends TradeHistorySimple,
  GrowthOvertime,
  TradeHistoryDetail,
  TradePositionHistory { }




interface VolatilityEventPosition extends EventPosition {
  exitLevel: number;
}

/**
 * to memoize the Decision of decisionEngine
 */
export interface TradeHistoryVolatility {
  /**
   * BTC, ETH
   */
  symbol: string;
  message: string;

  // entry
  entryId: string;
  entryFeature: FeatureV1;
  entryLevel: number;
  entryTime: number;
  entryTimeHuman?: string;
  entryPrice: number;

  // buy info
  quantity: number;
  usdtInvested: number;

  // exit
  holdDurationTime?: number;
  holdDurationHuman?: string;
  exitId?: string;
  exitLevel?: number;
  exitTime?: number;
  exitTimeHuman?: string;
  exitPrice?: number;

  netProfitUSDT?: number;
  netProfitPercent?: number;
}
