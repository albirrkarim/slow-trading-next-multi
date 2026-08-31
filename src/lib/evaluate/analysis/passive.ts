import moment from "moment";
import type { TradeHistory } from "../../dynamic/backtest-volatility/type";
import { tradeLog } from "@/lib/trading/helper/log";

/**
 * Metrics designed to evaluate whether a trading strategy is suitable for passive income generation.
 */
export interface PassiveIncomeMetrics {
  /**
   * Total number of months evaluated in the backtest period.
   */
  totalMonths: number;

  /**
   * Number of months with a net profit.
   */
  profitableMonths: number;

  /**
   * Percentage of months that were profitable.
   * @example 91.67 means 91.67% of months made money.
   */
  percentProfitableMonths: number;

  /**
   * Standard deviation of monthly profits.
   * Measures consistency. Lower is better for passive income.
   */
  stdDevMonthlyProfit: number;

  /**
   * The lowest monthly profit across the test period.
   * Can be negative. Indicates worst-case scenario.
   */
  worstMonthProfit: number;

  /**
   * Maximum monthly drawdown in cumulative profit over the period.
   * Reflects volatility and capital risk.
   */
  maxMonthlyDrawdown: number;

  /**
   * Sharpe ratio calculated using average monthly profit and its standard deviation.
   * Measures risk-adjusted returns. >1 is generally considered good.
   */
  sharpeRatio: number;

  /**
   * Average duration (in minutes) a position is held before selling.
   */
  avgHoldingDurationMinutes: number;

  /**
   * Average number of trades executed per month.
   * Useful for evaluating the strategy's activity level.
   */
  avgTradesPerMonth: number;

  /**
   * Synonym of avgTradesPerMonth, included for readability in different contexts.
   */
  tradeFrequencyPerMonth: number;

  /**
   * Average profit generated per month (in USDT).
   */
  averageMonthlyProfit: number;

  /**
   * Indicates whether the strategy is considered suitable for passive income generation.
   * Based on thresholds for trades/month, profit consistency, sharpe ratio, etc.
   */
  isPassiveFriendly: boolean;

  /**
   * Score between 0 (bad) and 1 (excellent) estimating how well this strategy supports passive income.
   * Combines metrics like profit stability, frequency, sharpe, and drawdown.
   * @example 0.92
   */
  goodForPassiveIncome: number;
}

/**
 * Evaluates a trading strategy for passive income suitability.
 *
 * This comprehensive analysis calculates metrics designed to answer:
 * "Can I rely on this strategy for consistent monthly income?"
 *
 * **Key Metrics Evaluated:**
 * - Monthly profit consistency (% profitable months)
 * - Profit volatility (standard deviation)
 * - Risk-adjusted returns (Sharpe ratio)
 * - Worst-case scenario (worst month, max drawdown)
 * - Activity level (trades per month, avg holding time)
 *
 * **Scoring Logic:**
 * - goodForPassiveIncome: 0-1 score combining multiple factors
 * - isPassiveFriendly: Boolean threshold (>80% profitable months, moderate activity)
 *
 * @param {TradeHistory[]} trades - Complete trade history array (BUY + SELL).
 * @returns {PassiveIncomeMetrics} Comprehensive metrics object with 13+ calculated fields.
 *
 * @example
 * const metrics = passiveIncomeMetrics(backtestResult.tradeHistory);
 * console.log(`Passive Income Score: ${(metrics.goodForPassiveIncome * 100).toFixed(1)}%`);
 * console.log(`Profitable Months: ${metrics.percentProfitableMonths.toFixed(1)}%`);
 * console.log(`Avg Monthly: $${metrics.averageMonthlyProfit.toFixed(2)}`);
 * console.log(`Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}`);
 *
 * if (metrics.isPassiveFriendly) {
 *   console.log("✅ This strategy is suitable for passive income!");
 * } else {
 *   console.log("❌ Strategy may be too volatile or inconsistent for passive income.");
 * }
 */
