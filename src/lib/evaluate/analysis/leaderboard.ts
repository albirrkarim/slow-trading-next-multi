import { type Kline } from "@/lib/exchange/platform/tokocrypto";

import {
  detectBearMarkets,
  getBearMarketProofRatio,
  type BearRange,
} from "./leaderboard-utils/bear";

import fs from "fs-extra";
import {
  calculateEqualityScore,
  getEmptyBalanceStats,
  getMaxFloatingDrawdown,
  getMaxPortofolioDrawdown,
} from "./leaderboard-utils/utils";
import { type GetIncomePerMonthReturn } from "./stability";
import { computeOverallCapitalEfficiency } from "./leaderboard-utils/heldCapital";
import { computeMonthlyGain } from "./leaderboard-utils/monthlGain";
import { calculateSharpeRatio } from "./leaderboard-utils/sharpeRatio";
import type { Leaderboards } from "./leaderboard-utils/type-dynamic-report";
import type { Position } from "@/lib/trading/models";
import type { BacktestReturnDynamic } from "@/lib/dynamic/type-backtest";
import type { VolatilityPoint } from "@/lib/dynamic";

interface MakeLeaderboardProps {
  backtestReturn: BacktestReturnDynamic;
  BASE_COMMON_TIME_FOLDER?: string;
  stability: GetIncomePerMonthReturn;
  volatilityMap?: Record<string, VolatilityPoint[]>;
}

/**
 * Generate comprehensive leaderboard metrics for trading strategy evaluation
 * Created: 9 December 2025
 *
 * Computes multiple performance indicators including:
 * - Asset drawdown (risk metric)
 * - Bear market resilience
 * - Overall gain percentage
 * - Monthly profit consistency
 * - Capital allocation efficiency
 * - Sharpe ratio (risk-adjusted returns)
 *
 * @param {MakeLeaderboardProps} props - Configuration object
 * @param {BacktestReturnDynamic} props.backtestReturn - Complete backtest results with trade history
 * @param {string} props.BASE_COMMON_TIME_FOLDER - Path to historical klines data
 * @param {GetIncomePerMonthReturn} props.stability - Monthly stability metrics
 *
 * @returns {Promise<Leaderboards>} Comprehensive leaderboard metrics object
 *
 * @example
 * const leaderboard = await makeLeaderboard({
 *   backtestReturn,
 *   BASE_COMMON_TIME_FOLDER: 'storage/datasets/2year_5m',
 *   stability: stabilityMetrics
 * });
 * console.log(leaderboard.sharpeRatio); // 2.34
 */
export default async function makeLeaderboard({
  backtestReturn,
  BASE_COMMON_TIME_FOLDER,
  stability,
  volatilityMap,
}: MakeLeaderboardProps): Promise<Leaderboards> {
  // A. Max Asset Drawdown
  const maxPortfolioDrawdown = getMaxPortofolioDrawdown(
    backtestReturn.backtestPack.growthOvertime,
  );

  const openFloatingDrawdown = getMaxFloatingDrawdown(
    backtestReturn.backtestPack.growthOvertime,
  );

  // B. Bear Market Proof Ratio
  const bearMap: Record<string, BearRange[]> = {};
  for (const symbol of backtestReturn.symbols) {
    const points = volatilityMap?.[symbol];
    const klines = points
      ? points.map(
          (point) =>
            [
              point.t,
              String(point.p),
              String(point.p),
              String(point.p),
              String(point.p),
              "0",
              point.t,
              "0",
              0,
              "0",
              "0",
              "0",
              "0",
            ] as Kline,
        )
      : ((await fs.readJson(
          `${BASE_COMMON_TIME_FOLDER}/${symbol}.json`,
        )) as Kline[]);

    const ranges = detectBearMarkets(klines);

    bearMap[symbol] = ranges;
  }

  const allBearRanges = Object.values(bearMap).flat(); // flatten across all symbols
  const bearMarketProofRatio = getBearMarketProofRatio(
    backtestReturn.backtestPack.growthOvertime,
    allBearRanges,
  );

  // C. Gain Percent

  const gainPercent =
    ((backtestReturn.finalBalance -
      backtestReturn.startingBalanceUSDT +
      backtestReturn.dynamicTradeMemory.safeHaven) /
      backtestReturn.startingBalanceUSDT) *
    100;

  // D. Avg Monthly Profit Ratio
  const avgMonthlyProfitRatio =
    stability.avgMonthlyProfit / backtestReturn.startingBalanceUSDT;

  // E. Empty Balance
  const emptyBalance = getEmptyBalanceStats(
    backtestReturn.backtestPack.growthOvertime,
  );

  // F. Balance
  const tradeCountMap: Record<string, number> = {};
  for (const symbol of backtestReturn.symbols) {
    if (symbol == "BTC") {
      continue;
    }

    tradeCountMap[symbol] =
      backtestReturn.backtestPack.tradeHistoryMap[symbol].length;
  }

  const balanceTradesScore = calculateEqualityScore(tradeCountMap);

  // G. Captial Efficiency
  const capitalEfficiency = computeOverallCapitalEfficiency(
    backtestReturn.backtestPack.growthOvertime,
  );

  // H. Avg Monthly
  const monthlyGain = computeMonthlyGain(backtestReturn, stability);

  // I. Sharpe Ratio
  const sharpeRatio = calculateSharpeRatio(
    backtestReturn.backtestPack.growthOvertime,
  );

  const closedPositions: Position[] = Object.values(
    backtestReturn.backtestPack.modelMemoryMap,
  ).flatMap((m) => m.positionsSell ?? []);

  const wins = closedPositions.filter((p) => (p.pnl.netUsdt ?? 0) > 0).length;
  const totalTrades = closedPositions.length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  return {
    winRate,
    maxPortfolioDrawdown,
    openFloatingDrawdown,
    bearMarketProofRatio,
    gainPercent,
    avgMonthlyProfitRatio,
    emptyBalance,
    balanceTradesScore,
    capitalEfficiency,
    monthlyGain,
    sharpeRatio,
  };
}
