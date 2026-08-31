import moment from "moment";
import type { TradeHistory } from "../../dynamic/backtest-volatility/type";
import { tradeLog } from "@/lib/trading/helper/log";

/**
 * Performs a behavioral analysis on a list of past trades, identifying trading patterns,
 * time preferences, holding durations, and execution biases.
 *
 * This function is especially useful for reviewing how consistently and effectively a trading strategy
 * was applied over time. It prints insights like the most active trading hour, average holding duration,
 * trade frequency, and more — helping you reflect on your habits and improve decision-making.
 *
 * @param trades - Array of trade records (`TradeHistory`) generated from backtesting or live execution.
 *
 * @example
 * analyzeTradeBehavior(myBacktestResult.tradeHistory);
 *
 * @remarks
 * Key concepts analyzed:
 * - **Trade Frequency**: Number of total trades, buys, and sells.
 * - **Active Hours**: Detects which hour of the day most trades happen.
 * - **Holding Time**: Average duration between entering and exiting a position.
 * - **Time Distribution**: Histogram-style bar chart for trading activity by hour.
 */
export function analyzeTradeBehavior(trades: TradeHistory[]): void {
  if (trades.length === 0) {
    tradeLog.log("No trade data available for behavior analysis.");
    return;
  }

  const stats = getTradeBehaviorStats(trades);

  tradeLog.log("📊 Trade Behavior & Pattern Analysis");
  tradeLog.log("─────────────────────────────────────");

  tradeLog.log(
    `Total Trades: ${stats.totalTrades} (BUY: ${stats.buyTrades} | SELL : ${stats.sellTrades})`
  );
  tradeLog.log(
    `Trading Duration: ${moment
      .duration(stats.durationDays, "days")
      .humanize()}`
  );
  tradeLog.log(`Avg Trades per Day: ${stats.avgTradesPerDay.toFixed(2)}`);

  const avgHold = moment
    .duration(stats.avgHoldingDurationMin, "minutes")
    .humanize();
  const minHold = moment
    .duration(stats.minHoldingDurationMin, "minutes")
    .humanize();
  const maxHold = moment
    .duration(stats.maxHoldingDurationMin, "minutes")
    .humanize();

  tradeLog.log(
    `Holding Duration: Max: ${maxHold} | Avg: ${avgHold} | Min: ${minHold}`
  );
  tradeLog.log("─────────────────────────────────────\n");

  // Optional: Time of day analysis
  // const tradesByHour: Record<number, number> = {};
  // // Count trades per hour
  // for (const trade of trades) {
  //   const hour = moment(trade.time).hour();
  //   tradesByHour[hour] = (tradesByHour[hour] || 0) + 1;
  // }

  // const peakHour = Object.entries(tradesByHour).reduce<[string, number]>(
  //   (max, entry) => (entry[1] > max[1] ? entry : max),
  //   ["0", 0]
  // )[0];

  // tradeLog.log(`Most Active Trading Hour: ${peakHour}:00`);

  // tradeLog.log("\n⏰ Trade Distribution by Hour (0–23):");
  // for (let hour = 0; hour < 24; hour++) {
  //   const count = tradesByHour[hour] || 0;
  //   const bar = "█".repeat(
  //     Math.round((count / Math.max(...Object.values(tradesByHour))) * 20)
  //   );
  //   tradeLog.log(`${hour.toString().padStart(2, "0")}: ${bar} ${count}`);
  // }

  // tradeLog.log("─────────────────────────────────────\n");
}

interface TradeBehaviorStats {
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  durationDays: number;
  avgTradesPerDay: number;
  avgHoldingDurationMin: number;
  minHoldingDurationMin: number;
  maxHoldingDurationMin: number;
}

function getTradeBehaviorStats(trades: TradeHistory[]): TradeBehaviorStats {
  const firstTradeTime = trades[0].time;
  const lastTradeTime = trades[trades.length - 1].time;
  const durationMinutes = (lastTradeTime - firstTradeTime) / (1000 * 60);
  const durationHours = durationMinutes / 60;
  const durationDays = durationHours / 24;

  const buyTrades = trades.filter((t) => t.side === "BUY");
  const sellTrades = trades.filter((t) => t.side === "SELL");

  const holdingDurations: number[] = [];

  for (let i = 0; i < trades.length - 1; i++) {
    const buy = trades[i];
    const sell = trades[i + 1];
    if (buy.side === "BUY" && sell.side === "SELL") {
      const holdTimeMinutes = (sell.time - buy.time) / (1000 * 60);
      holdingDurations.push(holdTimeMinutes);
    }
  }

  const avgHoldingDurationMin =
    holdingDurations.reduce((acc, v) => acc + v, 0) /
    (holdingDurations.length || 1);
  const maxHoldingDurationMin = Math.max(...holdingDurations);
  const minHoldingDurationMin = Math.min(...holdingDurations);

  return {
    totalTrades: trades.length,
    buyTrades: buyTrades.length,
    sellTrades: sellTrades.length,
    durationDays,
    avgTradesPerDay: trades.length / durationDays,
    avgHoldingDurationMin,
    minHoldingDurationMin,
    maxHoldingDurationMin,
  };
}
