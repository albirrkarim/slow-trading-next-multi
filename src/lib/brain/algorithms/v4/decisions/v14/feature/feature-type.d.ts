import type { LevelThreshold } from "./levelThreshold";

export interface Features {
  // A. Current Point
  currentPoint: VolatilityPoint;

  // B. Target Coin Metrics
  targetCoin: {
    /**
     * Down ratio in last 15 days of the target coin
     * 0-1
     */
    downRatio: number;

    /**
     * Current normalized price of the target coin
     * 0-1
     */
    currentPriceNorm: PriceNorm;

    /**
     * How long between current vpoint and before (ms)
     */
    velocityDownTime: number;

    /**
     * Mean level of volatility points
     * 3-4
     */
    meanLevel: number;
  };

  // C. BTC Reference Metrics
  btc: {
    /**
     * Down ratio of BTC in last 15 days
     * 0-1
     */
    downRatio: number;

    /**
     * Current normalized BTC price
     * 0-1
     */
    currentPriceNorm: number;

    /**
     * Last BTC volatility point
     * Determines the market condition is volatile or not
     */
    lastBTCVolatilityPoint: VolatilityPoint | null;
  };

  // D. Comparative Metrics
  comparative: {
    /**
     * Difference with BTC normalized price
     *
     * Positive means the coin is underperforming BTC
     * Negative means the coin is outperforming BTC
     *
     * 0-1 and negative
     */
    diffWithBTC: number;
  };

  // E. Market-Wide Metrics
  market: {
    /**
     * Global volatility index: Count VPoints in last 2 weeks normalized with Count VPoints in range now - 1 month
     * 0-1
     */
    globalVolatilityIndex: number;

    /**
     * Mean level of volatility points of all coins
     * 4 - -4
     */
    meanLevel: number;

    levelThreshold: LevelThreshold;
  };

  // F. Trading Metrics
  trading: {
    /**
     * Whether have profit this month
     * if not we need to more aggressive
     */
    numberOfProfitTrades: number;
  };

  /**
   * G. For the day to day trading adjustments
   */
  sensitive: {
    weeklyVolatilityIndex: number;
    weeklyMeanLevel: number;

    /**
     * Minimum level of all coins in last week except current coin
     */
    minLevel: number;

    /**
     * Maximum level of all coins in last week except current coin
     */
    maxLevel: number;
  };

  // Debug Info
  debug: {
    priceNormsLength: number;
  };
}
