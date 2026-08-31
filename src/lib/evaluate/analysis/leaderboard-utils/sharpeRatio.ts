import moment from "moment-timezone";
import { type GrowthOvertimeDetail } from "../../../dynamic/backtest-volatility/type";

/**
 * Calculate Sharpe Ratio for the trading strategy
 * Created: 9 December 2025
 *
 * Sharpe Ratio = (Average Return - Risk-Free Rate) / Standard Deviation of Returns
 *
 * This implementation uses month-end portfolio values to calculate monthly returns.
 * Portfolio value = currentAsset + currentSafeHaven (total capital in the system)
 *
 * Higher Sharpe Ratio = Better risk-adjusted returns
 * - < 1.0: Sub-optimal
 * - 1.0-2.0: Good
 * - 2.0-3.0: Very Good
 * - > 3.0: Excellent
 *
 * @param growthOvertime - Growth over time data
 * @param riskFreeRate - Annual risk-free rate (default: 0.0 = 0% for crypto)
 * @returns Sharpe ratio value
 */
export function calculateSharpeRatio(
  growthOvertime: GrowthOvertimeDetail[],
  riskFreeRate: number = 0.0
): number {
  if (!growthOvertime || growthOvertime.length < 2) {
    return 0;
  }

  // A. Group data by month and get month-end values
  // Key: YYYY-MM, Value: last growth data point of that month
  const monthlyEndpoints: Record<string, GrowthOvertimeDetail> = {};

  for (const point of growthOvertime) {
    const month = moment(point.timeMs).format("YYYY-MM");

    // Keep updating to get the last point of each month
    if (
      !monthlyEndpoints[month] ||
      point.timeMs > monthlyEndpoints[month].timeMs
    ) {
      monthlyEndpoints[month] = point;
    }
  }

  // B. Calculate month-to-month returns
  const months = Object.keys(monthlyEndpoints).sort();
  const monthlyReturns: number[] = [];

  for (let i = 1; i < months.length; i++) {
    const prevMonth = monthlyEndpoints[months[i - 1]];
    const currMonth = monthlyEndpoints[months[i]];

    // Use total portfolio value (currentAsset + safeHaven)
    // currentAsset = currentBalance + all positions value (entry price based)
    const prevValue = prevMonth.currentAsset + prevMonth.currentSafeHaven;
    const currValue = currMonth.currentAsset + currMonth.currentSafeHaven;

    if (prevValue > 0) {
      // Calculate percentage return
      const returnPercent = ((currValue - prevValue) / prevValue) * 100;
      monthlyReturns.push(returnPercent);
    }
  }

  if (monthlyReturns.length < 2) {
    return 0;
  }

  // C. Calculate average monthly return (in percentage)
  const avgMonthlyReturn =
    monthlyReturns.reduce((sum, val) => sum + val, 0) / monthlyReturns.length;

  // D. Calculate standard deviation of monthly returns
  const variance =
    monthlyReturns.reduce(
      (sum, val) => sum + Math.pow(val - avgMonthlyReturn, 2),
      0
    ) / monthlyReturns.length;

  const stdDev = Math.sqrt(variance);

  // E. Calculate monthly risk-free rate
  const monthlyRiskFreeRate = (riskFreeRate / 12) * 100; // Convert annual to monthly percentage

  // F. Calculate Sharpe Ratio
  // Sharpe Ratio = (Avg Return - Risk-Free Rate) / Std Dev
  const sharpeRatio =
    stdDev === 0 ? 0 : (avgMonthlyReturn - monthlyRiskFreeRate) / stdDev;

  return parseFloat(sharpeRatio.toFixed(4));
}

/**
 * Calculate Annualized Sharpe Ratio
 *
 * Converts monthly Sharpe ratio to annualized equivalent by multiplying with sqrt(12).
 * This assumes returns are independent and identically distributed (i.i.d.).
 *
 * Formula: Annualized SR = Monthly SR × √12
 *
 * Use this when comparing strategies across different time periods or when
 * industry standards require annualized metrics.
 *
 * @param {GrowthOvertimeDetail[]} growthOvertime - Growth over time data points
 * @param {number} [riskFreeRate=0.0] - Annual risk-free rate (default: 0.0 = 0% for crypto)
 *
 * @returns {number} Annualized Sharpe ratio (4 decimal places)
 *
 * @example
 * const annualizedSR = calculateAnnualizedSharpeRatio(growthData);
 * // Monthly SR = 0.5 → Annualized SR = 1.73 (0.5 × √12)
 */
export function calculateAnnualizedSharpeRatio(
  growthOvertime: GrowthOvertimeDetail[],
  riskFreeRate: number = 0.0
): number {
  const monthlySharpe = calculateSharpeRatio(growthOvertime, riskFreeRate);

  // Annualize by multiplying with sqrt(12)
  const annualizedSharpe = monthlySharpe * Math.sqrt(12);

  return parseFloat(annualizedSharpe.toFixed(4));
}

/**
 * Get human-readable interpretation of Sharpe Ratio value
 *
 * Provides qualitative assessment based on industry-standard thresholds.
 * These interpretations apply to both monthly and annualized Sharpe ratios,
 * though typical trading strategies achieve higher monthly values.
 *
 * Interpretation Scale:
 * - Negative: Strategy loses to risk-free rate (poor)
 * - 0 to 1.0: Sub-optimal risk-adjusted returns
 * - 1.0 to 2.0: Good performance
 * - 2.0 to 3.0: Very good performance
 * - Above 3.0: Excellent performance (rare)
 *
 * @param {number} sharpeRatio - The calculated Sharpe ratio value
 *
 * @returns {string} Human-readable interpretation
 *
 * @example
 * interpretSharpeRatio(2.5); // "Very Good"
 * interpretSharpeRatio(0.8); // "Sub-optimal"
 * interpretSharpeRatio(-0.2); // "Negative (Poor - returns below risk-free rate)"
 */
export function interpretSharpeRatio(sharpeRatio: number): string {
  if (sharpeRatio < 0) return "Negative (Poor - returns below risk-free rate)";
  if (sharpeRatio < 1.0) return "Sub-optimal";
  if (sharpeRatio < 2.0) return "Good";
  if (sharpeRatio < 3.0) return "Very Good";
  return "Excellent";
}
