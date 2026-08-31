import moment from "moment";
import { type TradeHistory } from "../../dynamic/backtest-volatility/type";
import { tradeLog } from "@/lib/trading/helper/log";

interface DayTrade {
  date: number;
  profit: number;
  trade: TradeHistory;
}

interface MonthlyData {
  currentBalance: number;

  total: number;

  trades: string[];

  tradesInfos: DayTrade[];
}

/**
 * {
 *    1:{
 *
 *    }
 * }
 */
type MonthlyDataMap = Record<string, MonthlyData>;

export interface GetIncomePerMonthReturn {
  months: string[];
  monthlyProfitMap: MonthlyDataMap;
  avgMonthlyProfit: number;
}

/**
 * Analyzes trade history and aggregates profit/loss by month.
 *
 * This function groups all trades by year-month (YYYY-MM format) and calculates:
 * - Total profit per month
 * - Last balance of the month (from final trade)
 * - Trade timestamps and profit details
 *
 * Useful for monthly income reporting and consistency analysis.
 *
 * @param {TradeHistory[]} tradeHistory - Array of all trades (BUY and SELL).
 * @returns {GetIncomePerMonthReturn} Object with month list, profit map, and average monthly profit.
 *
 * @example
 * const result = getIncomePerMonth(backtestResult.tradeHistory);
 * console.log(`Months: ${result.months.join(", ")}`);
 * console.log(`Avg Monthly: $${result.avgMonthlyProfit.toFixed(2)}`);
 * result.months.forEach(month => {
 *   const data = result.monthlyProfitMap[month];
 *   console.log(`${month}: $${data.total.toFixed(2)} (${data.trades.length} trades)`);
 * });
 */
export function getIncomePerMonth(
  tradeHistory: TradeHistory[]
): GetIncomePerMonthReturn {
  // Group trades by year-month
  const monthlyProfitMap: MonthlyDataMap = {};

  for (const trade of tradeHistory) {
    const time = trade.time; // timestamp (ms or s)
    const parsed = moment(time);
    const month = parsed.format("YYYY-MM");

    if (!monthlyProfitMap[month]) {
      monthlyProfitMap[month] = {
        total: 0,
        currentBalance: 0,
        trades: [],
        tradesInfos: [],
      };
    }

    const profit = trade.profit || 0;
    monthlyProfitMap[month].total += profit;
    // current balance is the balance of the last selling assset of the trade History
    monthlyProfitMap[month].currentBalance = trade.currentBalance || 0;

    // Display realized exits, not raw order side. Futures short exits are BUY rows.
    const isRealizedExit =
      typeof trade.message === "string" && trade.message.includes("[EXIT]");

    if (isRealizedExit || profit !== 0) {
      monthlyProfitMap[month].trades.push(
        `(${parsed.format("DD")}) $${profit.toFixed(2)} ${profit < 0 ? trade.message : ""
        }`
      );

      monthlyProfitMap[month].tradesInfos.push({
        date: parseInt(parsed.format("DD")),
        profit,
        trade,
      });
    }
  }

  const months = Object.keys(monthlyProfitMap);
  const totalProfit = months.reduce(
    (sum, month) => sum + monthlyProfitMap[month].total,
    0
  );
  const avgMonthlyProfit =
    months.length === 0 ? 0 : totalProfit / months.length;

  return {
    months,
    monthlyProfitMap,
    avgMonthlyProfit,
  };
}

/**
 * Analyzes and logs monthly income from trade history.
 *
 * This function calls getIncomePerMonth() internally and then prints
 * a formatted report of monthly profits, trade counts, and average performance.
 *
 * Output includes:
 * - Monthly breakdown with profit and trade list
 * - Current balance at end of each month
 * - Average monthly profit across entire period
 *
 * @param {TradeHistory[]} tradeHistory - Array of trade records from backtest or live trading.
 * @returns {MonthlyDataMap} Monthly profit map keyed by "YYYY-MM".
 *
 * @example
 * const monthlyData = calculateIncomePerMonth(trades);
 * // Logs formatted table:
 * // 📈 Monthly Profits & Trades
 * // ──────────────────────────────
 * // 2025-01 : 1250.50 - [15:30, 18:45, ...]
 * // Month currentBalance 51250.50
 * // ...
 */
