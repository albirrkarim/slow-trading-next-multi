import type { HeldCapitalMetrics } from "./heldCapital";

export interface SavedPayload {
  id: string;

  /**
   * Ms
   */
  createdAt: number;

  /**
   * Name
   */
  label?: string;

  /**
   * Input
   */
  backtestConfig: BacktestConfig;

  /**
   * Output
   */
  // backtestResult: DynamicTradeBacktestReturn;

  /**
   * For reporting
   */
  leaderboards: Leaderboards;
}

/**
 * Cooking process evaluations
 */
export interface Leaderboards {
  /**
   * Defined in 0-100
   */
  winRate: number;

  /**
   * Maximal gap between currentAsset
   *
   * drawdown = (currentAsset - currentAssetFloating) / currentAsset;
   *
   * Minimal are better
   */
  maxPortfolioDrawdown: {
    avg: number;
    max: number;
  };

  /**
   * Maximal gap between open positions
   *
   * drawdown = (openBase - openBaseFloating) / openBase;
   *
   * Minimal are better
   */
  openFloatingDrawdown: {
    avg: number;
    max: number;
  };

  /**
   * From the bear market dataset:
   *
   * [
   *  date ms - end date ms for coin A
   *  date ms - end date ms for coin B
   * ]
   *
   * it will compared to growthAsset overtime.
   * let see within that date. do avg of floating asset.
   *
   * (currentAsset - Current floating asset) / current asset
   *
   * Minimal are better
   */
  bearMarketProofRatio: number;

  /**
   * Defined in gain percent 0-1000 ++
   *
   * (finalBalance - startingBalanceUSDT + safeHaven) / startingBalanceUSDT)
   */
  gainPercent: number;

  /**
   * How based on starting balance, produce profit each month
   *
   * (all profit within a month / all month) / starting balance
   *
   * 0-1
   */
  avgMonthlyProfitRatio: number;

  /**
   * based on the growth overtime.
   *
   * when currentBalance==0
   * how long it is?
   * calculate min, avg, max
   */
  emptyBalance: TimeInfo;

  /**
   * How the trades balance between each coins
   *
   * Range: 0-100
   */
  balanceTradesScore: number;

  /**
   * hrScore: held score
   *
   * and
   *
   * trScore: turnover score
   */
  capitalEfficiency: HeldCapitalMetrics;

  /**
   * Percentage about gain monthly
   *
   * range 0-100
   */
  monthlyGain: ValueRange;

  /**
   * Sharpe Ratio - Risk-adjusted return metric
   *
   * Measures excess return per unit of risk (volatility)
   * - < 1.0: Sub-optimal
   * - 1.0-2.0: Good
   * - 2.0-3.0: Very Good
   * - > 3.0: Excellent
   */
  sharpeRatio: number;
}

export interface ValueRange {
  min: number;
  avg: number;
  max: number;
  percents?: number[];
}

export interface TimeInfo {
  min: number;
  minHuman?: string;
  avg: number;
  avgHuman?: string;
  max: number;
  maxHuman?: string;
}

/**
 * Evaluate coin pairs
 */
interface CoinsPairLeaderboards {
  /**
   * Avg of T->B + B->T
   */
  speed: number;

  maxDownLevel: number;

  /**
   *
   * Level skip
   */
  BTSkip: number;
}