export function passiveIncomeMetrics(
  trades: TradeHistory[]
): PassiveIncomeMetrics {
  if (trades.length === 0) {
    tradeLog.error("No trade history provided.");

    return {
      totalMonths: 0,
      profitableMonths: 0,
      percentProfitableMonths: 0,
      stdDevMonthlyProfit: 0,
      worstMonthProfit: 0,
      maxMonthlyDrawdown: 0,
      sharpeRatio: 0,
      avgHoldingDurationMinutes: 0,
      avgTradesPerMonth: 0,
      tradeFrequencyPerMonth: 0,
      averageMonthlyProfit: 0,
      isPassiveFriendly: false,
      goodForPassiveIncome: 0,
    } as PassiveIncomeMetrics;
  }

  // 1. Group profit per month
  const monthlyProfits: Record<string, number> = {};

  for (const trade of trades) {
    if (trade.side === "SELL") {
      const month = moment(trade.time).format("YYYY-MM");
      monthlyProfits[month] = (monthlyProfits[month] || 0) + trade.profit;
    }
  }

  // 2. Get full range of months (even with no trades)
  const firstMonth = moment(trades[0].time).startOf("month");
  const lastMonth = moment(trades[trades.length - 1].time).startOf("month");
  const allMonths: string[] = [];

  const current = firstMonth.clone();
  while (current.isSameOrBefore(lastMonth)) {
    allMonths.push(current.format("YYYY-MM"));
    current.add(1, "month");
  }

  // 3. Compute monthly profit stats
  const profits = allMonths.map((month) => monthlyProfits[month] || 0);
  const totalMonths = allMonths.length;
  const profitableMonths = profits.filter((p) => p > 0).length;
  const percentProfitableMonths = (profitableMonths / totalMonths) * 100;

  const avgProfit = profits.reduce((acc, val) => acc + val, 0) / totalMonths;
  const stdDev = Math.sqrt(
    profits.reduce((acc, val) => acc + Math.pow(val - avgProfit, 2), 0) /
    totalMonths
  );

  const worstMonthProfit = Math.min(...profits);

  // 4. Monthly drawdown (simplified)
  let balance = 0;
  let peak = 0;
  let maxDrawdown = 0;

  for (const month of allMonths) {
    balance += monthlyProfits[month] || 0;
    if (balance > peak) peak = balance;
    const drawdown = peak - balance;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const sharpeRatio = stdDev === 0 ? 0 : avgProfit / stdDev;

  // 5. Holding durations
  const holdingDurations: number[] = [];
  for (let i = 0; i < trades.length - 1; i++) {
    const buy = trades[i];
    const sell = trades[i + 1];
    if (buy.side === "BUY" && sell.side === "SELL") {
      const duration = (sell.time - buy.time) / (1000 * 60); // in minutes
      holdingDurations.push(duration);
    }
  }

  const avgHoldingDuration =
    holdingDurations.reduce((a, b) => a + b, 0) /
    (holdingDurations.length || 1);

  const avgTradesPerMonth = trades.length / totalMonths;
  const averageMonthlyProfit = avgProfit;

  const isPassiveFriendly =
    avgTradesPerMonth <= 10 &&
    percentProfitableMonths > 80 &&
    sharpeRatio > 1 &&
    averageMonthlyProfit > 10;

  // === Compute Passive Income Score (0 to 1) ===
  const normalizedTradeScore = Math.max(0, 1 - avgTradesPerMonth / 10); // 1 if <= 0 trades/month, 0 if >=10
  const normalizedProfitScore = Math.min(1, averageMonthlyProfit / 100); // 1 if >= $100/month
  const normalizedSharpe = Math.min(1, sharpeRatio / 2); // full score at SR=2
  const normalizedStability = 1 - Math.min(1, stdDev / averageMonthlyProfit); // more stable = higher

  // Weighted average (custom weights can be adjusted)
  const goodForPassiveIncome = parseFloat(
    (
      0.3 * normalizedTradeScore +
      0.3 * normalizedProfitScore +
      0.2 * normalizedSharpe +
      0.2 * normalizedStability
    ).toFixed(2)
  );

  return {
    totalMonths,
    profitableMonths,
    percentProfitableMonths: parseFloat(percentProfitableMonths.toFixed(2)),
    stdDevMonthlyProfit: parseFloat(stdDev.toFixed(2)),
    worstMonthProfit: parseFloat(worstMonthProfit.toFixed(2)),
    maxMonthlyDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
    avgHoldingDurationMinutes: parseFloat(avgHoldingDuration.toFixed(2)),
    avgTradesPerMonth: parseFloat(avgTradesPerMonth.toFixed(2)),
    tradeFrequencyPerMonth: parseFloat(avgTradesPerMonth.toFixed(2)),
    averageMonthlyProfit: parseFloat(averageMonthlyProfit.toFixed(2)),
    isPassiveFriendly,
    goodForPassiveIncome,
  };
}

/**
 * Logs a formatted summary of passive income evaluation metrics to the tradeLog.
 *
 * This function is intended to help you quickly understand how "passive-friendly"
 * your trading strategy is — i.e., how consistent, low-effort, and stable it might be.
 *
 * @param metrics - An object containing computed performance metrics from a backtest.
 *
 * @remarks
 * Key metrics explained:
 * - **Total Months**: Number of months included in the backtest window.
 * - **Profitable Months**: How many of those months closed with a net profit.
 * - **% Profitable Months**: Percentage of profitable months — higher = more stable income.
 * - **Worst Month Profit**: The lowest profit (or largest loss) in a single month.
 * - **Max Monthly Drawdown**: Largest monthly drop in equity compared to the previous peak.
 * - **Std Dev Monthly Profit**: Measures how much profit fluctuates month to month.
 * - **Sharpe Ratio**: Risk-adjusted return (higher is better; 1.0+ = generally good).
 * - **Avg Holding Duration**: How long positions are held on average (in minutes).
 * - **Trades per Month**: Frequency of trades each month (lower is more passive).
 * - **Average Monthly Profit**: Total profit / number of months.
 * - **Passive-Income Friendly?**: True if the strategy meets passive income criteria.
 */
export function logPassiveIncomeMetrics(metrics: PassiveIncomeMetrics): void {
  tradeLog.log("\n💡 Passive Income Evaluation Summary");
  tradeLog.log("─────────────────────────────────────────────");

  tradeLog.log(`Total Months:            ${metrics.totalMonths}`);
  tradeLog.log(`Profitable Months:       ${metrics.profitableMonths}`);
  tradeLog.log(
    `% Profitable Months:     ${metrics.percentProfitableMonths.toFixed(2)} %`
  );

  tradeLog.log(
    `Worst Month Profit:      ${metrics.worstMonthProfit.toFixed(2)} USDT`
  );
  tradeLog.log(
    `Max Monthly Drawdown:    ${metrics.maxMonthlyDrawdown.toFixed(2)} USDT`
  );

  tradeLog.log(
    `Std Dev Monthly Profit:  ${metrics.stdDevMonthlyProfit.toFixed(2)} USDT`
  );
  tradeLog.log(`Sharpe Ratio:            ${metrics.sharpeRatio.toFixed(2)}`);

  tradeLog.log(
    `Avg Holding Duration:    ${moment
      .duration(metrics.avgHoldingDurationMinutes, "minutes")
      .humanize()}`
  );
  tradeLog.log(
    `Trades Per Month:        ${metrics.tradeFrequencyPerMonth.toFixed(2)}`
  );
  tradeLog.log(
    `Avg Monthly Profit:      ${metrics.averageMonthlyProfit.toFixed(2)} USDT`
  );

  tradeLog.log(
    `Passive-Income Friendly? ${metrics.isPassiveFriendly ? "Yes ✅" : "No ❌"}`
  );

  tradeLog.log("─────────────────────────────────────────────\n");
}
