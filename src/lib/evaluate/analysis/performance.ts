import { tradeLog } from "@/lib/trading/helper/log";
import type { TradeHistory } from "../../dynamic/backtest-volatility/type";

/**
 * Summary statistics representing the performance of a trading strategy over a backtest period.
 */
export interface TradingPerformance {
  /**
   * Total number of trades executed (BUY + SELL).
   */
  totalTrades: number;

  /**
   * Number of realized exit rows. Futures short exits are BUY rows, so this
   * intentionally does not mean SELL rows.
   */
  closedTrades: number;

  /**
   * Number of profitable SELL trades (profit > 0).
   */
  winTrades: number;

  /**
   * Number of losing SELL trades (profit < 0).
   */
  lossTrades: number;

  /**
   * Number of breakeven SELL trades (profit === 0).
   */
  breakEvenTrades: number;

  /**
   * Percentage of SELL trades that were profitable.
   * @example 65.23 (means 65.23% win rate)
   */
  winRate: number;

  /**
   * Average profit per winning trade (USDT).
   */
  avgProfit: number;

  /**
   * Average loss per losing trade (USDT).
   * This is usually a negative number.
   */
  avgLoss: number;

  /**
   * Ratio of gross profit to gross loss.
   * Indicates risk-reward efficiency.
   * Returns "∞" if there are no losses.
   * @example "1.52"
   */
  profitFactor: string;

  /**
   * Net profit after fees and taxes from all SELL trades (USDT).
   */
  totalProfit: number;

  /**
   * Gross profit before deducting fees and taxes (USDT).
   */
  grossProfit: number;

  /**
   * Total fees paid across all trades (BUY + SELL).
   */
  totalFee: number;

  /**
   * Total tax paid across all trades (BUY + SELL).
   */
  totalTax: number;

  /**
   * Maximum drawdown in equity during the trading period (USDT).
   * Measures the worst equity decline.
   */
  maxDrawdown: number;

  /**
   * Account balance at the beginning of the backtest (USDT).
   */
  startingBalance: number;

  /**
   * Account balance at the end of the backtest (USDT).
   */
  finalBalance: number;

  /**
   * Net profit percentage relative to the starting balance.
   * @example 42.7 means +42.7% return.
   */
  gain: number;

  /**
   * Score from 0 to 1 estimating whether the strategy is good for high return focus.
   * Based on win rate, profit factor, drawdown, and return.
   * @example 0.87
   */
  goodForHighReturn: number;
}

/**
 * Analyzes trading performance from a trade history and returns comprehensive metrics.
 *
 * This function computes:
 * - Win/loss statistics (count, rate, averages)
 * - Profit metrics (total, gross, net, profit factor)
 * - Fee and tax totals
 * - Maximum drawdown
 * - Overall gain percentage
 * - High-return quality score (0-1)
 *
 * @param {TradeHistory[]} trades - Array of trade records from backtest or live trading.
 * @returns {TradingPerformance} Object containing all performance metrics.
 *
 * @example
 * const trades = await runBacktest({ symbol: "BTC_USDT", config });
 * const perf = getTradingPerformance(trades.tradeHistory);
 * console.log(`Win Rate: ${perf.winRate.toFixed(2)}%`);
 * console.log(`Total Profit: ${perf.totalProfit} USDT`);
 * console.log(`Profit Factor: ${perf.profitFactor}`);
 * console.log(`Quality Score: ${perf.goodForHighReturn}`);
 */