export function calculateIncomePerMonth(
  tradeHistory: TradeHistory[]
): MonthlyDataMap {
  const { months, monthlyProfitMap, avgMonthlyProfit } =
    getIncomePerMonth(tradeHistory);

  tradeLog.log("📈 Monthly Profits & Trades");
  tradeLog.log("──────────────────────────────");
  for (const month of months) {
    const { total, currentBalance, trades } = monthlyProfitMap[month];
    tradeLog.log(`${month} : ${total.toFixed(2)} - [${trades.join(", ")}]`);

    tradeLog.log("Month currentBalance ", currentBalance);
  }
  tradeLog.log("──────────────────────────────");
  tradeLog.log("Average Monthly Profit (USDT):", avgMonthlyProfit.toFixed(2));
  tradeLog.log("──────────────────────────────\n\n");

  return monthlyProfitMap;
}

/**
 * Merge monthly eval from every coin
 * @param maps
 */
function mergeMonthlyDataMaps(maps: MonthlyDataMap[]): MonthlyDataMap {
  const merged: MonthlyDataMap = {};

  for (const map of maps) {
    for (const month in map) {
      if (!merged[month]) {
        merged[month] = {
          total: 0,
          currentBalance: 0,
          trades: [],
          tradesInfos: [],
        };
      }

      // sum up
      merged[month].currentBalance += map[month].currentBalance;

      merged[month].total += map[month].total;

      merged[month].trades.push(...map[month].trades);
      merged[month].tradesInfos.push(...map[month].tradesInfos);
    }
  }

  return merged;
}

/**
 * Used in ride.ts
 * @param monthlyDataMaps
 */
export function showAllMonth(monthlyDataMaps: MonthlyDataMap[] = []) {
  const mergedMap = mergeMonthlyDataMaps(monthlyDataMaps);

  const months = Object.keys(mergedMap).sort();
  let finalBalance = 0;
  let totalProfit = 0;

  tradeLog.log("📊 Merged Monthly Profits & Trades");
  tradeLog.log("──────────────────────────────");
  for (const month of months) {
    const { total, currentBalance, tradesInfos } = mergedMap[month];

    tradeLog.log(`\n${month} : ${total.toFixed(2)}`);

    tradeLog.log("totalProfit ", totalProfit.toFixed(2));
    tradeLog.log("currentBalance ", currentBalance.toFixed(2));

    // Group trades by date → store profit, trade count, wins, and losses
    const dailyMap: Record<
      number,
      { profit: number; count: number; win: number; loss: number }
    > = {};

    for (const info of tradesInfos) {
      if (!dailyMap[info.date]) {
        dailyMap[info.date] = { profit: 0, count: 0, win: 0, loss: 0 };
      }
      dailyMap[info.date].profit += info.profit;
      dailyMap[info.date].count += 1;
      if (info.profit > 0) dailyMap[info.date].win += 1;
      else if (info.profit < 0) dailyMap[info.date].loss += 1;
    }

    // Convert to sorted array
    const dailyArray = Object.entries(dailyMap)
      .map(([day, stats]) => ({
        date: Number(day),
        ...stats,
      }))
      .sort((a, b) => a.date - b.date);

    // Calculate running total
    let monthRunningTotal = 0;
    tradeLog.log(" Day | Trades | Win | Loss | Profit   | Running Total");
    tradeLog.log("-----|--------|-----|------|----------|--------------");
    for (const dayData of dailyArray) {
      monthRunningTotal += dayData.profit;
      tradeLog.log(
        `${String(dayData.date).padStart(2, "0")}  | ${String(
          dayData.count
        ).padStart(6)} | ${String(dayData.win).padStart(3)} | ${String(
          dayData.loss
        ).padStart(4)} | ${dayData.profit
          .toFixed(2)
          .padStart(8)} | ${monthRunningTotal.toFixed(2).padStart(12)}`
      );
    }

    // sum of all current balance of all coins
    finalBalance = currentBalance;

    // sum of all profit
    totalProfit += total;
  }

  tradeLog.log("──────────────────────────────");
  const avgPerMonth = months.length > 0 ? finalBalance / months.length : 0;
  tradeLog.log(`Average Monthly Profit (USDT): ${avgPerMonth.toFixed(2)}`);
  tradeLog.log(`Final Balance (USDT): ${finalBalance.toFixed(2)}`);
  tradeLog.log("──────────────────────────────");

  return finalBalance;
}