export function getTradingPerformance(
  trades: TradeHistory[]
): TradingPerformance {
  const startingBalanceUSDT = trades[0]?.currentAsset ?? 0;
  const finalBalance = trades.at(-1)?.currentBalance ?? 0;
  const gain =
    startingBalanceUSDT > 0
      ? ((finalBalance - startingBalanceUSDT) / startingBalanceUSDT) * 100
      : 0;

  const realizedTrades = trades.filter(
    (t) => typeof t.message === "string" && t.message.includes("[EXIT]"),
  );

  const winTrades = realizedTrades.filter((t) => t.profit > 0);
  const lossTrades = realizedTrades.filter((t) => t.profit < 0);
  const breakEvenTrades = realizedTrades.filter((t) => t.profit === 0);

  const totalProfit = realizedTrades.reduce((acc, t) => acc + t.profit, 0);
  const totalFee = trades.reduce((acc, t) => acc + t.fee, 0);
  const totalTax = trades.reduce((acc, t) => acc + t.tax, 0);
  const grossProfit = totalProfit + totalFee + totalTax;

  const winRate = realizedTrades.length
    ? (winTrades.length / realizedTrades.length) * 100
    : 0;

  const avgProfit = winTrades.length
    ? winTrades.reduce((acc, t) => acc + t.profit, 0) / winTrades.length
    : 0;

  const avgLoss = lossTrades.length
    ? lossTrades.reduce((acc, t) => acc + t.profit, 0) / lossTrades.length
    : 0;

  const lossSum = Math.abs(lossTrades.reduce((acc, t) => acc + t.profit, 0));
  const winSum = winTrades.reduce((acc, t) => acc + t.profit, 0);

  const profitFactor = lossSum === 0 ? "∞" : (winSum / lossSum).toFixed(2);

  // Max drawdown
  let balance = 0;
  let peak = 0;
  let maxDrawdown = 0;

  for (const trade of realizedTrades) {
    balance += trade.profit;
    if (balance > peak) peak = balance;
    const drawdown = peak - balance;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // === High Return Heuristic Scoring ===
  const normalizedNetProfit = Math.min(1, totalProfit / startingBalanceUSDT); // full score at 100% net profit

  const normalizedProfitFactor =
    profitFactor === "∞" ? 1 : Math.min(1, parseFloat(profitFactor) / 2); // cap at 2+
  const normalizedWinRate = Math.min(1, winRate / 70); // good if > 70%
  const normalizedDrawdown =
    1 - Math.min(1, maxDrawdown / (startingBalanceUSDT * 0.5)); // lower DD = better

  const goodForHighReturn = parseFloat(
    (
      0.35 * normalizedNetProfit +
      0.25 * normalizedProfitFactor +
      0.2 * normalizedWinRate +
      0.2 * normalizedDrawdown
    ).toFixed(2)
  );

  return {
    totalTrades: trades.length,
    closedTrades: realizedTrades.length,
    winTrades: winTrades.length,
    lossTrades: lossTrades.length,
    breakEvenTrades: breakEvenTrades.length,
    winRate,
    avgProfit,
    avgLoss,
    profitFactor,
    totalProfit,
    grossProfit,
    totalFee,
    totalTax,
    maxDrawdown,
    startingBalance: startingBalanceUSDT,
    finalBalance,
    gain,
    goodForHighReturn,
  };
}

/**
 * Analyzes performance from a list of trade history records and logs a performance summary.
 *
 * @param trades - Array of TradeHistory entries representing executed trades
 */
export function analyzePerformance(trades: TradeHistory[]): void {
  if (trades.length == 0) {
    tradeLog.error("No trades?");
    return;
  }
  const perf = getTradingPerformance(trades);

  tradeLog.log("📈 Trading Performance Summary");
  tradeLog.log("──────────────────────────────");

  tradeLog.log(`Total Events: ${perf.totalTrades}`);
  tradeLog.log(`Closed Trades: ${perf.closedTrades}`);
  tradeLog.log(
    `Win: ${perf.winTrades} | Loss: ${perf.lossTrades} | Break-even: ${perf.breakEvenTrades}`
  );
  tradeLog.log(`Win Rate: ${perf.winRate.toFixed(2)}%`);
  tradeLog.log(`Avg Profit per Win: ${perf.avgProfit.toFixed(2)} USDT`);
  tradeLog.log(`Avg Loss per Loss: ${perf.avgLoss.toFixed(2)} USDT`);
  tradeLog.log(`Profit Factor: ${perf.profitFactor}`);
  tradeLog.log("\n");

  tradeLog.log("Starting Balance:", perf.startingBalance.toFixed(2), "USDT");
  tradeLog.log("Final Balance:", perf.finalBalance.toFixed(2), "USDT");
  tradeLog.log("Final Gain (%):", perf.gain.toFixed(2), "%");
  tradeLog.log(`Total Net Profit: ${perf.totalProfit.toFixed(2)} USDT`);
  tradeLog.log(`Total Gross Profit: ${perf.grossProfit.toFixed(2)} USDT`);
  tradeLog.log(`Total Fee Paid: ${perf.totalFee.toFixed(2)} USDT`);
  tradeLog.log(`Total Tax Paid: ${perf.totalTax.toFixed(2)} USDT`);
  tradeLog.log(`Maximum Drawdown: ${perf.maxDrawdown.toFixed(2)} USDT`);
  tradeLog.log("──────────────────────────────\n\n");
}
